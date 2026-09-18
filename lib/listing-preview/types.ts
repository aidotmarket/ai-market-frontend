/** Closed T wire identities. These types are not a verification result. */
export type Json = null | boolean | number | string | Json[] | {[key: string]: Json};
export type LogicalType = 'boolean' | 'signed_integer' | 'decimal' | 'string' | 'date' | 'timestamp' | 'array' | 'object';
export type Descriptor = [string, LogicalType, boolean, {[key: string]: Json}];
export type PreviewType = 'table' | 'image_gallery' | 'map' | 'timeseries_chart' | 'audio' | 'nested_json';
export interface Sibling {hash: string; direction: 'left' | 'right'}
export interface Proof {
  proof_id: string; base_row_digest: string; duplicate_ordinal: number; leaf_index: number; tree_size: number;
  siblings: Sibling[]; preview_package_url: string; package_media_type: 'application/vnd.aim.preview+json';
  package_profile: 'aim-preview-package-v2'; package_byte_ceiling: number;
  scan_policy: 'aim-preview-policy-v1' | 'aim-preview-policy-v2'; scan_policy_version: '1.0.0' | '2.0.0'; scan_verdict: 'passed'; scanned_at: string;
  sampled_leaf_list_digest: string; signer_reference: string; signature_algorithm: 'ed25519'; signature: string;
}
export interface Commitment {
  commitment_id: string; listing_id: string; seller_dataset_version: string; previous_commitment_id: string | null;
  canonicalization_profile: 'aim-dataset-merkle-v1'; hash_algorithm: 'sha-256'; schema_digest: string;
  dataset_merkle_root: string; leaf_count: number; seller_attestation_digest: string;
  aim_data_signer_reference: string; signature_algorithm: 'ed25519'; seller_signature: string;
  signed_at: string; proofs: Proof[];
}
export interface Binding {
  profile: 'aim-preview-disclosure-v1'; decision: 'approve' | 'withdraw'; summary_id: string;
  disclosure_version: string; seller_id: string; listing_id: string; listing_version_id: string | null;
  content_revision: string; source_revision: string; summary_approval_id: string; summary_hash: string; render_hash: string;
  selected_fields: string[]; preview_type: PreviewType | null; content_type: string | null;
  sample_decision: 'none' | 'approved'; sample_hash: string | null; aggregate_hash: string;
  commitment_id: string | null; schema_digest: string | null; seller_dataset_version: string | null;
  schema_descriptors: Descriptor[]; proof_ids: string[]; sampled_leaf_list_digest: string | null;
  scan_attestation_digest: string | null; rights_basis_digest: string | null;
  rights_basis_code: 'owner' | 'licensed' | 'public_domain' | 'other_authorized' | null;
  public_preview_permission: boolean | null; approved_by: string; approved_at: string;
  last_attested_by_seller_at: string; update_cadence_days: number | null; approval_expires_at: string | null;
  supersedes: string | null; request_id: string; expected_current_disclosure_id: string | null;
  signer_reference: string; signature_algorithm: 'ed25519'; signature_profile: 'aim-preview-disclosure-signature-v1';
}
export interface SignerKey {
  key_id: string; algorithm: 'ed25519'; public_key: string; status: 'active' | 'rotated' | 'revoked';
  valid_from: string; valid_until?: string | null; fingerprint: string;
}
export interface PlatformEnvelope {
  profile: 'aim-preview-platform-envelope-v1'; key_id: string; signature_algorithm: 'ed25519';
  binding: Binding; seller_signature: string; signer_keys: SignerKey[]; signature: string;
}
export interface Checkpoint {
  log_id: string; tree_size: number; root_hash: string; checkpoint_at: string;
  key_id: string; public_key_algorithm: 'ed25519'; signature: string;
}
export interface LogEvidence {
  entry: Omit<Commitment, 'proofs'> & {appended_at: string; transparency_sequence: number};
  inclusion_path: Sibling[]; consistency_path: string[]; previous_tree_size: number | null; previous_root: string | null;
}
export interface Manifest {
  profile: 'aim-listing-preview-v1'; package_profile: 'aim-preview-package-v2'; listing_id: string;
  listing_version_id: string | null; content_revision: string; source_revision: string;
  summary_approval_id: string; summary_hash: string; render_hash: string; disclosure_version: string;
  approval_status: 'approved'; sample_hash: string; aggregate_hash: string; preview_type: PreviewType; content_type: string;
  columns: {name: string; type: LogicalType}[]; selected_fields: string[]; schema_descriptors: Descriptor[];
  commitment: Commitment; proofs: Proof[]; checkpoint: Checkpoint; log_evidence: LogEvidence;
  approval: {platform_envelope: PlatformEnvelope}; package: {url: string; media_type: string; byte_ceiling: number};
  last_attested_by_seller_at: string; stale: boolean; freshness_stale_at: string; freshness_expires_at: string | null;
  generated_at: string; valid_until: string; limits: typeof LIMITS;
}
export const LIMITS = {rows: 100, fields: 25, canonical_bytes: 250000, envelope_bytes: 1048576,
  manifest_bytes: 262144, siblings: 63, depth: 16, nodes: 10000} as const;
export interface PackageEntry {
  proof_id: string; row: {[name: string]: Json}; base_row_digest: string; duplicate_ordinal: number;
  leaf_index: number; tree_size: number; siblings: Sibling[];
}
export interface PreviewPackage {
  package_profile: 'aim-preview-package-v2'; commitment_id: string; schema_digest: string;
  disclosure_version: string; sample_hash: string; entries: PackageEntry[];
}
export type Cell = {kind: 'missing' | 'null' | LogicalType; value: Json};
export interface VerifiedEntry {readonly proofId: string; readonly row: Readonly<Record<string, Json>>; readonly cells: Readonly<Record<string, Cell>>}
// Private brand prevents accidental API JSON -> table assignment. The verifier also
// checks a WeakSet at runtime; type assertions cannot manufacture a valid handle.
declare const verified: unique symbol;
export interface VerifiedSample {
  readonly [verified]: true; readonly manifest: Readonly<Manifest>;
  readonly entries: readonly VerifiedEntry[];
}
export type TrustedKeys = Readonly<Record<string, string>>;
export type TrustedCheckpoint = Pick<Checkpoint, 'log_id' | 'tree_size' | 'root_hash'>;
