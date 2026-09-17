import type {Binding, Checkpoint, Commitment, Manifest, PlatformEnvelope, Proof} from './types';
import {LIMITS} from './types';
import {canonical, closed, natural, requirePreview as check, timestamp, unb64} from './primitives';

export const bindingFields = 'profile decision summary_id disclosure_version seller_id listing_id listing_version_id content_revision source_revision summary_approval_id summary_hash render_hash selected_fields preview_type content_type sample_decision sample_hash aggregate_hash commitment_id schema_digest seller_dataset_version schema_descriptors proof_ids sampled_leaf_list_digest scan_attestation_digest rights_basis_digest rights_basis_code public_preview_permission approved_by approved_at last_attested_by_seller_at update_cadence_days approval_expires_at supersedes request_id expected_current_disclosure_id signer_reference signature_algorithm signature_profile';
export const proofFields = 'proof_id base_row_digest duplicate_ordinal leaf_index tree_size siblings preview_package_url package_media_type package_profile package_byte_ceiling scan_policy scan_policy_version scan_verdict scanned_at sampled_leaf_list_digest signer_reference signature_algorithm signature';
export const commitmentFields = 'commitment_id listing_id seller_dataset_version previous_commitment_id canonicalization_profile hash_algorithm schema_digest dataset_merkle_root leaf_count seller_attestation_digest aim_data_signer_reference signature_algorithm seller_signature signed_at proofs';
export const manifestFields = 'profile package_profile listing_id listing_version_id content_revision source_revision summary_approval_id summary_hash render_hash disclosure_version approval_status sample_hash aggregate_hash preview_type content_type columns selected_fields schema_descriptors commitment proofs checkpoint log_evidence approval package last_attested_by_seller_at stale freshness_stale_at freshness_expires_at generated_at valid_until limits';
export function uuid(value: unknown): void {check(typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value), 'invalid_uuid');}
function code(value: unknown, max = 255) {check(typeof value === 'string' && value.length >= 1 && value.length <= max && /^[A-Za-z0-9._:-]+$/.test(value), 'invalid_code');}
function digest(value: unknown) {check(typeof value === 'string' && /^[0-9a-f]{64}$/.test(value), 'invalid_digest');}
function ref(value: unknown) {check(typeof value === 'string' && value.length === 101, 'invalid_signer'); uuid(value.slice(0, 36)); check(value[36] === ':'); digest(value.slice(37));}
export function validateBinding(b: Binding) {
  closed(b, bindingFields); canonical(b);
  for (const k of ['summary_id', 'disclosure_version', 'seller_id', 'listing_id', 'content_revision', 'summary_approval_id', 'approved_by', 'request_id'] as const) uuid(b[k]);
  for (const k of ['listing_version_id', 'commitment_id', 'supersedes', 'expected_current_disclosure_id'] as const) if (b[k] !== null) uuid(b[k]);
  for (const k of ['source_revision', 'summary_hash', 'render_hash', 'aggregate_hash'] as const) digest(b[k]);
  for (const k of ['sample_hash', 'scan_attestation_digest', 'rights_basis_digest'] as const) if (b[k] !== null) digest(b[k]);
  for (const k of ['schema_digest', 'sampled_leaf_list_digest'] as const) if (b[k] !== null) unb64(b[k], 32);
  for (const k of ['approved_at', 'last_attested_by_seller_at'] as const) timestamp(b[k]);
  if (b.approval_expires_at !== null) timestamp(b.approval_expires_at);
  if (b.seller_dataset_version !== null) code(b.seller_dataset_version);
  check(b.update_cadence_days === null || natural(b.update_cadence_days, 1)); ref(b.signer_reference);
  check(b.profile === 'aim-preview-disclosure-v1' && ['approve', 'withdraw'].includes(b.decision) && ['none', 'approved'].includes(b.sample_decision));
  check(b.signature_algorithm === 'ed25519' && b.signature_profile === 'aim-preview-disclosure-signature-v1');
  check(b.supersedes === b.expected_current_disclosure_id && b.disclosure_version !== b.supersedes);
  check(Array.isArray(b.selected_fields) && b.selected_fields.length <= 25 && new Set(b.selected_fields).size === b.selected_fields.length);
  for (const name of b.selected_fields) check(typeof name === 'string' && name === name.normalize('NFC') && Array.from(name).length >= 1 && Array.from(name).length <= 255);
  check(Array.isArray(b.proof_ids) && b.proof_ids.length <= 100 && new Set(b.proof_ids).size === b.proof_ids.length); b.proof_ids.forEach(uuid);
  check(Array.isArray(b.schema_descriptors) && b.schema_descriptors.length <= 500);
  const grant = [b.sample_hash, b.commitment_id, b.schema_digest, b.seller_dataset_version, b.sampled_leaf_list_digest, b.scan_attestation_digest, b.rights_basis_digest, b.rights_basis_code, b.public_preview_permission, b.preview_type, b.content_type];
  if (b.sample_decision === 'none') check(grant.every(v => v === null) && !b.proof_ids.length && !b.selected_fields.length && !b.schema_descriptors.length);
  else check(grant.every(v => v !== null) && b.public_preview_permission === true && ['owner', 'licensed', 'public_domain', 'other_authorized'].includes(b.rights_basis_code!) && b.preview_type === 'table' && b.content_type === 'tabular' && b.selected_fields.length && b.proof_ids.length);
  if (b.decision === 'withdraw') check(b.sample_decision === 'none' && b.supersedes !== null);
}
export function validateEnvelope(e: PlatformEnvelope) {
  closed(e, 'profile key_id signature_algorithm binding seller_signature signer_keys signature');
  check(e.profile === 'aim-preview-platform-envelope-v1' && e.signature_algorithm === 'ed25519'); code(e.key_id);
  validateBinding(e.binding); unb64(e.signature, 64); unb64(e.seller_signature, 64);
  check(Array.isArray(e.signer_keys) && e.signer_keys.length >= 1 && e.signer_keys.length <= 4);
  // Structural validation only. Key resolution/admission MUST follow platform verification.
  for (const k of e.signer_keys) {
    closed(k, 'key_id algorithm public_key status valid_from fingerprint', 'valid_until'); uuid(k.key_id);
    check(k.algorithm === 'ed25519' && ['active', 'rotated', 'revoked'].includes(k.status));
    unb64(k.public_key, 32); digest(k.fingerprint); timestamp(k.valid_from); if (k.valid_until != null) timestamp(k.valid_until);
  }
  check(new Set(e.signer_keys.map(k => k.key_id)).size === e.signer_keys.length);
}
export function validateProof(p: Proof) {
  closed(p, proofFields); uuid(p.proof_id); unb64(p.base_row_digest, 32); unb64(p.sampled_leaf_list_digest, 32); unb64(p.signature, 64); ref(p.signer_reference); timestamp(p.scanned_at);
  check(natural(p.tree_size, 1) && natural(p.leaf_index) && p.leaf_index < p.tree_size && natural(p.duplicate_ordinal) && p.duplicate_ordinal < p.tree_size);
  check(Array.isArray(p.siblings) && p.siblings.length <= 63);
  for (const sibling of p.siblings) {closed(sibling, 'hash direction'); unb64(sibling.hash, 32); check(['left', 'right'].includes(sibling.direction));}
  check(p.package_profile === 'aim-preview-package-v2' && p.package_media_type === 'application/vnd.aim.preview+json' && natural(p.package_byte_ceiling, 1) && p.package_byte_ceiling <= 1048576);
  check(p.scan_policy === 'aim-preview-policy-v1' && p.scan_policy_version === '1.0.0' && p.scan_verdict === 'passed' && p.signature_algorithm === 'ed25519');
  check(typeof p.preview_package_url === 'string' && p.preview_package_url.length <= 2048);
}
export function validateCommitment(c: Commitment) {
  closed(c, commitmentFields); uuid(c.commitment_id); uuid(c.listing_id); if (c.previous_commitment_id !== null) uuid(c.previous_commitment_id);
  code(c.seller_dataset_version); ref(c.aim_data_signer_reference); timestamp(c.signed_at);
  check(c.canonicalization_profile === 'aim-dataset-merkle-v1' && c.hash_algorithm === 'sha-256' && c.signature_algorithm === 'ed25519' && natural(c.leaf_count, 1));
  for (const v of [c.schema_digest, c.dataset_merkle_root, c.seller_attestation_digest]) unb64(v, 32); unb64(c.seller_signature, 64);
  check(Array.isArray(c.proofs) && c.proofs.length >= 1 && c.proofs.length <= 100); c.proofs.forEach(validateProof);
  check(c.proofs.every(p => p.tree_size === c.leaf_count));
}
export function validateCheckpoint(c: Checkpoint) {
  closed(c, 'log_id tree_size root_hash checkpoint_at key_id public_key_algorithm signature');
  code(c.log_id, 120); code(c.key_id); check(natural(c.tree_size, 1) && c.public_key_algorithm === 'ed25519');
  unb64(c.root_hash, 32); unb64(c.signature, 64); timestamp(c.checkpoint_at);
}
export function validateManifest(raw: unknown): asserts raw is Manifest {
  closed(raw, manifestFields); const m = raw as unknown as Manifest;
  check(m.profile === 'aim-listing-preview-v1' && m.package_profile === 'aim-preview-package-v2' && m.preview_type === 'table' && m.content_type === 'tabular' && m.approval_status === 'approved');
  closed(m.approval, 'platform_envelope'); validateEnvelope(m.approval.platform_envelope); validateCommitment(m.commitment); validateCheckpoint(m.checkpoint);
  check(Array.isArray(m.proofs) && m.proofs.length >= 1 && m.proofs.length <= 100); m.proofs.forEach(validateProof);
  check(canonical(m.limits) === canonical(LIMITS));
  check(Array.isArray(m.columns) && m.columns.length >= 1 && m.columns.length <= 25); m.columns.forEach(c => closed(c, 'name type'));
  closed(m.package, 'url media_type byte_ceiling');
  closed(m.log_evidence, 'entry inclusion_path consistency_path previous_tree_size previous_root');
  closed(m.log_evidence.entry, commitmentFields.replace(' proofs', '') + ' appended_at transparency_sequence');
  check(natural(m.log_evidence.entry.transparency_sequence, 1)); timestamp(m.log_evidence.entry.appended_at);
  check(Array.isArray(m.log_evidence.inclusion_path) && m.log_evidence.inclusion_path.length <= 63 && Array.isArray(m.log_evidence.consistency_path) && m.log_evidence.consistency_path.length <= 63);
  m.log_evidence.consistency_path.forEach(h => unb64(h, 32));
  if (m.log_evidence.previous_tree_size !== null) check(natural(m.log_evidence.previous_tree_size, 1));
  if (m.log_evidence.previous_root !== null) unb64(m.log_evidence.previous_root, 32);
  for (const k of ['generated_at', 'valid_until', 'freshness_stale_at', 'last_attested_by_seller_at'] as const) timestamp(m[k]);
  check(typeof m.stale === 'boolean' && m.freshness_expires_at === null, 'unrecognized_expiry_policy');
}
