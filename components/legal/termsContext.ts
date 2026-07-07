'use client';

import type { TermsPartyContext } from '@/api/legal';
import type { User } from '@/types';

type UserWithOrganization = User & {
  org_id?: string | null;
  organization_id?: string | null;
};

export function getTermsPartyContext(user: User | null | undefined): TermsPartyContext | null {
  if (!user) return null;

  const userWithOrganization = user as UserWithOrganization;
  const orgId = userWithOrganization.org_id || userWithOrganization.organization_id || undefined;
  const scope = user.company_name || orgId ? 'organization' : 'individual';

  return {
    scope,
    party_id: user.id,
    ...(orgId ? { org_id: orgId } : {}),
  };
}

export function isTermsGateEnforced() {
  return process.env.NEXT_PUBLIC_TERMS_GATE_ENFORCE === 'true';
}
