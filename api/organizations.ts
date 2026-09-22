'use client';

import { api } from './client';

export interface OrganizationLegalIdentity {
  id: string;
  name: string;
  legal_name?: string | null;
  jurisdiction?: string | null;
  current_user_role?: string | null;
}

export async function getOrganization(organizationId: string): Promise<OrganizationLegalIdentity> {
  const response = await api.get<OrganizationLegalIdentity>(`/organizations/${encodeURIComponent(organizationId)}`);
  return response.data;
}

export async function reconcileOrganizationLegalIdentity(
  organizationId: string,
  payload: { legal_name: string; jurisdiction: string; reason: string },
): Promise<OrganizationLegalIdentity> {
  const response = await api.post<OrganizationLegalIdentity>(
    `/organizations/${encodeURIComponent(organizationId)}/legal-identity/reconcile`,
    payload,
  );
  return response.data;
}
