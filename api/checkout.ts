import { api } from './client';
import type { CheckoutCreateResponse, CheckoutVerifyResponse } from '@/types';

export async function createCheckout(listingId: string): Promise<CheckoutCreateResponse> {
  const frontendUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const res = await api.post<CheckoutCreateResponse>('/checkout/create', {
    listing_id: listingId,
    success_url: `${frontendUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${frontendUrl}/checkout/cancel`,
  });
  return res.data;
}

export async function verifyCheckout(sessionId: string, signal?: AbortSignal): Promise<CheckoutVerifyResponse> {
  const res = await api.get<CheckoutVerifyResponse>(`/checkout/verify/${encodeURIComponent(sessionId)}`, { signal });
  return res.data;
}
