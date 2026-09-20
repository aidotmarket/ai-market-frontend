/** Synthetic keys/rows only. Independent signing creates a full browser fixture;
 * these are deliberately separate from the untouched producer corpus. */
import {createPrivateKey, createPublicKey, sign} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Binding, Commitment, Descriptor, Json, Manifest, PlatformEnvelope, PreviewPackage, Proof, Sibling} from '@/lib/listing-preview/types';
import {LIMITS} from '@/lib/listing-preview/types';
import {b64, canonical, hex, jcs, leaf, node, sha, utf8} from '@/lib/listing-preview/primitives';
import {canonicalRow, schemaDescriptors} from '@/lib/listing-preview/canonical-row';
import {checkpointBytes, commitmentBytes, disclosureBytes, platformBytes, proofBytes, sampleHash, verifySample} from '@/lib/listing-preview/verifier';

const privateKey = createPrivateKey({key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.alloc(32, 42)]), format: 'der', type: 'pkcs8'});
export const testPublicKey = b64(createPublicKey(privateKey).export({format: 'der', type: 'spki'}).subarray(-32));
export const testSign = (bytes: Uint8Array) => b64(sign(null, bytes, privateKey));
export const testNow = Date.parse('2026-09-17T00:00:01.000Z');
const time = '2026-09-17T00:00:00.000000Z';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const hash = async (domain: string, value: unknown) => sha(utf8(domain + '\0'), jcs(value));
const baseRequest = JSON.parse(readFileSync('tests/fixtures/preview/aim_preview_requests_v1.json', 'utf8')).approve;
export async function makePreview(rows: Record<string, Json>[] = [{id: '9007199254740993', name: 'barley'}, {id: '2', name: 'oats'}], schema: Descriptor[] = [['id', 'signed_integer', false, {}], ['name', 'string', true, {}]], policy: Pick<Proof, 'scan_policy' | 'scan_policy_version'> = {scan_policy: 'aim-preview-policy-v2', scan_policy_version: '2.0.0'}, additionalDatasetRows: Record<string, Json>[] = []) {
  const descriptors = schemaDescriptors(schema), schemaDigest = b64(await hash('aim-schema-v1', descriptors));
  const prepared = await Promise.all([...rows.map(row => ({row, sampled: true})), ...additionalDatasetRows.map(row => ({row, sampled: false}))]
    .map(async ({row, sampled}) => ({row, sampled, digest: await sha(utf8('aim-row-v1\0'), new Uint8Array(Buffer.from(schemaDigest, 'base64url')), utf8('\0'), utf8(canonicalRow(row, descriptors).text))})));
  prepared.sort((a, b) => Buffer.compare(a.digest, b.digest));
  const allEntries: (PreviewPackage['entries'][number] & {sampled: boolean})[] = []; const leaves: Uint8Array[] = []; let ordinal = 0;
  for (let i = 0; i < prepared.length; i++) {
    ordinal = i && b64(prepared[i].digest) === b64(prepared[i - 1].digest) ? ordinal + 1 : 0;
    const digest = b64(prepared[i].digest); leaves.push(await leaf(digest, ordinal));
    allEntries.push({proof_id: uuid(100 + i), row: prepared[i].row, base_row_digest: digest, duplicate_ordinal: ordinal, leaf_index: i, tree_size: prepared.length, siblings: [], sampled: prepared[i].sampled});
  }
  async function root(start: number, size: number): Promise<Uint8Array> {
    if (size === 1) return leaves[start]; let split = 1; while (split * 2 < size) split *= 2;
    return node(await root(start, split), await root(start + split, size - split));
  }
  async function path(start: number, size: number, index: number): Promise<Sibling[]> {
    if (size === 1) return []; let split = 1; while (split * 2 < size) split *= 2;
    return index < split ? [...await path(start, split, index), {hash: b64(await root(start + split, size - split)), direction: 'right'}] : [...await path(start + split, size - split, index - split), {hash: b64(await root(start, split)), direction: 'left'}];
  }
  for (let i = 0; i < allEntries.length; i++) allEntries[i].siblings = await path(0, allEntries.length, i);
  const entries: PreviewPackage['entries'] = allEntries.filter(entry => entry.sampled).map(({sampled: _sampled, ...entry}) => entry);
  const sampleLeaves = await Promise.all(entries.map(entry => leaf(entry.base_row_digest, entry.duplicate_ordinal)));
  const sample = await sampleHash(entries), sampled = b64(await hash('aim-preview-sampled-leaves-v1', sampleLeaves.map(b64)));
  const fingerprint = hex(await sha(new Uint8Array(Buffer.from(testPublicKey, 'base64url')))), reference = uuid(1) + ':' + fingerprint;
  const proofs: Proof[] = entries.map(e => ({...baseRequest.proofs[0], ...Object.fromEntries(Object.entries(e).filter(([k]) => k !== 'row')), ...policy, signer_reference: reference, sampled_leaf_list_digest: sampled}));
  const c: Commitment = {...baseRequest.commitment, schema_digest: schemaDigest, dataset_merkle_root: b64(await root(0, allEntries.length)), leaf_count: allEntries.length, aim_data_signer_reference: reference, proofs};
  const b: Binding = {...baseRequest.binding, signer_reference: reference, schema_descriptors: descriptors, selected_fields: descriptors.map(d => d[0]), schema_digest: schemaDigest, sample_hash: sample, proof_ids: proofs.map(p => p.proof_id), sampled_leaf_list_digest: sampled};
  for (const p of proofs) p.signature = testSign(proofBytes(c, p));
  b.scan_attestation_digest = hex(await hash('aim-preview-scan-attestation-v1', proofs));
  c.seller_attestation_digest = b64(await hash('aim-dataset-seller-attestation-v1', {listing_id: c.listing_id, seller_dataset_version: c.seller_dataset_version, schema_digest: c.schema_digest, dataset_merkle_root: c.dataset_merkle_root, leaf_count: c.leaf_count, sample_hash: sample, rights_basis_digest: b.rights_basis_digest, public_preview_permission: true, metadata_accuracy_confirmed: true, signed_at: c.signed_at}));
  c.seller_signature = testSign(commitmentBytes(c));
  const e: PlatformEnvelope = {profile: 'aim-preview-platform-envelope-v1', key_id: 'synthetic-platform', signature_algorithm: 'ed25519', binding: b, seller_signature: testSign(disclosureBytes(b)), signer_keys: [{key_id: uuid(1), algorithm: 'ed25519', public_key: testPublicKey, status: 'active', valid_from: time, fingerprint}], signature: b64(new Uint8Array(64))};
  e.signature = testSign(platformBytes(e));
  const entry = {...c, appended_at: time, transparency_sequence: 1} as Record<string, unknown>; delete entry.proofs;
  const cp = {log_id: 'synthetic-log', tree_size: 1, root_hash: b64(await sha(utf8('\0aim-log-leaf-v1\0'), jcs(entry))), checkpoint_at: time, key_id: e.key_id, public_key_algorithm: 'ed25519' as const, signature: b64(new Uint8Array(64))};
  cp.signature = testSign(checkpointBytes(cp));
  const manifest: Manifest = {profile: 'aim-listing-preview-v1', package_profile: 'aim-preview-package-v2', listing_id: b.listing_id, listing_version_id: b.listing_version_id, content_revision: b.content_revision, source_revision: b.source_revision, summary_approval_id: b.summary_approval_id, summary_hash: b.summary_hash, render_hash: b.render_hash, disclosure_version: b.disclosure_version, approval_status: 'approved', sample_hash: sample, aggregate_hash: b.aggregate_hash, preview_type: 'table', content_type: 'tabular', columns: descriptors.map(d => ({name: d[0], type: d[1]})), selected_fields: b.selected_fields, schema_descriptors: descriptors, commitment: c, proofs, checkpoint: cp, log_evidence: {entry: entry as unknown as Manifest['log_evidence']['entry'], inclusion_path: [], consistency_path: [], previous_tree_size: null, previous_root: null}, approval: {platform_envelope: e}, package: {url: proofs[0].preview_package_url, media_type: proofs[0].package_media_type, byte_ceiling: proofs[0].package_byte_ceiling}, last_attested_by_seller_at: time, stale: false, freshness_stale_at: '2026-12-16T00:00:00.000000Z', freshness_expires_at: null, generated_at: time, valid_until: '2026-09-17T00:00:30.000000Z', limits: LIMITS};
  // The fixture binding's cadence owns the threshold, just like production.
  const cadence = b.update_cadence_days; manifest.freshness_stale_at = new Date(Date.parse(time) + Math.min(90, cadence === null ? 90 : Math.max(7, 2 * cadence)) * 86400000).toISOString().replace('000Z', '000000Z');
  const pack: PreviewPackage = {package_profile: 'aim-preview-package-v2', commitment_id: c.commitment_id, schema_digest: schemaDigest, disclosure_version: b.disclosure_version, sample_hash: sample, entries};
  const keys = {[e.key_id]: testPublicKey};
  return {manifest, pack, raw: jcs(pack), keys, now: testNow};
}

