import { api } from './client';

export type TermsAcceptanceScope = 'individual' | 'organization';
export type TermsAcceptanceContext = 'buyer' | 'seller';

export interface TermsPartyContext {
  scope: TermsAcceptanceScope;
  party_id?: string;
  org_id?: string;
}

export interface TermsAcceptanceStatus {
  accepted: boolean;
  accepted_at?: string | null;
  terms_version?: string | null;
  current_version?: string | null;
  accepted_version?: string | null;
}

export interface TermsAcceptRequest extends TermsPartyContext {
  context?: TermsAcceptanceContext;
  terms_version: string;
  terms_hash_sha256: string;
  signer_full_name: string;
  signer_title: string;
  business_legal_name: string;
  jurisdiction?: string;
  authority_ack: boolean;
  ack_box1: boolean;
  ack_box2: boolean;
  ack_box3: boolean;
}

export interface CurrentTerms {
  terms_version: string;
  terms_hash_sha256: string;
  effective_at: string | null;
  markdown?: string;
  text_url?: string;
}

export async function getCurrentTerms(): Promise<CurrentTerms> {
  const res = await api.get<CurrentTerms>('/legal/terms/current', {
    adapter: 'fetch',
    fetchOptions: { cache: 'no-store' },
  });
  return res.data;
}

export interface TermsAcceptResponse extends TermsAcceptanceStatus {
  id?: string;
}

export async function getTermsAcceptanceStatus(context: TermsPartyContext): Promise<TermsAcceptanceStatus> {
  const res = await api.get<Record<string, unknown>>('/legal/terms/acceptance-status', {
    params: context,
    adapter: 'fetch',
    fetchOptions: { cache: 'no-store' },
  });
  return normalizeTermsStatus(res.data);
}

export async function acceptTerms(payload: TermsAcceptRequest): Promise<TermsAcceptResponse> {
  const res = await api.post<TermsAcceptResponse>('/legal/terms/accept', { ...payload, context: payload.context ?? 'buyer' });
  return res.data;
}

function normalizeTermsStatus(data: Record<string, unknown>): TermsAcceptanceStatus {
  const accepted =
    data.accepted === true ||
    data.has_accepted === true ||
    data.terms_accepted === true ||
    data.is_accepted === true;

  return {
    accepted: accepted && !(typeof data.current_version === 'string' && typeof data.accepted_version === 'string' && data.current_version !== data.accepted_version),
    current_version: typeof data.current_version === 'string' ? data.current_version : null,
    accepted_version: typeof data.accepted_version === 'string' ? data.accepted_version : null,
    accepted_at: typeof data.accepted_at === 'string' ? data.accepted_at : null,
    terms_version: typeof data.terms_version === 'string' ? data.terms_version : null,
  };
}
