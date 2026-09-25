// Body values are from aidotmarket/aim-data-gateway origin/main contract/vectors/*.json input.
import type { GatewayFile, ReceivedMessage, SellerGateway } from '@/types/sellerGateway';

export const gateway: SellerGateway = {
  gateway_id: '11111111-1111-4111-8111-111111111111', name: 'Test gateway', status: 'online', status_reason: null,
  version: '1.0.0', minimum_version: '1.0.0', last_seen_at: '2026-01-01T00:00:00Z',
  egress_check: { state: 'closed', checked_at: '2026-01-01T00:00:00Z' }, door_url: 'https://door.example',
  door_check: { state: 'never', checked_at: null, failure_code: null, certificate_flags: [] },
  identity_ack_at: null, listing_count: 1, open_order_count: 0, can_publish: false, blockers: [],
};

export const file: GatewayFile = {
  file_id: '0123456789abcdef0123456789abcdef', display_name: 'file-01234567.csv', size_bytes: 2,
  media_type: 'text/csv', content_commitment: 'b'.repeat(64), first_seen_at: '2026-01-01T00:00:00Z',
  changed_at: '2026-01-01T00:00:00Z', present: true, offerable: false, listing_version_ids: [],
  description: { state: 'not_requested', requested_at: null, described_at: null, sha256: null, row_count: 0, columns: [], failure_code: null },
};

export const bodies: Record<ReceivedMessage['message_type'], Record<string, unknown>> = {
  hello: { gid: gateway.gateway_id, nonce: 'test-only-nonce', ts: '2026-01-01T00:00:00Z', version: '1.0.0' },
  inventory: { files: [{ changed_at: '2026-01-01T00:00:00Z', content_commitment: 'b'.repeat(64), display_name: 'file-01234567.csv', file_id: file.file_id, first_seen_at: '2026-01-01T00:00:00Z', media_type: 'text/csv', present: true, size_bytes: 2 }], generation: 1 },
  description: { columns: [{ distinct_bucket: '2-10', name: 'safe', null_rate_pct: 0, type: 'integer' }], file_id: file.file_id, row_count: 2, sha256: 'a'.repeat(64) },
  receipt: { blocks_verified: true, fid: file.file_id, first_byte_at: '2026-01-01T00:00:00Z', jtis: ['44444444-4444-4444-8444-444444444444'], last_byte_at: '2026-01-01T00:00:01Z', max_serves_reached_bytes: 0, oid: '22222222-2222-4222-8222-222222222222', op: 'receipt', outcome: 'complete', seq: 1, sha256: 'a'.repeat(64), size_bytes: 2, transmitted: [[0, 1]], transmitted_bytes: 2 },
  canary_result: { at: '2026-01-01T00:00:00Z', dns: 'closed', label: 'test-only', proxy: 'closed', state: 'closed', tcp: 'closed' },
  offer_ack: { fid: file.file_id, iid: '44444444-4444-4444-8444-444444444444', ready: true, refusal: null },
  prepare_ack: { fid: file.file_id, iid: '44444444-4444-4444-8444-444444444444', interval_count: 0, max_serve_count: 0, oid: '22222222-2222-4222-8222-222222222222', op: 'prepare_ack', ready: true, refusal: null, resume_offset: 0, transmitted_bytes: 0 },
  revocation_ack: { jti: '44444444-4444-4444-8444-444444444444', op: 'revoke_ack', state_before: 'active' },
  error: { code: 'read_error', message: 'test only' },
};
