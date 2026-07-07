import { api } from './client';

export type TermsAcceptanceScope = 'individual' | 'organization';

export interface TermsPartyContext {
  scope: TermsAcceptanceScope;
  party_id?: string;
  org_id?: string;
}

export interface TermsAcceptanceStatus {
  accepted: boolean;
  accepted_at?: string | null;
  terms_version?: string | null;
}

export interface TermsAcceptRequest extends TermsPartyContext {
  signer_full_name: string;
  signer_title: string;
  business_legal_name: string;
  authority_ack: boolean;
  ack_box1: boolean;
  ack_box2: boolean;
  ack_box3: boolean;
}

export interface TermsAcceptResponse extends TermsAcceptanceStatus {
  id?: string;
}

export async function getTermsAcceptanceStatus(context: TermsPartyContext): Promise<TermsAcceptanceStatus> {
  const res = await api.get<Record<string, unknown>>('/legal/terms/acceptance-status', {
    params: context,
  });
  return normalizeTermsStatus(res.data);
}

export async function acceptTerms(payload: TermsAcceptRequest): Promise<TermsAcceptResponse> {
  const res = await api.post<TermsAcceptResponse>('/legal/terms/accept', payload);
  return res.data;
}

function normalizeTermsStatus(data: Record<string, unknown>): TermsAcceptanceStatus {
  const accepted =
    data.accepted === true ||
    data.has_accepted === true ||
    data.terms_accepted === true ||
    data.is_accepted === true;

  return {
    accepted,
    accepted_at: typeof data.accepted_at === 'string' ? data.accepted_at : null,
    terms_version: typeof data.terms_version === 'string' ? data.terms_version : null,
  };
}
