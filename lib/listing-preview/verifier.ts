/** Browser/Node crypto only. No API, logging, storage, or seller transport here. */
import type {Binding, Checkpoint, Commitment, LogEvidence, Manifest, PlatformEnvelope, PreviewPackage, Proof, TrustedCheckpoint, TrustedKeys, VerifiedEntry, VerifiedSample} from './types';
import {PRODUCER_POLICY, requirePolicyVersion} from './policy';
import {LIMITS} from './types';
import {b64, canonical, closed, concat, consistency, hex, inclusion, jcs, leaf, parseJson, requirePreview as check, sha, timestamp, unb64, utf8, verifyEd25519} from './primitives';
import {canonicalRow, schemaDescriptors} from './canonical-row';
import {validateBinding, validateCheckpoint, validateCommitment, validateEnvelope, validateManifest, validateProof} from './wire';

const without = <T extends object>(object: T, field: keyof T) => Object.fromEntries(Object.entries(object).filter(([k]) => k !== field));
const domain = (name: string, value: unknown) => concat(utf8(name + '\0'), jcs(value));
export function disclosureBytes(b: Binding) {validateBinding(b); return domain('aim-preview-disclosure-signature-v1', b);}
export function commitmentBytes(c: Commitment) {validateCommitment(c); return domain('aim-dataset-commitment-signature-v1', without(c, 'seller_signature'));}
export function proofBytes(c: Commitment, p: Proof) {
  validateProof(p); validateCommitment(c);
  return domain('aim-preview-proof-signature-v1', {commitment_id: c.commitment_id, listing_id: c.listing_id, seller_dataset_version: c.seller_dataset_version, schema_digest: c.schema_digest, dataset_merkle_root: c.dataset_merkle_root, proof: without(p, 'signature')});
}
export function platformBytes(e: PlatformEnvelope) {
  validateEnvelope(e);
  return domain('aim-preview-platform-envelope-v1', {...without(e, 'signature'), signer_keys: e.signer_keys.map(k => k.valid_until == null ? without(k, 'valid_until') : k)});
}
export function checkpointBytes(c: Checkpoint) {
  validateCheckpoint(c); return utf8(`aim-transparency-checkpoint-v1\n${c.log_id}\n${c.tree_size}\n${c.root_hash}\n${c.checkpoint_at}\n`);
}
export async function sampleHash(proofs: Pick<Proof, 'proof_id' | 'base_row_digest' | 'duplicate_ordinal' | 'leaf_index'>[]) {
  return hex(await sha(domain('aim-approved-sample-v1', proofs.map(p => [p.proof_id, hex(unb64(p.base_row_digest, 32)), p.duplicate_ordinal, p.leaf_index]))));
}
export function validateTrustedKeys(keys: TrustedKeys) {
  check(Object.keys(keys).length > 0 && new Set(Object.values(keys)).size === Object.keys(keys).length, 'platform_key_alias');
  for (const [id, key] of Object.entries(keys)) {check(/^[A-Za-z0-9._:-]{1,255}$/.test(id), 'invalid_key'); unb64(key, 32);}
}
export async function verifyPlatformEnvelope(e: PlatformEnvelope, keys: TrustedKeys) {
  validateTrustedKeys(keys);
  check(Object.hasOwn(keys, e.key_id) && await verifyEd25519(keys[e.key_id], e.signature, platformBytes(e)), 'platform_signature_invalid');
}
export async function verifySignatures(e: PlatformEnvelope, c: Commitment, keys: TrustedKeys, now: number) {
  // This await is the trust boundary: never resolve seller material above it.
  await verifyPlatformEnvelope(e, keys);
  const b = e.binding, references = new Set([b.signer_reference, c.aim_data_signer_reference, ...c.proofs.map(p => p.signer_reference)]);
  const resolved = new Map<string, string>();
  for (const k of e.signer_keys) {
    const reference = k.key_id + ':' + k.fingerprint;
    check(references.has(reference) && !resolved.has(reference) && k.status === 'active' && hex(await sha(unb64(k.public_key, 32))) === k.fingerprint, 'signer_evidence_invalid');
    const start = timestamp(k.valid_from), end = k.valid_until == null ? Infinity : timestamp(k.valid_until);
    check([now, timestamp(b.approved_at), timestamp(c.signed_at), ...c.proofs.map(p => timestamp(p.scanned_at))].every(t => t >= start && t < end), 'signer_evidence_expired');
    resolved.set(reference, k.public_key);
  }
  check(resolved.size === references.size, 'signer_evidence_missing');
  check(await verifyEd25519(resolved.get(b.signer_reference)!, e.seller_signature, disclosureBytes(b)), 'disclosure_signature_invalid');
  check(await verifyEd25519(resolved.get(c.aim_data_signer_reference)!, c.seller_signature, commitmentBytes(c)), 'commitment_signature_invalid');
  for (const p of c.proofs) check(await verifyEd25519(resolved.get(p.signer_reference)!, p.signature, proofBytes(c, p)), 'proof_signature_invalid');
}
export async function verifyLog(e: LogEvidence, cp: Checkpoint, c: Commitment, keys: TrustedKeys, previous?: TrustedCheckpoint) {
  validateTrustedKeys(keys);
  check(Object.hasOwn(keys, cp.key_id) && await verifyEd25519(keys[cp.key_id], cp.signature, checkpointBytes(cp)), 'checkpoint_signature_invalid');
  closed(e, 'entry inclusion_path consistency_path previous_tree_size previous_root');
  const entry = {...e.entry} as Record<string, unknown>; delete entry.appended_at; delete entry.transparency_sequence;
  check(canonical(entry) === canonical(without(c, 'proofs')), 'log_entry_mismatch');
  check(await inclusion(await sha(utf8('\0aim-log-leaf-v1\0'), jcs(e.entry)), e.entry.transparency_sequence - 1, cp.tree_size, e.inclusion_path, cp.root_hash), 'log_inclusion_invalid');
  if (!previous) check(e.previous_tree_size === null && e.previous_root === null && e.consistency_path.length === 0, 'log_predecessor_mismatch');
  else {
    check(previous.log_id === cp.log_id && e.previous_tree_size === previous.tree_size && e.previous_root === previous.root_hash, 'log_predecessor_mismatch');
    check(await consistency(previous.tree_size, cp.tree_size, previous.root_hash, cp.root_hash, e.consistency_path), 'log_consistency_invalid');
  }
}
export function fresh(m: Manifest, now: number) {
  const b = m.approval.platform_envelope.binding, generated = timestamp(m.generated_at), until = timestamp(m.valid_until);
  check(Number.isFinite(now) && now >= generated, 'clock_uncertain');
  check(now < until && until - generated <= 30000 && until > generated, 'manifest_expired');
  const attested = timestamp(b.last_attested_by_seller_at), threshold = attested + Math.min(90, b.update_cadence_days === null ? 90 : Math.max(7, Math.min(90, b.update_cadence_days) * 2)) * 86400000;
  check(timestamp(m.freshness_stale_at) === threshold && m.stale === (generated >= threshold) && attested <= generated, 'freshness_mismatch');
  if (!m.stale) check(until <= threshold, 'freshness_mismatch');
  check(m.freshness_expires_at === null, 'unrecognized_expiry_policy');
  if (b.approval_expires_at !== null) check(until <= timestamp(b.approval_expires_at) && now < timestamp(b.approval_expires_at), 'approval_expired');
}
export async function verifyManifest(raw: unknown, keys: TrustedKeys, listingId: string, now: number, previous?: TrustedCheckpoint): Promise<Manifest> {
  check(jcs(raw).length <= LIMITS.manifest_bytes, 'manifest_limit'); validateManifest(raw);
  // Snapshot before any await. No caller mutation can change the checked bytes.
  const m = JSON.parse(canonical(raw)) as Manifest, b = m.approval.platform_envelope.binding, c = m.commitment;
  check(m.listing_id === listingId, 'listing_mismatch'); fresh(m, now);
  await verifySignatures(m.approval.platform_envelope, c, keys, now);
  check(b.decision === 'approve' && b.sample_decision === 'approved' && b.public_preview_permission === true, 'approval_missing');
  for (const k of ['listing_id', 'listing_version_id', 'content_revision', 'source_revision', 'summary_approval_id', 'summary_hash', 'render_hash', 'disclosure_version', 'sample_hash', 'aggregate_hash', 'preview_type', 'content_type', 'selected_fields', 'schema_descriptors', 'last_attested_by_seller_at'] as const) {
    check(canonical(m[k]) === canonical(b[k]), 'manifest_binding_mismatch');
  }
  for (const k of ['listing_id', 'commitment_id', 'schema_digest', 'seller_dataset_version'] as const) check(c[k] === b[k], 'commitment_binding_mismatch');
  check(c.aim_data_signer_reference === b.signer_reference && m.proofs.every(p => p.signer_reference === b.signer_reference), 'signer_mismatch');
  const descriptors = schemaDescriptors(m.schema_descriptors);
  check(descriptors.length <= 25 && canonical(descriptors) === canonical(m.schema_descriptors), 'descriptor_mismatch');
  check(b64(await sha(utf8('aim-schema-v1\0'), jcs(descriptors))) === c.schema_digest, 'schema_digest_mismatch');
  check(canonical(m.columns) === canonical(m.selected_fields.map(name => ({name, type: descriptors.find(d => d[0] === name)?.[1]}))), 'column_mismatch');
  check(canonical(m.proofs) === canonical(c.proofs) && canonical(b.proof_ids) === canonical(m.proofs.map(p => p.proof_id)), 'proof_order_mismatch');
  check(new Set(m.proofs.map(p => p.leaf_index)).size === m.proofs.length && new Set(m.proofs.map(p => p.base_row_digest + ':' + p.duplicate_ordinal)).size === m.proofs.length, 'duplicate_proof');
  const first = m.proofs[0];
  check(canonical(m.package) === canonical({url: first.preview_package_url, media_type: first.package_media_type, byte_ceiling: first.package_byte_ceiling}), 'package_mismatch');
  const shared = ['preview_package_url', 'package_media_type', 'package_profile', 'package_byte_ceiling', 'scan_policy', 'scan_policy_version', 'scan_verdict', 'scanned_at', 'signer_reference'] as const;
  for (const p of m.proofs) {
    check(shared.every(k => p[k] === first[k]), 'package_mismatch');
    check(timestamp(p.scanned_at) <= timestamp(c.signed_at) && timestamp(c.signed_at) <= timestamp(b.approved_at) && timestamp(b.approved_at) <= now && timestamp(b.last_attested_by_seller_at) <= timestamp(b.approved_at), 'attestation_time_mismatch');
    const hash = await leaf(p.base_row_digest, p.duplicate_ordinal);
    check(await inclusion(hash, p.leaf_index, p.tree_size, p.siblings, c.dataset_merkle_root), 'proof_invalid');
  }
  await verifyScanAttestation(m);
  check(await sampleHash(m.proofs) === b.sample_hash, 'sample_hash_mismatch');
  const attestation = {listing_id: c.listing_id, seller_dataset_version: c.seller_dataset_version, schema_digest: c.schema_digest, dataset_merkle_root: c.dataset_merkle_root, leaf_count: c.leaf_count, sample_hash: b.sample_hash, rights_basis_digest: b.rights_basis_digest, public_preview_permission: true, metadata_accuracy_confirmed: true, signed_at: c.signed_at};
  check(b64(await sha(domain('aim-dataset-seller-attestation-v1', attestation))) === c.seller_attestation_digest, 'seller_attestation_mismatch');
  await verifyLog(m.log_evidence, m.checkpoint, c, keys, previous);
  return m;
}

