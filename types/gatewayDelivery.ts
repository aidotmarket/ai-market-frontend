export type GatewayBlockedCode = 'complete' | 'rate_limited' | 'gateway_unavailable' | 'gateway_revoked' | 'coverage_exhausted' | 'order_not_deliverable';

export interface GatewayPermission {
  token: string;
  jti: string;
  start_deadline: string;
  transfer_deadline: string;
  download_url: string;
  browser_url: string;
  resume_offset: number;
}

export interface GatewayDeliveryFile {
  file_id: string;
  display_name: string;
  size_bytes: number;
  sha256: string;
  state: 'not_started' | 'in_progress' | 'delivered';
  transmitted_bytes: number;
  permission: GatewayPermission | null;
  reissue: { allowed: boolean; remaining_24h: number; blocked_code: GatewayBlockedCode | null };
}

export interface GatewayProblem {
  problem_id: string;
  category: 'missing_data' | 'corrupted';
  file_ids: string[];
  opened_at: string;
  opened_by: 'customer' | 'system';
  state: 'open' | 'refund_pending' | 'resolved';
  resolution: 'released' | 'refunded' | 'partially_refunded' | null;
  support_case_id: string;
}

export interface GatewayDelivery {
  door_url: string;
  hold: { state: 'pending_confirmation' | 'held_until' | 'no_hold'; until: string | null; disputable: boolean };
  problem: GatewayProblem | null;
  files: GatewayDeliveryFile[];
}
