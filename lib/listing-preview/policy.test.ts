import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {expect, it, vi} from 'vitest';
import {LEGACY_POLICY, requirePolicyVersion, SELLER_ATTESTED_POLICY} from './policy';
import {makePreview, testSign} from '@/tests/previewFixture';
import {checkpointBytes, commitmentBytes, disclosureBytes, platformBytes, proofBytes, verifyManifest, verifySample, verifyScanAttestation} from './verifier';
import {b64, hex, jcs, sha, utf8} from './primitives';
import type {Descriptor, Json} from './types';

const fixturePath = 'tests/fixtures/preview/aim_preview_policy_v2.json';
const fixtureBytes = readFileSync(fixturePath);
const fixture = JSON.parse(fixtureBytes.toString()) as {
  scan_policy: string; scan_policy_version: string; scan_verdict: string;
  rules: string[]; reason_codes: string[];
  legacy_accepted: {scan_policy: string; scan_policy_version: string};
  content_examples_that_pass: string[];
};

it('pins the canonical producer v2 seller-attested fixture and its real shape', () => {
  const pins = JSON.parse(readFileSync('tests/fixtures/preview/preview-fixture-manifest.json', 'utf8')) as {path: string; sha256: string}[];
  const pin = pins.find(candidate => candidate.path.endsWith('/aim_preview_policy_v2.json'));
  expect(createHash('sha256').update(fixtureBytes).digest('hex')).toBe(pin?.sha256);
  expect(pin?.sha256).toBe('6efb7dbe71f1c0b05c5fec3eff56646a9eb0143c172b9dc8eb5084024f6423dc');
  expect([fixture.scan_policy, fixture.scan_policy_version]).toEqual([SELLER_ATTESTED_POLICY, '2.0.0']);
  expect(fixture).toMatchObject({scan_verdict: 'passed', rules: [], reason_codes: [],
    legacy_accepted: {scan_policy: LEGACY_POLICY, scan_policy_version: '1.0.0'}});
});

it.each([
  [LEGACY_POLICY, '1.0.0', true],
  [SELLER_ATTESTED_POLICY, '2.0.0', true],
  [LEGACY_POLICY, '2.0.0', false],
  [SELLER_ATTESTED_POLICY, '1.0.0', false],
  ['aim-preview-policy-v3', '3.0.0', false],
] as const)('accepts only the exact known policy/version pair %s %s', (policy, version, accepted) => {
  const result = () => requirePolicyVersion(policy, version);
  if (accepted) expect(result).not.toThrow(); else expect(result).toThrow('scan_policy_unknown');
});

const text: Descriptor[] = [['value', 'string', false, {}]];
async function verify(rows: Record<string, Json>[], schema: Descriptor[] = text, policy?: Parameters<typeof makePreview>[2]) {
  const f = await makePreview(rows, schema, policy);
  return verifySample(f.manifest, f.raw, {listingId: f.manifest.listing_id, keys: f.keys, now: () => f.now,
    readCurrent: async () => f.manifest, signal: new AbortController().signal});
}

it('displays ordinary seller content without any content corpus', async () => {
  const values = [...fixture.content_examples_that_pass];
  values.push(Array(2000).fill('word').join(' '), '\ud800');
  for (const value of values) await expect(verify([{value}])).resolves.toHaveProperty('entries.0.row.value', value);
});

it('accepts already-published legacy v1 attestations without scanning their rows', async () => {
  await expect(verify([{value: 'seller@example.test =SUM(A1)'}], text,
    {scan_policy: 'aim-preview-policy-v1', scan_policy_version: '1.0.0'})).resolves.toHaveProperty('entries');
});

it('refuses a signed but incorrectly bound scan-attestation digest', async () => {
  const f = await makePreview([{value: 'barley'}], text), e = f.manifest.approval.platform_envelope;
  e.binding.scan_attestation_digest = '0'.repeat(64);
  e.seller_signature = testSign(disclosureBytes(e.binding)); e.signature = testSign(platformBytes(e));
  await expect(verifyManifest(f.manifest, f.keys, f.manifest.listing_id, f.now)).rejects.toThrow('scan_mismatch');
});

it('returns a fixed reason for an empty proof array', async () => {
  const f = await makePreview([{value: 'barley'}], text);
  await expect(verifyScanAttestation({...f.manifest, proofs: []})).rejects.toThrow('scan_attestation_invalid');
});

it.each(['scan_policy', 'scan_policy_version', 'scan_verdict', 'sampled_leaf_list_digest', 'signature'])('refuses modified producer attestation %s', async field => {
  const f = await makePreview([{value: 'barley'}], text);
  const proof = f.manifest.proofs[0] as unknown as Record<string, unknown>;
  proof[field] = field === 'signature' ? 'A'.repeat(86) : field === 'sampled_leaf_list_digest' ? 'A'.repeat(43) : 'invalid';
  await expect(verifyManifest(f.manifest, f.keys, f.manifest.listing_id, f.now)).rejects.toThrow();
});

it('hides all rows when a validly signed attestation names a different fetched leaf set', async () => {
  const f = await makePreview([{value: 'barley'}], text), e = f.manifest.approval.platform_envelope;
  const different = b64(await sha(utf8('aim-preview-sampled-leaves-v1\0'), jcs(['A'.repeat(43)])));
  e.binding.sampled_leaf_list_digest = different;
  for (const proof of f.manifest.proofs) proof.sampled_leaf_list_digest = different;
  for (const proof of f.manifest.proofs) proof.signature = testSign(proofBytes(f.manifest.commitment, proof));
  e.binding.scan_attestation_digest = hex(await sha(utf8('aim-preview-scan-attestation-v1\0'), jcs(f.manifest.proofs)));
  f.manifest.commitment.seller_signature = testSign(commitmentBytes(f.manifest.commitment));
  f.manifest.log_evidence.entry.seller_signature = f.manifest.commitment.seller_signature;
  f.manifest.checkpoint.root_hash = b64(await sha(utf8('\0aim-log-leaf-v1\0'), jcs(f.manifest.log_evidence.entry)));
  f.manifest.checkpoint.signature = testSign(checkpointBytes(f.manifest.checkpoint));
  e.seller_signature = testSign(disclosureBytes(e.binding)); e.signature = testSign(platformBytes(e));
  const readCurrent = vi.fn(async () => f.manifest);
  await expect(verifySample(f.manifest, f.raw, {listingId: f.manifest.listing_id, keys: f.keys, now: () => f.now,
    readCurrent, signal: new AbortController().signal})).rejects.toThrow('sampled_list_mismatch');
  expect(readCurrent).not.toHaveBeenCalled();
});
