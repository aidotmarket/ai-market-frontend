import { api } from './client';
import axios from 'axios';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { useAuthStore } from '@/store/auth';
import { checkoutDomainEnabled, validHandoffToken } from '@/lib/checkout-domain';
import type { CheckoutCreateResponse, CheckoutVerifyResponse, LicenseAcceptanceFields } from '@/types';

export type DomainCheckoutOptions =
  | { handoffToken: string; checkoutRequestId?: never }
  | { checkoutRequestId: string; handoffToken?: never };

export interface CheckoutHandoff {
  handoff_id: string;
  listing_id: string;
  version_id: string;
  status: 'open' | 'consumed' | 'expired' | 'superseded';
  expires_at: string;
  price_cents: number;
  currency: string;
  license_sha256: string;
  covenant_sha256: string;
  rider_sha256: string | null;
  checkout_status?: 'reserved' | 'provider_unknown' | 'finalised' | 'failed' | 'payment_conflict' | 'refunded';
  checkout_url?: string | null;
  transaction_id?: string;
  order_id?: string;
}

// No shared-client refresh/replay: the session and its CSRF must stay together.
const web = axios.create({
  baseURL: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1`,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

export function checkoutCsrf(accessToken: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(accessToken)));
}

function session() {
  const token = useAuthStore.getState().token;
  if (!token) throw new Error('FIRST_PARTY_SESSION_REQUIRED');
  return { csrf: checkoutCsrf(token), headers: { Authorization: `Bearer ${token}` } };
}

export async function getCheckoutHandoff(token: string): Promise<CheckoutHandoff> {
  if (!checkoutDomainEnabled()) throw new Error('CHECKOUT_UNAVAILABLE');
  if (!validHandoffToken(token)) throw new Error('INVALID_HANDOFF');
  const { csrf, headers } = session();
  const { data } = await web.get<CheckoutHandoff>(`/checkout-handoffs/${token}`, {
    headers: { ...headers, 'X-CSRF-Token': csrf },
  });
  if (!data || !['open', 'consumed', 'expired', 'superseded'].includes(data.status)
    || !['handoff_id', 'listing_id', 'version_id'].every(key => typeof data[key as keyof CheckoutHandoff] === 'string')
    || !Number.isFinite(Date.parse(data.expires_at)) || !Number.isSafeInteger(data.price_cents) || data.price_cents < 0
    || !/^[A-Z]{3}$/.test(data.currency) || !/^[a-f0-9]{64}$/.test(data.license_sha256)
    || !/^[a-f0-9]{64}$/.test(data.covenant_sha256)
    || (data.rider_sha256 !== null && !/^[a-f0-9]{64}$/.test(data.rider_sha256))) throw new Error('INVALID_RESPONSE');
  return data;
}

export async function createCheckout(
  listingId: string,
  versionId?: string,
  acceptance?: LicenseAcceptanceFields,
  options?: DomainCheckoutOptions,
): Promise<CheckoutCreateResponse> {
  if (checkoutDomainEnabled()) {
    if (!options || (!options.handoffToken && !options.checkoutRequestId)) throw new Error('CHECKOUT_REQUEST_ID_REQUIRED');
    if (options.handoffToken && !validHandoffToken(options.handoffToken)) throw new Error('INVALID_HANDOFF');
    if (options.checkoutRequestId && !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(options.checkoutRequestId)) throw new Error('INVALID_CHECKOUT_REQUEST_ID');
    if (!acceptance || acceptance.authority_confirmed !== true || !/^[A-Za-z]{2}$/.test(acceptance.jurisdiction)
      || !acceptance.typed_name.trim() || !acceptance.signer_title.trim() || !acceptance.business_legal_name.trim()) throw new Error('LICENSE_AUTHORITY_REQUIRED');
    const { csrf, headers } = session();
    const { data } = await web.post<CheckoutCreateResponse>('/checkout/create', {
      listing_id: listingId,
      ...(versionId ? { version_id: versionId } : {}),
      ...(options.handoffToken ? { handoff_token: options.handoffToken } : { checkout_request_id: options.checkoutRequestId }),
      ...acceptance,
      csrf,
    }, { headers });
    return data;
  }
  const frontendUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const res = await api.post<CheckoutCreateResponse>('/checkout/create', {
    listing_id: listingId,
    ...(versionId ? { version_id: versionId } : {}),
    ...(acceptance ?? {}),
    success_url: `${frontendUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${frontendUrl}/checkout/cancel`,
  });
  return res.data;
}

export async function verifyCheckout(sessionId: string, signal?: AbortSignal): Promise<CheckoutVerifyResponse> {
  const res = await api.get<CheckoutVerifyResponse>(`/checkout/verify/${encodeURIComponent(sessionId)}`, { signal });
  return res.data;
}
