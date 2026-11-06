import type { SellerPayoutsResponse } from '@/api/heldPayouts';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export function recordingReversalFixture(): SellerPayoutsResponse['statement']['payments'][number] {
  return {
    id: id(23), correction_of_id: id(20), reason: 'recording_reversal',
    completed_at: null, paid_currency: null, paid_amount_cents: null,
    applied_to_payable_cents: -6000, uncertain: false,
  };
}

// Matches held_statement at backend f8a3a51f: mixed original treatments,
// a 100 payment applying only 60 to payable, and a separate uncertain import.
export function statementFixture(): SellerPayoutsResponse {
  return {
    seller_payout_method: 'held', seller_payout_decision_id: id(1),
    request_enabled: true, approval_enabled: true, requests: [],
    statement: {
      seller_id: id(2), currency: 'USD', period_start: '2026-10-01', period_end: '2026-11-07',
      period_basis: 'journal_entry_date', eligibility_as_of: '2026-11-06T12:00:00+00:00',
      totals: {
        opening_cents: 0, earned_cents: 40000, restored_cents: 1000, reductions_cents: 4000,
        offsets_cents: 1000, applied_payments_cents: 26000, closing_cents: 10000,
        debt_opening_cents: 0, debt_incurred_cents: 4000, debt_recovered_cents: 1000, debt_open_cents: 3000,
        total_paid_cents: 30000, held_paid_cents: 10000, connect_paid_cents: 20000,
        cash_returned_cents: 0, recording_reversed_cents: 0, gross_paid_cents: 30000,
      },
      held: {
        unpaid_cents: 10000, held_cents: 10000, available_cents: 0, active_claim_cents: 1000,
        claimed_amount_cents: 1000, projected_offset_cents: 0,
      },
      restricted: true, reasons: ['held_uncertain_payment'],
      details: [
        { id: id(10), order_ids: [id(3)], kind: 'earned', reason: 'earned', treatment: 'held', date: '2026-10-01', payable_cents: 20000, debt_cents: 0 },
        { id: id(11), order_ids: [id(4)], kind: 'earned', reason: 'earned', treatment: 'connect', date: '2026-10-01', payable_cents: 20000, debt_cents: 0 },
        { id: id(12), order_ids: [id(3)], kind: 'restored', reason: 'restored', treatment: 'held', date: '2026-10-02', payable_cents: 1000, debt_cents: 0 },
        { id: id(13), order_ids: [id(3)], kind: 'reduction', reason: 'refund', treatment: 'held', date: '2026-10-03', payable_cents: -4000, debt_cents: 0 },
        { id: id(15), order_ids: [id(3)], kind: 'applied_payment', reason: 'applied_payment', treatment: 'held', date: '2026-10-04', payable_cents: -6000, debt_cents: 4000 },
        { id: id(16), order_ids: [id(4)], kind: 'applied_payment', reason: 'applied_payment', treatment: 'connect', date: '2026-10-04', payable_cents: -20000, debt_cents: 0 },
        { id: id(14), order_ids: [id(3)], kind: 'posted_offset', reason: 'posted_offset', treatment: 'held', date: '2026-10-05', payable_cents: -1000, debt_cents: -1000 },
      ],
      orders: [{
        order_id: id(3), unpaid_cents: 10000, held_cents: 10000, available_cents: 0,
        active_claim_cents: 1000, claimed_amount_cents: 1000, projected_offset_cents: 0,
        hold_until: '2026-10-31T12:00:00+00:00', reasons: ['active_claim', 'held_uncertain_payment'],
      }],
      treatments: {
        held: { opening_cents: 0, earned_cents: 20000, closing_cents: 10000 },
        connect: { opening_cents: 0, earned_cents: 20000, closing_cents: 0 },
        unresolved: { opening_cents: 0, earned_cents: 0, closing_cents: 0 },
      },
      payments: [
        { id: id(20), correction_of_id: null, reason: 'completed_payment', completed_at: '2026-10-04T10:00:00+00:00', paid_currency: 'USD', paid_amount_cents: 10000, applied_to_payable_cents: 6000, uncertain: false },
        { id: id(21), correction_of_id: null, reason: 'connect_transfer', completed_at: '2026-10-04T10:00:00+00:00', paid_currency: 'USD', paid_amount_cents: 20000, applied_to_payable_cents: 20000, uncertain: false },
        { id: id(22), correction_of_id: null, reason: 'uncertain_payment', completed_at: '2026-10-06T10:00:00+00:00', paid_currency: 'EUR', paid_amount_cents: 5000, applied_to_payable_cents: 0, uncertain: true },
      ],
    },
  };
}