/** Called only after platform and every F2 seller signature authenticate. */
export async function verifyScanAttestation(m: Manifest): Promise<void> {
  const b = m.approval.platform_envelope.binding;
  for (const p of m.proofs) requirePolicyVersion(p.scan_policy, p.scan_policy_version);
  check(m.proofs.every(p => p.scan_policy === PRODUCER_POLICY && p.scan_verdict === 'passed'), 'scan_attestation_invalid');
  check(m.proofs.every(p => p.sampled_leaf_list_digest === b.sampled_leaf_list_digest), 'sampled_list_mismatch');
  check(hex(await sha(domain('aim-preview-scan-attestation-v1', m.proofs))) === b.scan_attestation_digest, 'scan_mismatch');
}

const handles = new WeakSet<object>();
export function isVerifiedSample(value: unknown): value is VerifiedSample {return typeof value === 'object' && value !== null && handles.has(value);}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {Object.values(value).forEach(freeze); Object.freeze(value);} return value;
}
/** Pure package verification is separately testable against producer fixtures.
 * This function cannot issue a display handle. */
type VerifiedPackageEntry = VerifiedEntry & {readonly leafHash: string};
export async function verifyPackage(raw: Uint8Array, m: Pick<Manifest, 'commitment' | 'disclosure_version' | 'sample_hash' | 'schema_descriptors' | 'proofs' | 'package'>): Promise<VerifiedPackageEntry[]> {
  const parsed = parseJson(raw, Math.min(LIMITS.envelope_bytes, m.package.byte_ceiling));
  envelopeBudget(parsed);
  closed(parsed, 'package_profile commitment_id schema_digest disclosure_version sample_hash entries');
  const p = parsed as unknown as PreviewPackage;
  check(p.package_profile === 'aim-preview-package-v2' && p.commitment_id === m.commitment.commitment_id && p.schema_digest === m.commitment.schema_digest && p.disclosure_version === m.disclosure_version && p.sample_hash === m.sample_hash, 'package_binding_mismatch');
  check(Array.isArray(p.entries) && p.entries.length >= 1 && p.entries.length <= 100 && p.entries.length === m.proofs.length, 'row_limit');
  const schema = schemaDescriptors(m.schema_descriptors); check(schema.length <= 25, 'field_limit');
  check(b64(await sha(utf8('aim-schema-v1\0'), jcs(schema))) === p.schema_digest, 'schema_digest_mismatch');
  const entries: VerifiedPackageEntry[] = [], budget = {nodes: 0}; let bytes = 0, lastIndex = -1;
  const ids = new Set<string>(), ordinals = new Set<string>();
  for (let i = 0; i < p.entries.length; i++) {
    const e = p.entries[i], proof = m.proofs[i];
    closed(e, 'proof_id row base_row_digest duplicate_ordinal leaf_index tree_size siblings');
    check(!ids.has(e.proof_id) && !ordinals.has(e.base_row_digest + ':' + e.duplicate_ordinal) && e.leaf_index > lastIndex, 'duplicate_proof');
    ids.add(e.proof_id); ordinals.add(e.base_row_digest + ':' + e.duplicate_ordinal); lastIndex = e.leaf_index;
    check(canonical(without(e, 'row')) === canonical({proof_id: proof.proof_id, base_row_digest: proof.base_row_digest, duplicate_ordinal: proof.duplicate_ordinal, leaf_index: proof.leaf_index, tree_size: proof.tree_size, siblings: proof.siblings}), 'entry_mismatch');
    const row = canonicalRow(e.row, schema, budget); bytes += utf8(row.text).length; check(bytes <= 250000, 'canonical_byte_limit');
    check(b64(await sha(utf8('aim-row-v1\0'), unb64(p.schema_digest, 32), utf8('\0'), utf8(row.text))) === e.base_row_digest, 'row_digest_mismatch');
    const leafHash = await leaf(e.base_row_digest, e.duplicate_ordinal);
    check(await inclusion(leafHash, e.leaf_index, e.tree_size, e.siblings, m.commitment.dataset_merkle_root), 'proof_invalid');
    entries.push({proofId: e.proof_id, row: e.row, cells: row.cells, leafHash: b64(leafHash)});
  }
  // Independently recompute from the actual ordered package entries, not metadata.
  check(await sampleHash(p.entries) === p.sample_hash, 'sample_hash_mismatch');
  return entries;
}
/** Producer value_budget parity: count every container/scalar/null in the whole
 * decoded envelope, including proof metadata; object keys are not nodes. */
