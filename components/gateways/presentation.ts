import type { GatewayBlocker, GatewayFile, SellerGateway } from '@/types/sellerGateway';

export const DESCRIPTION_CONFIRMATION = "ai.market will receive this file's column names (after your gateway's rename and drop settings), their types, the row count, null rates rounded to 5%, bucketed distinct counts, and the file's SHA-256. It will not receive any values.";

export function dateLabel(value: string | null): string {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString();
}

export function statusReason(reason: string | null): string | null {
  if (!reason) return null;
  return ({
    egress_open: 'The network can reach more than the allowed ai.market host.',
    egress_unknown: 'The network restriction check has not passed.',
    version_below_minimum: 'Update the gateway to the minimum version.',
    never_connected: 'This gateway has not connected yet.',
  } as Record<string, string>)[reason] ?? 'This gateway needs attention. Check its status and try again.';
}

export function blockerMessage(blocker: GatewayBlocker, files: GatewayFile[]): string {
  const name = files.find(file => file.file_id === blocker.file_id)?.display_name ?? 'This file';
  return ({
    gateway_offline: 'The gateway is offline. Check its connection.',
    gateway_revoked: 'This gateway has been revoked.',
    version_below_minimum: 'Update the gateway to the minimum version.',
    egress_open: 'Restrict outbound network access to api.ai.market, then rerun the check.',
    door_url_missing: 'Add a door URL.',
    door_check_not_passed: 'Run a door check and resolve any failure.',
    door_check_stale: 'Run the door check again. The last pass is over 10 minutes old.',
    identity_ack_missing: 'Read and acknowledge the identity notice.',
    file_not_described: `${name} needs a current description.`,
    file_stale: `${name} changed. Describe it again.`,
    file_missing: `${name} is missing from the latest inventory.`,
  } as Record<string, string>)[blocker.code] ?? 'This gateway needs attention. Check its setup and try again.';
}

export function doorFailure(code: string | null): string | null {
  if (!code) return null;
  return ({
    dns_failed: 'The door hostname could not be found in DNS.',
    address_not_public: 'The door hostname resolves to a nonpublic address.',
    tls_failed: 'The door TLS connection failed. Check its certificate.',
    redirect_refused: 'The door redirected the check. Use the final door URL directly.',
    timeout: 'The door did not respond in time.',
    bad_signature: 'The gateway response signature did not verify.',
    gateway_mismatch: 'The door answered for a different gateway.',
    response_too_large: 'The door response exceeded the allowed size.',
  } as Record<string, string>)[code] ?? 'The door check failed. Check the gateway and try again.';
}

export function descriptionFailure(code: string | null): string {
  return ({
    unsupported_format: 'This file format cannot be described.',
    read_error: 'The gateway could not read this file.',
    gateway_timeout: 'The gateway did not finish describing this file in time.',
  } as Record<string, string>)[code ?? ''] ?? 'The file could not be described. Check the gateway and try again.';
}

export function gatewaySummary(gateway: SellerGateway): string {
  return `${gateway.status}${gateway.status_reason ? `: ${statusReason(gateway.status_reason)}` : ''}`;
}
