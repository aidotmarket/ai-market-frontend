'use client';

import { api } from './client';
import type { AxiosResponse } from 'axios';
import type {
  GatewayVerificationEpoch, GatewayVerificationLifecycleCommand,
  GatewayVerificationProbe, GatewayVerificationProbeCommand, GatewayVerificationStartCommand,
} from '@/types';

const root = (listingId: string) => `/data-verification/gateway/listings/${encodeURIComponent(listingId)}`;
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