export function envelopeBudget(value: unknown): number {
  let nodes = 0; const stack: [unknown, number][] = [[value, 0]];
  while (stack.length) {
    const [current, depth] = stack.pop()!;
    check(++nodes <= LIMITS.nodes && depth <= LIMITS.depth, 'envelope_bound');
    if (current && typeof current === 'object') {
      for (const child of Object.values(current)) stack.push([child, depth + 1]);
    } else check(current === null || ['string', 'number', 'boolean'].includes(typeof current), 'invalid_value');
  }
  return nodes;
}
export interface VerificationOptions {
  listingId: string; keys: TrustedKeys; now: () => number; previous?: TrustedCheckpoint;
  /** Must run entirely locally and reject incomplete/uncertain policy coverage. */
  scan: (entries: readonly VerifiedEntry[], signal: AbortSignal, schema: readonly import('./types').Descriptor[]) => Promise<void>;
  readCurrent: () => Promise<unknown>; signal: AbortSignal;
}
export async function verifySample(manifest: unknown, raw: Uint8Array, options: VerificationOptions): Promise<VerifiedSample> {
  const m = await verifyManifest(manifest, options.keys, options.listingId, options.now(), options.previous);
  const entries = await verifyPackage(raw, m);
  const sampled = b64(await sha(domain('aim-preview-sampled-leaves-v1', entries.map(entry => entry.leafHash))));
  check(sampled === m.approval.platform_envelope.binding.sampled_leaf_list_digest, 'sampled_list_mismatch');
  await options.scan(entries, options.signal, m.schema_descriptors);
  check(!options.signal.aborted, 'cancelled');
  const current = await verifyManifest(await options.readCurrent(), options.keys, options.listingId, options.now(), options.previous);
  // Only eligibility timestamps may advance. Every signed identity/evidence byte
  // must still be the same at final insertion, including the selected columns.
  const identity = (value: Manifest) => {const copy = {...value} as Record<string, unknown>; delete copy.generated_at; delete copy.valid_until; delete copy.stale; return canonical(copy);};
  check(identity(m) === identity(current), 'current_pointer_changed');
  fresh(current, options.now()); check(!options.signal.aborted, 'cancelled');
  const sample = freeze({manifest: current, entries}) as unknown as VerifiedSample;
  handles.add(sample); return sample;
}
