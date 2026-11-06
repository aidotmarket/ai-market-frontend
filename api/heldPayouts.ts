import { api } from './client';

export type PayoutTreatment = 'held' | 'connect' | 'unresolved';
export interface StatementPeriod {
  period_start?: string;
  period_end?: string;
}

export interface HeldStatement {
  seller_id: string;
  currency: string;
  period_start: string;
  period_end: string;
  period_basis: 'journal_entry_date';
  eligibility_as_of: string;
  totals: {
    opening_cents: number;
    earned_cents: number;
    restored_cents: number;
    reductions_cents: number;
    offsets_cents: number;
    applied_payments_cents: number;
    closing_cents: number;
    debt_opening_cents: number;
    debt_incurred_cents: number;
    debt_recovered_cents: number;
    debt_open_cents: number;
    total_paid_cents: number;
    held_paid_cents: number;
    connect_paid_cents: number;
    cash_returned_cents: number;
    recording_reversed_cents: number;
    gross_paid_cents: number;
  };
  held: {
    unpaid_cents: number;
    held_cents: number;
    available_cents: number;
    active_claim_cents: number;
    claimed_amount_cents: number;
    projected_offset_cents: number;
  };
  restricted: boolean;
  reasons: string[];
  details: {
    id: string;
    order_ids: string[];
    kind: string;
    reason: string;
    treatment: PayoutTreatment;
    date: string;
    payable_cents: number;
    debt_cents: number;
  }[];
  orders: (HeldStatement['held'] & {
    order_id: string;
    hold_until: string | null;
    reasons: string[];
  })[];
  treatments: Record<PayoutTreatment, {
    opening_cents: number;
    earned_cents: number;
    closing_cents: number;
  }>;
  payments: {
    id: string;
    correction_of_id: string | null;
    reason: string;
    completed_at: string | null;
    paid_currency: string | null;
    paid_amount_cents: number | null;
    applied_to_payable_cents: number;
    uncertain: boolean;
  }[];
}

export interface SellerPayoutsResponse {
  seller_payout_method: 'connect' | 'held';
  seller_payout_decision_id: string | null;
  request_enabled: boolean;
  approval_enabled: boolean;
  requests: {
    id: string;
    seller_id: string;
    requested_by_user_id: string;
    requested_at: string;
    reason: string;
    terms_acceptance_id: string;
    identity_event_id: string;
    identity_version: number;
    status: 'pending' | 'approved' | 'declined';
    decided_at: string | null;
    decision_event_id: string | null;
  }[];
  statement: HeldStatement;
}

// Both representations use the authenticated own-seller endpoint and GL dates.
export async function getHeldStatement(period: StatementPeriod, signal: AbortSignal) {
  const { data } = await api.get<SellerPayoutsResponse>('/seller/payouts', {
    params: { currency: 'USD', ...period, format: 'json' }, signal,
  });
  if (!data.statement) throw new Error('Statement unavailable');
  return data;
}

export async function downloadHeldStatement(period: StatementPeriod, signal: AbortSignal) {
  const { data } = await api.get<Blob>('/seller/payouts', {
    params: { currency: 'USD', ...period, format: 'csv' }, responseType: 'blob', signal,
  });
  return data;
}
