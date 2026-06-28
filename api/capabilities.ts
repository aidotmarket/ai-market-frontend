'use client';

import { api } from './client';

export type CapabilityStatus = 'not_requested' | 'provisioning' | 'active' | 'suspended';
export type CapabilityStep = 'profile_name' | 'company_name' | 'totp_enabled' | 'stripe_payouts_live';

export interface CapabilityReadiness {
  persisted_status: CapabilityStatus;
  effective_status: CapabilityStatus;
  missing_steps: CapabilityStep[];
  reason: string | null;
}

export interface NextAction {
  capability: 'seller';
  step: CapabilityStep;
}

export interface CapabilitySetResponse {
  buyer: CapabilityReadiness;
  seller: CapabilityReadiness;
  next_action: NextAction | null;
}

export async function getCapabilities(): Promise<CapabilitySetResponse> {
  const res = await api.get<CapabilitySetResponse>('/auth/capabilities');
  return res.data;
}

export async function requestSellerCapability(): Promise<CapabilitySetResponse> {
  const res = await api.post<CapabilitySetResponse>('/auth/capabilities/seller/request');
  return res.data;
}
