import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {expect, it} from 'vitest';
import {checkPolicyText, scanLocalPreview} from './policy';
import {makePreview, testSign} from '@/tests/previewFixture';
import {disclosureBytes, platformBytes, verifyManifest, verifySample} from './verifier';
import type {Descriptor, Json} from './types';

const path = 'tests/fixtures/preview/aim-preview-policy-v1-deterministic-vectors';
const bytes = readFileSync(path + '.json');
const corpus = JSON.parse(bytes.toString()) as {vectors: {id: string; text: string; numeric: boolean; reason: string | null}[]};
it('pins the cross-repo deterministic fixture SHA', () => {
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(readFileSync(path + '.sha256', 'utf8').split(' ')[0]);
});
for (const v of corpus.vectors) it(`deterministic producer vector ${v.id}`, async () => {
  if (v.reason) expect(() => checkPolicyText(v.text, v.numeric)).toThrow(new Error(v.reason));
  else expect(() => checkPolicyText(v.text, v.numeric)).not.toThrow();
  const scanned = scanLocalPreview([{proofId: v.id, row: {value: v.text}, cells: {}}], new AbortController().signal,
    [['value', v.numeric ? 'decimal' : 'string', false, v.numeric ? {precision: 5, scale: 2} : {}]]);
  if (v.reason) await expect(scanned).rejects.toThrow(new Error(v.reason));
  else await expect(scanned).resolves.toBeUndefined();
});
const text: Descriptor[] = [['value', 'string', false, {}]];
const nested: Descriptor[] = [['value', 'object', false, {object_fields: [{name: 'child', type: 'array', nullable: false, type_parameters: {element_type: {type: 'string', type_parameters: {}}}}]}]];
async function verify(rows: Record<string, Json>[], schema: Descriptor[]) {
  const f = await makePreview(rows, schema);
  return verifySample(f.manifest, f.raw, {listingId: f.manifest.listing_id, keys: f.keys, now: () => f.now,
    scan: scanLocalPreview, readCurrent: async () => f.manifest, signal: new AbortController().signal});
}
it('deterministic scan refuses any unsafe complete row before issuing a handle', async () => {
  await expect(verify([{value: 'barley'}, {value: 'password=synthetic'}], text)).rejects.toThrow('secret');
});
it('scans keys, nested values and every array element', async () => {
  await expect(verify([{'password=synthetic': 'barley'}], [['password=synthetic', 'string', false, {}]])).rejects.toThrow('secret');
  await expect(verify([{value: {child: ['barley', 'test@example.com']}}], nested)).rejects.toThrow('personal_data');
  const schema: Descriptor[] = [['value', 'object', false, {object_fields: [{name: '=bad', type: 'string', nullable: false, type_parameters: {}}]}]];
  await expect(verify([{value: {'=bad': 'barley'}}], schema)).rejects.toThrow('formula');
});
it('scans the original fetched text before normalization', async () => {
  await expect(verify([{value: 'a'.repeat(499) + 'e\u0301'}], text)).rejects.toThrow('long_prose');
});
it('preserves descriptor-proven numeric identity recursively', async () => {
  const schema: Descriptor[] = [['value', 'array', false, {element_type: {type: 'decimal', type_parameters: {precision: 5, scale: 2}}}]];
  await expect(verify([{value: ['-12.5', '1.2']}], schema)).resolves.toHaveProperty('entries');
  await expect(verify([{value: 'barley'}, {value: 'oats'}], text)).resolves.toHaveProperty('entries');
});
it('cancellation refuses the deterministic scan', async () => {
  const controller = new AbortController(); controller.abort();
  await expect(scanLocalPreview([{proofId: 'synthetic', row: {value: 'barley'}, cells: {}}], controller.signal, text)).rejects.toThrow('cancelled');
});
it('attestation check refuses a signed but incorrectly bound scan digest', async () => {
  const f = await makePreview([{value: 'barley'}], text), e = f.manifest.approval.platform_envelope;
  e.binding.scan_attestation_digest = '0'.repeat(64);
  e.seller_signature = testSign(disclosureBytes(e.binding)); e.signature = testSign(platformBytes(e));
  await expect(verifyManifest(f.manifest, f.keys, f.manifest.listing_id, f.now)).rejects.toThrow('scan_mismatch');
});
it.each(['scan_policy', 'scan_policy_version', 'scan_verdict', 'sampled_leaf_list_digest', 'signature'])('refuses modified producer attestation %s', async field => {
  const f = await makePreview([{value: 'barley'}], text);
  const proof = f.manifest.proofs[0] as unknown as Record<string, unknown>;
  proof[field] = field === 'signature' ? 'A'.repeat(86) : field === 'sampled_leaf_list_digest' ? 'A'.repeat(43) : 'invalid';
  await expect(verifyManifest(f.manifest, f.keys, f.manifest.listing_id, f.now)).rejects.toThrow();
});
it('refuses a signed binding to a different sampled leaf list', async () => {
  const f = await makePreview([{value: 'barley'}], text), e = f.manifest.approval.platform_envelope;
  e.binding.sampled_leaf_list_digest = 'A'.repeat(43);
  e.seller_signature = testSign(disclosureBytes(e.binding)); e.signature = testSign(platformBytes(e));
  await expect(verifyManifest(f.manifest, f.keys, f.manifest.listing_id, f.now)).rejects.toThrow('sampled_list_mismatch');
});

it('scans fields outside the displayed column selection', async () => {
  const f = await makePreview([{hidden: 'password=synthetic', value: 'barley'}], [['hidden', 'string', false, {}], ...text]);
  const e = f.manifest.approval.platform_envelope;
  e.binding.selected_fields = ['value']; f.manifest.selected_fields = ['value'];
  f.manifest.columns = [{name: 'value', type: 'string'}];
  e.seller_signature = testSign(disclosureBytes(e.binding)); e.signature = testSign(platformBytes(e));
  await expect(verifySample(f.manifest, f.raw, {listingId: f.manifest.listing_id, keys: f.keys, now: () => f.now,
    scan: scanLocalPreview, readCurrent: async () => f.manifest, signal: new AbortController().signal})).rejects.toThrow('secret');
});
