import {describe, expect, it} from 'vitest';
import {producerV2ManifestFixture} from '@/tests/producerPreviewFixture';
import {makeCurrentPreview, makeFreshnessTransitionPreview, makePreview, testSign} from '@/tests/previewFixture';
import type {Manifest} from './types';
import {LIMITS} from './types';
import {canonical, jcs, utf8} from './primitives';
import {disclosureBytes, platformBytes, verifyManifest, verifySample} from './verifier';
import {MANIFEST_RESPONSE_BYTES, SOURCE_OVERLAY_BYTES, manifestBudget, validateBinding, validateManifest} from './wire';
import {metadataResponse} from './transport';

const profiles = ['aim-approved-aggregates-v1', 'aim-approved-aggregates-v2'] as const;
const verify = (f: Awaited<ReturnType<typeof makePreview>>, m = f.manifest) => verifyManifest(m, f.keys, m.listing_id, f.now);
const sample = (f: Awaited<ReturnType<typeof makePreview>>, current = f.manifest) => verifySample(f.manifest, f.raw, {
  keys: f.keys, listingId: f.manifest.listing_id, now: () => f.now, readCurrent: async () => current, signal: new AbortController().signal,
});

describe('current producer wire and unchanged legacy signatures (hosted CI)', () => {
  it.each(profiles)('preserves %s in both signed preimages and verifies the complete chain', async profile => {
    const f = await makeCurrentPreview(profile), e = f.manifest.approval.platform_envelope;
    expect(new TextDecoder().decode(disclosureBytes(e.binding))).toContain(`"aggregate_hash_profile":"${profile}"`);
    expect(new TextDecoder().decode(platformBytes(e))).toContain(`"aggregate_hash_profile":"${profile}"`);
    expect((await sample(f)).entries).toHaveLength(2);
    const stripped = structuredClone(f.manifest);
    delete stripped.aggregate_hash_profile; delete stripped.approval.platform_envelope.binding.aggregate_hash_profile;
    await expect(verify(f, stripped)).rejects.toThrow('platform_signature_invalid');
    const sellerOnly = structuredClone(stripped), se = sellerOnly.approval.platform_envelope;
    se.signature = testSign(platformBytes(se));
    await expect(verify(f, sellerOnly)).rejects.toThrow('disclosure_signature_invalid');
  });
  it('keeps legacy omission and original fixed producer signatures valid', async () => {
    const f = producerV2ManifestFixture();
    const before = canonical(f.manifest.approval.platform_envelope);
    await expect(verifyManifest(f.manifest, f.keys, f.manifest.listing_id, f.now)).resolves.toEqual(f.manifest);
    expect(canonical(f.manifest.approval.platform_envelope)).toBe(before);
    expect(before).not.toContain('aggregate_hash_profile');
    expect((await sample(await makePreview())).entries).toHaveLength(2);
  });
  it.each([null, 'aim-approved-aggregates-v3', '', 2])('rejects malformed profile %s on either surface', async profile => {
    const f = await makeCurrentPreview();
    for (const target of [f.manifest, f.manifest.approval.platform_envelope.binding]) {
      const m = structuredClone(f.manifest);
      Object.assign(target === f.manifest ? m : m.approval.platform_envelope.binding, {aggregate_hash_profile: profile});
      await expect(verify(f, m)).rejects.toThrow('aggregate_profile_unknown');
    }
  });
  it('rejects explicit profile/omission and v1/v2 manifest binding mismatches', async () => {
    const f = await makeCurrentPreview();
    for (const profile of [undefined, profiles[0]]) {
      const m = structuredClone(f.manifest);
      if (profile === undefined) delete m.aggregate_hash_profile; else m.aggregate_hash_profile = profile;
      await expect(verify(f, m)).rejects.toThrow('manifest_binding_mismatch');
    }
  });
  it('advances same-root effective freshness without changing any authenticated byte', async () => {
    const f = await makeFreshnessTransitionPreview(), before = canonical(f.stale.manifest.approval);
    expect(canonical(f.reattested.manifest.approval)).toBe(before);
    expect(f.reattested.manifest.commitment).toEqual(f.stale.manifest.commitment);
    expect(f.reattested.manifest.last_attested_by_seller_at).not.toBe(f.reattested.manifest.signed_last_attested_by_seller_at);
    await expect(verify(f.stale)).resolves.toEqual(f.stale.manifest);
    await expect(sample({...f.stale, now: f.reattested.now}, f.reattested.manifest)).resolves.toMatchObject({manifest: f.reattested.manifest});
    await expect(verify(f.claimsCurrentPastFreshnessDeadline)).rejects.toThrow('freshness_mismatch');
    await expect(verify(f.regeneratedWithoutValidityWindow)).rejects.toThrow('manifest_expired');
  });
  it('rejects forged signed provenance, missing provenance on changed effective time, and inconsistent freshness', async () => {
    const {reattested: f} = await makeFreshnessTransitionPreview();
    for (const mutate of [
      (m: Manifest) => {m.signed_last_attested_by_seller_at = m.last_attested_by_seller_at;},
      (m: Manifest) => {delete m.signed_last_attested_by_seller_at;},
      (m: Manifest) => {m.last_attested_by_seller_at = '2027-01-01T00:00:00.000000Z';},
      (m: Manifest) => {m.freshness_stale_at = m.last_attested_by_seller_at;},
      (m: Manifest) => {m.signed_last_attested_by_seller_at = null as unknown as string;},
      (m: Manifest) => {m.freshness_expires_at = m.valid_until;},
    ]) {const m = structuredClone(f.manifest); mutate(m); await expect(verify(f, m)).rejects.toThrow();}
  });
  it('retains original signed attestation timing and independent approval expiry after effective refresh', async () => {
    const {reattested: f} = await makeFreshnessTransitionPreview();
    const m = structuredClone(f.manifest), e = m.approval.platform_envelope;
    e.binding.last_attested_by_seller_at = m.signed_last_attested_by_seller_at = '2026-09-17T00:00:01.000000Z';
    e.seller_signature = testSign(disclosureBytes(e.binding)); e.signature = testSign(platformBytes(e));
    await expect(verify(f, m)).rejects.toThrow('attestation_time_mismatch');
    const expired = structuredClone(f.manifest), ee = expired.approval.platform_envelope;
    ee.binding.approval_expires_at = expired.generated_at;
    ee.seller_signature = testSign(disclosureBytes(ee.binding)); ee.signature = testSign(platformBytes(ee));
    await expect(verify(f, expired)).rejects.toThrow('approval_expired');
  });
  it('uses the final source overlay while retaining every signed current-pointer check', async () => {
    const f = await makeCurrentPreview(), current = structuredClone(f.manifest);
    current.source_stale = true; current.source_stale_since = current.generated_at;
    const result = await sample(f, current);
    expect(result.manifest.source_stale).toBe(true);
    expect(result.manifest.approval).toEqual(f.manifest.approval);
    const replacement = structuredClone(current), e = replacement.approval.platform_envelope;
    replacement.aggregate_hash_profile = e.binding.aggregate_hash_profile = profiles[0];
    e.seller_signature = testSign(disclosureBytes(e.binding)); e.signature = testSign(platformBytes(e));
    await expect(sample(f, replacement)).rejects.toThrow('current_pointer_changed');
    current.checkpoint.signature = 'A'.repeat(86);
    await expect(sample(f, current)).rejects.toThrow('checkpoint_signature_invalid');
  });
  it.each(['platform', 'seller', 'commitment', 'proof', 'checkpoint', 'inclusion', 'row'])('keeps %s verification on source-stale responses', async artefact => {
    const f = await makeCurrentPreview(), m = f.manifest;
    m.source_stale = true; m.source_stale_since = m.generated_at;
    const e = m.approval.platform_envelope;
    if (artefact === 'platform') e.signature = 'A'.repeat(86);
    if (artefact === 'seller') {e.seller_signature = 'A'.repeat(86); e.signature = testSign(platformBytes(e));}
    if (artefact === 'commitment') m.commitment.seller_signature = 'A'.repeat(86);
    if (artefact === 'proof') m.proofs[0].signature = 'A'.repeat(86);
    if (artefact === 'checkpoint') m.checkpoint.signature = 'A'.repeat(86);
    if (artefact === 'inclusion') m.log_evidence.inclusion_path = [{hash: 'A'.repeat(43), direction: 'left'}];
    if (artefact === 'row') {f.pack.entries[0].row.name = 'forged'; f.raw = jcs(f.pack);}
    await expect(sample(f)).rejects.toThrow();
  });
});

