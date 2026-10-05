'use client';

import { api } from './client';
import type { AxiosResponse } from 'axios';
import type {
  GatewayVerificationEpoch, GatewayVerificationLifecycleCommand,
  GatewayVerificationProbe, GatewayVerificationProbeCommand, GatewayVerificationStartCommand,
} from '@/types';

const root = (listingId: string) => `/data-verification/gateway/listings/${encodeURIComponent(listingId)}`;
export type AWSSetupCommand = { connection_id: string } & (
  { replace_runner_id?: never; confirm_replace?: never } |
  { replace_runner_id: string; confirm_replace: true }
);
export interface AWSSetupResponse {
  connection_id: string;
  expires_at_utc: string;
  quick_create_url: string;
  scanner_version: string;
  image_digest: string;
}
export interface AWSVerifierStatus {
  state: 'none' | 'waiting' | 'ready' | 'removed';
  eligible: boolean;
  connection_id: string | null;
  runner_id: string | null;
  region: string | null;
  code_sha256: string | null;
  registered_at: string | null;
  last_seen_at: string | null;
  poll_interval_minutes: number | null;
  setup_expires_at: string | null;
}
export async function setupAwsVerifier(command: AWSSetupCommand): Promise<AWSSetupResponse> {
  // The caller sends this directly to the console tab, never to saved attempts.
  return (await api.post<AWSSetupResponse>('/verification-runners/setup', command)).data;
}
export async function getAwsVerifierStatus(listingId: string): Promise<AWSVerifierStatus> {
  return (await api.get<AWSVerifierStatus>('/verification-runners/aws/status', { params: { listing_id: listingId } })).data;
}
export async function removeVerificationRunner(runnerId: string): Promise<void> {
  await api.delete(`/verification-runners/${encodeURIComponent(runnerId)}`, { data: { confirm: true } });
}
export type GatewayVerificationErrorDetail = string | { code: string; epoch_id?: string };
export interface GatewayVerificationErrorResponse { detail: GatewayVerificationErrorDetail }

export function gatewayVerificationError(error: unknown): { status?: number; code?: string; epochId?: string } {
  const response = (error as { response?: { status?: number; data?: GatewayVerificationErrorResponse } })?.response;
  const detail = response?.data?.detail;
  return {
    status: response?.status,
    code: typeof detail === 'string' ? detail : typeof detail?.code === 'string' ? detail.code : undefined,
    epochId: typeof detail === 'object' && detail !== null && typeof detail.epoch_id === 'string' ? detail.epoch_id : undefined,
  };
}

export interface VerificationResponse<T> { data: T; retryAfter: number }
function withRetry<T>(response: AxiosResponse<T>): VerificationResponse<T> {
  const seconds = Number(response.headers['retry-after']);
  return { data: response.data, retryAfter: Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 60) : 2 };
}
export async function probeGatewayVerification(listingId: string, command: GatewayVerificationProbeCommand) {
  return withRetry(await api.post<GatewayVerificationProbe>(`${root(listingId)}/probe`, command));
}
export async function getGatewayVerificationProbe(listingId: string, probeId: string) {
  return withRetry(await api.get<GatewayVerificationProbe>(`${root(listingId)}/probes/${encodeURIComponent(probeId)}`));
}
export async function startGatewayVerification(listingId: string, command: GatewayVerificationStartCommand) {
  return withRetry(await api.post<GatewayVerificationEpoch>(`${root(listingId)}/start`, command));
}
export async function getGatewayVerificationEpoch(listingId: string, epochId: string) {
  return withRetry(await api.get<GatewayVerificationEpoch>(`${root(listingId)}/epochs/${encodeURIComponent(epochId)}`));
}
export async function gatewayVerificationLifecycle(listingId: string, command: GatewayVerificationLifecycleCommand) {
  return withRetry(await api.post<GatewayVerificationEpoch>(`${root(listingId)}/epochs/${encodeURIComponent(command.verification_id)}/${command.requested_action}`, command));
}
export const E7_REFUSAL = "Some columns of this data are hidden in your gateway settings, so it can't be verified.";
export function verificationErrorCopy(error: unknown): string {
  const response = gatewayVerificationError(error);
  if (response?.status === 401) return 'Sign in to verify your data.';
  if (response?.status === 404 || response?.status === 403) return 'This listing or verification is not available.';
  return verificationRefusalCopy(response.code);
}
export function verificationRefusalCopy(code?: string | null): string {
  switch (code) {
    case 'aws_connection_unavailable': return 'Your AWS storage connection is unavailable. Reconnect it before setting up the verifier.';
    case 'aws_region_unsupported': return 'The AWS verifier is not available in this storage region.';
    case 'aws_release_unavailable': return 'The AWS verifier release is unavailable in this region. Try again later.';
    case 'aws_source_scope_unrepresentable': return 'This source has too many storage locations or needs permissions the AWS verifier cannot safely scope. Verify it with your own AIM Data gateway instead.';
    case 'aws_source_too_large': return 'This source is too large for the AWS verifier. Verify it with your own AIM Data gateway instead.';
    case 'unsupported_type': return 'This source contains a file type the verifier does not support.';
    case 'listing_source_mismatch': return 'The saved source for this listing could not be confirmed. Review and publish its source before trying again.';
    case 'replacement_runner_mismatch': return 'The verifier has changed. Check its status before confirming a replacement.';
    case 'replacement_confirmation_required': return 'A verifier already exists. Confirm replacement before setting up a new verifier.';
    case 'registration_expired': return 'This verifier setup has expired. Set up the verifier again to get a fresh registration.';
    case 'registration_replayed': return 'This registration has already been used. Check the registered verifier or remove it before setting up a replacement.';
    case 'registration_refused': return 'The verifier registration was refused. Check its status and set up a fresh verifier if needed.';
    case 'aws_setup_refused': return 'The AWS verifier could not be set up. Check your storage connection and try again.';
    case E7_REFUSAL: return E7_REFUSAL;
    case 'verifier_upgrade_or_offline': return 'Reconnect your gateway or upgrade it to a version that supports data verification, then try again.';
    case 'source_unreachable': return 'Your gateway or data is offline. Reconnect it and try again.';
    case 'verification_disabled': return 'Data verification is currently unavailable.';
    case 'quote_binding_or_expiry': return 'This quote has expired or your data has changed. Check your data again for a new quote.';
    case 'verification_in_progress': return 'Verification is already in progress. Check its status before starting again.';
    case 'source_changed': return 'Your data has changed. Check your data again for a new quote.';
    default: return 'We could not complete this request. Try again.';
  }
}
