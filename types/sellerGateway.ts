export interface DoorCheck {
  state: 'never' | 'pending' | 'passed' | 'failed';
  checked_at: string | null;
  failure_code: string | null;
  certificate_flags: string[];
}

export interface GatewayBlocker { code: string; file_id?: string; since?: string }

export interface SellerGateway {
  gateway_id: string;
  name: string;
  status: string;
  status_reason: string | null;
  version: string | null;
  minimum_version: string;
  last_seen_at: string | null;
  egress_check: { state: string; checked_at: string | null };
  door_url: string | null;
  door_check: DoorCheck;
  identity_ack_at: string | null;
  listing_count: number;
  open_order_count: number;
  can_publish: boolean;
  blockers: GatewayBlocker[];
}

export interface PairingCode {
  code: string;
  expires_at: string;
  image: string;
  version: string;
  minimum_version: string;
  install_guide_url: string;
  compose_snippet: string;
}

export interface GatewayFile {
  file_id: string;
  display_name: string;
  size_bytes: number;
  media_type: string;
  content_commitment: string;
  first_seen_at: string;
  changed_at: string;
  present: boolean;
  description: {
    state: 'not_requested' | 'requested' | 'described' | 'failed' | 'stale';
    requested_at: string | null;
    described_at: string | null;
    sha256: string | null;
    row_count: number;
    columns: { name: string; type: string; null_rate_pct: number | null; distinct_bucket: string }[];
    failure_code: string | null;
  };
  offerable: boolean;
  listing_version_ids: string[];
}

export type GatewayMessageType = 'hello' | 'inventory' | 'description' | 'receipt' | 'canary_result' | 'offer_ack' | 'prepare_ack' | 'revocation_ack' | 'error';
export interface ReceivedMessage {
  seq: number;
  received_at: string;
  message_type: GatewayMessageType;
  body: Record<string, unknown>;
}

export interface GatewayPage<T> { next_cursor: string | null; }
export interface FilesPage extends GatewayPage<GatewayFile> { files: GatewayFile[] }
export interface ReceivedPage extends GatewayPage<ReceivedMessage> { messages: ReceivedMessage[] }
export interface WithRetry<T> { data: T; retryAfter: number | null }