describe('typed source overlay and bounded metadata', () => {
  it.each([
    {source_stale: 'true'}, {source_stale: null}, {source_stale: true},
    {source_stale: true, source_stale_since: null},
    {source_stale: false, source_stale_since: '2026-09-17T00:00:00.000000Z'},
    {source_stale_since: '2026-09-17T00:00:00.000000Z'},
    {source_stale: true, source_stale_since: '2026-02-30T00:00:00.000000Z'},
    {source_stale: true, source_stale_since: '2026-09-17T00:00:00.000Z'},
    {source_stale: true, source_stale_since: 'x'.repeat(1000)}, {source_stale_extra: false},
  ])('rejects malformed overlay %j', overlay => {
    const {manifest} = producerV2ManifestFixture(); Object.assign(manifest, overlay);
    expect(() => validateManifest(manifest)).toThrow();
  });
  it('accepts omitted and explicit false/null extensions and forbids overlay inside signed B', () => {
    const {manifest} = producerV2ManifestFixture();
    expect(() => validateManifest(manifest)).not.toThrow();
    Object.assign(manifest, {source_stale: false, source_stale_since: null});
    expect(() => validateManifest(manifest)).not.toThrow();
    // The producer samples now before reading the mutable head; do not invent
    // an ordering rule between generated_at and a concurrent source change.
    Object.assign(manifest, {source_stale: true, source_stale_since: '2026-09-17T00:00:02.000000Z'});
    expect(() => validateManifest(manifest)).not.toThrow();
    Object.assign(manifest.approval.platform_envelope.binding, {source_stale: false});
    expect(() => validateBinding(manifest.approval.platform_envelope.binding)).toThrow('contract_mismatch');
  });
  it('admits a shape-valid 256 KiB stored manifest plus exactly bounded overlay', async () => {
    const {manifest: m} = producerV2ManifestFixture();
    const proof = m.proofs[0];
    m.proofs = Array.from({length: 100}, (_, i) => ({...structuredClone(proof), proof_id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`}));
    m.commitment.proofs = m.proofs;
    m.approval.platform_envelope.binding.proof_ids = m.proofs.map(p => p.proof_id);
    // Fill only already bounded producer fields. This is schema/budget proof,
    // deliberately not a claim that these duplicated synthetic proofs are signed.
    let storedBytes = jcs(m).length;
    for (const p of m.proofs) {
      const room = Math.floor((LIMITS.manifest_bytes - storedBytes) / 2);
      const padding = Math.max(0, Math.min(2048 - p.preview_package_url.length, room));
      p.preview_package_url += 'x'.repeat(padding);
      // Each ASCII x adds one byte in both manifest and commitment proofs.
      storedBytes += 2 * padding;
    }
    m.package.url += 'x'.repeat(LIMITS.manifest_bytes - storedBytes);
    expect(jcs(m)).toHaveLength(LIMITS.manifest_bytes);
    expect(() => validateManifest(m)).not.toThrow();
    Object.assign(m, {source_stale: true, source_stale_since: m.generated_at});
    expect(jcs(m)).toHaveLength(MANIFEST_RESPONSE_BYTES);
    expect(SOURCE_OVERLAY_BYTES).toBe(71);
    expect(() => manifestBudget(m)).not.toThrow();
    expect(() => validateManifest(m)).not.toThrow();
    const signal = new AbortController().signal;
    await expect(metadataResponse(new Response(jcs(m)), signal, true)).resolves.toEqual(m);
    await expect(metadataResponse(new Response(jcs(m)), signal)).rejects.toThrow('byte_limit');
    await expect(metadataResponse(new Response(utf8(canonical(m) + ' ')), signal, true)).rejects.toThrow('byte_limit');
    m.package.url += 'x';
    expect(() => manifestBudget(m)).toThrow('manifest_limit');
    delete m.source_stale; delete m.source_stale_since;
    expect(() => manifestBudget(m)).toThrow('manifest_limit');
  });
});
