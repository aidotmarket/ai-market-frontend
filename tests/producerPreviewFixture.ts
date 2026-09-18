import {readFileSync} from 'node:fs';
import type {Commitment, Descriptor, Manifest, PlatformEnvelope, TrustedKeys} from '@/lib/listing-preview/types';
import {LIMITS} from '@/lib/listing-preview/types';

const fixture = (name: string) => JSON.parse(readFileSync(`tests/fixtures/preview/${name}`, 'utf8'));

export function producerV2ManifestFixture(): {manifest: Manifest; keys: TrustedKeys; now: number} {
  const signing = fixture('aim_preview_signing_v1.json');
  const requests = fixture('aim_preview_requests_v1.json');
  const envelope = signing.platform_envelope as PlatformEnvelope;
  const binding = envelope.binding;
  const commitment = requests.approve.commitment as Commitment;
  const descriptors = binding.schema_descriptors as Descriptor[];
  const first = commitment.proofs[0];
  const manifest = {
    profile: 'aim-listing-preview-v1', package_profile: 'aim-preview-package-v2',
    listing_id: binding.listing_id, listing_version_id: binding.listing_version_id,
    content_revision: binding.content_revision, source_revision: binding.source_revision,
    summary_approval_id: binding.summary_approval_id, summary_hash: binding.summary_hash,
    render_hash: binding.render_hash, disclosure_version: binding.disclosure_version,
    approval_status: 'approved', sample_hash: binding.sample_hash!, aggregate_hash: binding.aggregate_hash,
    preview_type: 'table', content_type: 'tabular', selected_fields: binding.selected_fields,
    columns: binding.selected_fields.map(name => ({name, type: descriptors.find(d => d[0] === name)![1]})),
    schema_descriptors: descriptors, commitment, proofs: commitment.proofs,
    checkpoint: signing.checkpoint, log_evidence: signing.log_evidence,
    approval: {platform_envelope: envelope},
    package: {url: first.preview_package_url, media_type: first.package_media_type, byte_ceiling: first.package_byte_ceiling},
    last_attested_by_seller_at: binding.last_attested_by_seller_at, stale: false,
    freshness_stale_at: '2026-10-15T00:00:00.000000Z', freshness_expires_at: null,
    generated_at: '2026-09-17T00:00:01.000000Z', valid_until: '2026-09-17T00:00:30.000000Z', limits: LIMITS,
  } as Manifest;
  const platformKey = signing.signatures.find((signature: {name: string}) => signature.name === 'platform-envelope').public_key;
  return {manifest, keys: {[envelope.key_id]: platformKey}, now: Date.parse('2026-09-17T00:00:01Z')};
}