const wireTime = (value: number) => new Date(value).toISOString().replace('000Z', '000000Z');
const cloneManifest = (manifest: Manifest): Manifest => JSON.parse(JSON.stringify(manifest)) as Manifest;

/** One commitment across stale, unchanged-root re-attested, and fail-closed claims. */
export async function makeFreshnessTransitionPreview() {
  const base = await makePreview(undefined, undefined, undefined, [{id: '3', name: 'rye'}]);
  const staleManifest = cloneManifest(base.manifest);
  const staleAt = Date.parse(staleManifest.freshness_stale_at);
  staleManifest.generated_at = wireTime(staleAt);
  staleManifest.valid_until = wireTime(staleAt + 30_000);
  staleManifest.stale = true;
  const stale = {...base, manifest: staleManifest, now: staleAt + 1_000};

  const currentManifest = cloneManifest(staleManifest);
  const envelope = currentManifest.approval.platform_envelope;
  const reattestedAt = stale.now;
  envelope.binding.last_attested_by_seller_at = wireTime(reattestedAt);
  envelope.binding.approved_at = wireTime(reattestedAt);
  currentManifest.last_attested_by_seller_at = wireTime(reattestedAt);
  currentManifest.generated_at = wireTime(reattestedAt);
  currentManifest.valid_until = wireTime(reattestedAt + 30_000);
  const cadence = envelope.binding.update_cadence_days;
  const freshnessDays = Math.min(90, cadence === null ? 90 : Math.max(7, 2 * cadence));
  currentManifest.freshness_stale_at = wireTime(reattestedAt + freshnessDays * 86_400_000);
  currentManifest.stale = false;
  envelope.seller_signature = testSign(disclosureBytes(envelope.binding));
  envelope.signature = testSign(platformBytes(envelope));
  const reattested = {...base, manifest: currentManifest, now: stale.now};

  const claimsCurrentPastFreshnessDeadlineManifest = cloneManifest(staleManifest);
  claimsCurrentPastFreshnessDeadlineManifest.stale = false;
  const claimsCurrentPastFreshnessDeadline = {...base, manifest: claimsCurrentPastFreshnessDeadlineManifest, now: stale.now};

  const regeneratedWithoutValidityWindowManifest = cloneManifest(currentManifest);
  regeneratedWithoutValidityWindowManifest.valid_until = regeneratedWithoutValidityWindowManifest.generated_at;
  const regeneratedWithoutValidityWindow = {...base, manifest: regeneratedWithoutValidityWindowManifest, now: stale.now};
  return {stale, reattested, claimsCurrentPastFreshnessDeadline, regeneratedWithoutValidityWindow};
}

export async function verifiedFixture(rows?: Record<string, Json>[], schema?: Descriptor[]) {
  const f = await makePreview(rows, schema);
  const sample = await verifySample(f.manifest, f.raw, {listingId: f.manifest.listing_id, keys: f.keys, now: () => f.now, readCurrent: async () => f.manifest, signal: new AbortController().signal});
  return {...f, sample};
}
