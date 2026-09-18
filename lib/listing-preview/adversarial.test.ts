import {beforeAll, describe, expect, it, vi} from 'vitest';
import {makePreview, testSign, verifiedFixture} from '@/tests/previewFixture';
import {canonicalRow, schemaDescriptors} from './canonical-row';
import {b64, canonical, jcs, parseJson, unb64, utf8} from './primitives';
import {envelopeBudget, fresh, isVerifiedSample, platformBytes, verifyManifest, verifyPackage, verifySample} from './verifier';
import {admitPackageUrl, boundedBody} from './transport';
import {tableRenderer} from './registry';
import type {Descriptor, Manifest, PlatformEnvelope} from './types';

let f: Awaited<ReturnType<typeof makePreview>>;
beforeAll(async () => {f = await makePreview();});
const verify = (m: Manifest) => verifyManifest(m, f.keys, f.manifest.listing_id, f.now);
function resign(e: PlatformEnvelope) {e.signature = testSign(platformBytes(e));}
describe('all verification gates before a handle', () => {
  it('issues only an immutable fully checked handle', async () => {
    const {sample} = await verifiedFixture(); expect(isVerifiedSample(sample)).toBe(true);
    expect(isVerifiedSample(JSON.parse(JSON.stringify(sample)))).toBe(false);
    expect(Object.isFrozen(sample.entries[0].cells)).toBe(true);
  });
  it('does not render before policy and the final current read', async () => {
    let release!: () => void; const gate = new Promise<void>(r => {release = r;});
    const publish = vi.fn(), renderer = tableRenderer(publish), readCurrent = vi.fn(async () => f.manifest);
    const promise = verifySample(f.manifest, f.raw, {listingId: f.manifest.listing_id, keys: f.keys, now: () => f.now, scan: () => gate, readCurrent, signal: new AbortController().signal});
    await new Promise(r => setTimeout(r, 50)); expect(readCurrent).not.toHaveBeenCalled(); expect(publish).not.toHaveBeenCalled();
    release(); const sample = await promise; renderer.mount(sample.manifest as Manifest, sample); expect(publish).toHaveBeenCalledWith(sample);
    renderer.clear(); expect(publish).toHaveBeenLastCalledWith(null); renderer.dispose(); renderer.mount(sample.manifest as Manifest, sample); expect(publish).toHaveBeenLastCalledWith(null);
  });
  it('rejects scan failure, aborts and current-pointer races without a handle', async () => {
    const opts = {listingId: f.manifest.listing_id, keys: f.keys, now: () => f.now, scan: async () => undefined, readCurrent: async () => f.manifest, signal: new AbortController().signal};
    await expect(verifySample(f.manifest, f.raw, {...opts, scan: async () => {throw new Error('detector_unavailable');}})).rejects.toThrow('detector_unavailable');
    await expect(verifySample(f.manifest, f.raw, {...opts, readCurrent: async () => null})).rejects.toThrow();
    const controller = new AbortController(); controller.abort(); await expect(verifySample(f.manifest, f.raw, {...opts, signal: controller.signal})).rejects.toThrow('cancelled');
  });
  it('rejects changing every signed binding field without resigning', async () => {
    for (const key of Object.keys(f.manifest.approval.platform_envelope.binding)) {
      const m = structuredClone(f.manifest), b = m.approval.platform_envelope.binding as unknown as Record<string, unknown>;
      b[key] = b[key] === null ? 'changed' : typeof b[key] === 'boolean' ? !b[key] : typeof b[key] === 'number' ? Number(b[key]) + 1 : Array.isArray(b[key]) ? [...b[key] as unknown[], 'changed'] : `${b[key]}x`;
      await expect(verify(m), key).rejects.toThrow();
    }
  });
  it('rejects every manifest binding mismatch', async () => {
    for (const key of ['listing_id', 'listing_version_id', 'content_revision', 'source_revision', 'summary_approval_id', 'summary_hash', 'render_hash', 'disclosure_version', 'sample_hash', 'aggregate_hash', 'preview_type', 'content_type', 'selected_fields', 'schema_descriptors', 'last_attested_by_seller_at']) {
      const m = structuredClone(f.manifest) as unknown as Record<string, unknown>; m[key] = m[key] === null ? '00000000-0000-4000-8000-999999999999' : null;
      await expect(verify(m as unknown as Manifest), key).rejects.toThrow();
    }
  });
  it.each(['revoked', 'rotated', 'fingerprint', 'missing', 'extra', 'duplicate', 'rebound', 'future', 'expired'])('rejects authenticated seller key admission failure %s', async failure => {
    const m = structuredClone(f.manifest), e = m.approval.platform_envelope, k = e.signer_keys[0];
    if (failure === 'revoked' || failure === 'rotated') k.status = failure;
    if (failure === 'fingerprint') k.fingerprint = 'a'.repeat(64);
    if (failure === 'missing') k.key_id = '00000000-0000-4000-8000-999999999999';
    if (failure === 'extra') e.signer_keys.push({...k, key_id: '00000000-0000-4000-8000-999999999999'});
    if (failure === 'duplicate') {e.signer_keys.push({...k}); await expect(verify(m)).rejects.toThrow(); return;}
    if (failure === 'rebound') k.public_key = b64(new Uint8Array(32));
    if (failure === 'future') k.valid_from = '2026-09-18T00:00:00.000000Z';
    if (failure === 'expired') k.valid_until = '2026-09-17T00:00:01.000000Z';
    resign(e); await expect(verify(m)).rejects.toThrow();
  });
  it('rejects unknown and aliased platform keys and bad seller signatures', async () => {
    await expect(verifyManifest(f.manifest, {}, f.manifest.listing_id, f.now)).rejects.toThrow();
    await expect(verifyManifest(f.manifest, {...f.keys, alias: Object.values(f.keys)[0]}, f.manifest.listing_id, f.now)).rejects.toThrow('platform_key_alias');
    const m = structuredClone(f.manifest); m.approval.platform_envelope.seller_signature = b64(new Uint8Array(64)); resign(m.approval.platform_envelope);
    await expect(verify(m)).rejects.toThrow('disclosure_signature_invalid');
  });
  it.each(['signature', 'key_id', 'root_hash', 'tree_size', 'public_key_algorithm'])('rejects checkpoint %s substitution', async key => {
    const m = structuredClone(f.manifest), cp = m.checkpoint as unknown as Record<string, unknown>;
    cp[key] = key === 'tree_size' ? 2 : key === 'signature' ? b64(new Uint8Array(64)) : key === 'root_hash' ? b64(new Uint8Array(32)) : 'wrong';
    await expect(verify(m)).rejects.toThrow();
  });
  it('rejects wrong rows, duplicate ordinals/indices and projected rows', async () => {
    for (const mutation of ['row', 'ordinal', 'index', 'projection', 'unknown', 'order']) {
      const p = structuredClone(f.pack);
      if (mutation === 'row') p.entries[0].row.name = 'changed';
      if (mutation === 'ordinal') p.entries[0].duplicate_ordinal += 1;
      if (mutation === 'index') p.entries[1].leaf_index = p.entries[0].leaf_index;
      if (mutation === 'projection') delete p.entries[0].row.id;
      if (mutation === 'unknown') p.entries[0].row.extra = 'hidden';
      if (mutation === 'order') p.entries.reverse();
      await expect(verifyPackage(jcs(p), f.manifest), mutation).rejects.toThrow();
    }
  });
  it('rejects descriptors altered before canonicalizing rows', async () => {
    const m = structuredClone(f.manifest); m.schema_descriptors[0][1] = 'string'; await expect(verify(m)).rejects.toThrow();
    expect(() => schemaDescriptors([['x', 'binary', true, {}]])).toThrow();
  });
});
describe('conjunctive bounds and freshness', () => {
  it('checks 100/101 rows and 25/26 complete fields', async () => {
    const p = structuredClone(f.pack); p.entries = Array(101).fill(p.entries[0]);
    await expect(verifyPackage(jcs(p), {...f.manifest, proofs: Array(101).fill(f.manifest.proofs[0])})).rejects.toThrow('row_limit');
    const schema = Array.from({length: 26}, (_, i) => [`field${String(i).padStart(2, '0')}`, 'string', true, {}]) as Descriptor[];
    await expect(verifyPackage(f.raw, {...f.manifest, schema_descriptors: schema})).rejects.toThrow('field_limit');
    const twentyFive = await makePreview([Object.fromEntries(schema.slice(0, 25).map(d => [d[0], 'oats']))], schema.slice(0, 25));
    expect(await verifyPackage(twentyFive.raw, twentyFive.manifest)).toHaveLength(1);
    const hundred = await makePreview(Array.from({length: 100}, (_, i) => ({id: String(i), name: 'oats'})));
    expect(await verifyPackage(hundred.raw, hundred.manifest)).toHaveLength(100);
  });
  it.each([249999, 250000, 250001])('checks %i canonical bytes', async size => {
    const overhead = utf8(canonicalRow({text: ''}, [['text', 'string', false, {}]]).text).length;
    const large = await makePreview([{text: 'x'.repeat(size - overhead)}], [['text', 'string', false, {}]]);
    if (size <= 250000) expect(await verifyPackage(large.raw, large.manifest)).toHaveLength(1);
    else await expect(verifyPackage(large.raw, large.manifest)).rejects.toThrow('canonical_byte_limit');
  });
  it('checks exact received envelope and manifest byte ceilings before parse', async () => {
    expect(() => parseJson(utf8('0' + ' '.repeat(1048575)), 1048576)).not.toThrow();
    expect(() => parseJson(utf8('0' + ' '.repeat(1048576)), 1048576)).toThrow('byte_limit');
    expect(() => parseJson(utf8('0' + ' '.repeat(262143)), 262144)).not.toThrow();
    expect(() => parseJson(utf8('0' + ' '.repeat(262144)), 262144)).toThrow('byte_limit');
  });
  it('checks full-envelope node 10000/10001 and depth 16/17 bounds', () => {
    expect(envelopeBudget(Array(9999).fill(null))).toBe(10000);
    expect(() => envelopeBudget(Array(10000).fill(null))).toThrow('envelope_bound');
    let v: unknown = null; for (let i = 0; i < 16; i++) v = [v]; expect(envelopeBudget(v)).toBe(17);
    expect(() => envelopeBudget([v])).toThrow('envelope_bound');
  });
  it('rejects deadline/clock uncertainty and distinguishes stale from expired', () => {
    expect(() => fresh(f.manifest, f.now)).not.toThrow();
    expect(() => fresh(f.manifest, Date.parse(f.manifest.valid_until))).toThrow('manifest_expired');
    expect(() => fresh(f.manifest, Date.parse(f.manifest.generated_at) - 1)).toThrow('clock_uncertain');
    const m = structuredClone(f.manifest), threshold = Date.parse(m.freshness_stale_at);
    m.generated_at = m.freshness_stale_at; m.valid_until = new Date(threshold + 30000).toISOString().replace('000Z', '000000Z'); m.stale = true;
    expect(() => fresh(m, threshold + 1)).not.toThrow(); m.stale = false; expect(() => fresh(m, threshold + 1)).toThrow('freshness_mismatch');
    m.stale = true; m.approval.platform_envelope.binding.approval_expires_at = m.generated_at; expect(() => fresh(m, threshold + 1)).toThrow('approval_expired');
  });
});
describe('credential-free origin admission and streaming', () => {
  it.each(['http://seller.example/a', 'https://u:p@seller.example/a', 'https://seller.example/a?x', 'https://seller.example/a#x', 'https://127.0.0.1/a', 'https://2130706433/a', 'https://[::1]/a', 'https://private.local/a', 'https://localhost/a', 'https://ai.market/a', 'https://sub.ai.market/a', 'https://x.r2.dev/a', 'https://seller.example./a', 'https://seller.example:0/a'])('rejects %s', url => expect(() => admitPackageUrl(url)).toThrow());
  it('admits seller HTTPS without credentials or URL arguments', () => expect(admitPackageUrl('https://seller.example/previews/sample.json').protocol).toBe('https:'));
  it('rejects redirects, missing no-store, encoding, and oversized responses', async () => {
    const signal = new AbortController().signal;
    await expect(boundedBody(new Response('ok', {headers: {'cache-control': 'public'}}), 10, signal)).rejects.toThrow('cache_policy');
    await expect(boundedBody(new Response('ok', {headers: {'cache-control': 'no-store', 'content-encoding': 'gzip'}}), 10, signal)).rejects.toThrow('unsupported_encoding');
    await expect(boundedBody(new Response('123456', {headers: {'cache-control': 'no-store'}}), 5, signal)).rejects.toThrow('byte_limit');
    expect(new TextDecoder().decode(await boundedBody(new Response('12345', {headers: {'cache-control': 'no-store'}}), 5, signal))).toBe('12345');
  });
});
