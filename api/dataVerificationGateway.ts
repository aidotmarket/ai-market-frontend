'use client';

import { api } from './client';
import type { AxiosResponse } from 'axios';
import type {
  GatewayVerificationEpoch, GatewayVerificationLifecycleCommand,
  GatewayVerificationProbe, GatewayVerificationProbeCommand, GatewayVerificationStartCommand,
} from '@/types';

const root = (listingId: string) => `/data-verification/gateway/listings/${encodeURIComponent(listingId)}`;
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
  const response = (error as { response?: { status?: number; data?: { detail?: string } } })?.response;
  if (response?.status === 401) return 'Sign in to verify your data.';
  if (response?.status === 404 || response?.status === 403) return 'This listing or verification is not available.';
  return verificationRefusalCopy(response?.data?.detail);
}
export function verificationRefusalCopy(code?: string | null): string {
  switch (code) {
    case E7_REFUSAL: return E7_REFUSAL;
    case 'verifier_upgrade_or_offline': return 'Reconnect your gateway or upgrade it to a version that supports data verification, then try again.';
    case 'source_unreachable': return 'Your gateway or data is offline. Reconnect it and try again.';
    case 'verification_disabled': return 'Data verification is currently unavailable.';
    case 'quote_binding_or_expiry': return 'This quote has expired or your data has changed. Check your data again for a new quote.';
    case 'source_changed': return 'Your data has changed. Check your data again for a new quote.';
    default: return 'We could not complete this request. Try again.';
  }
}
