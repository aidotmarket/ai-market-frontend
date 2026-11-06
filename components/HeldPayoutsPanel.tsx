'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { downloadHeldStatement, getHeldStatement, type HeldStatement, type SellerPayoutsResponse, type StatementPeriod } from '@/api/heldPayouts';

const treatmentNames = { held: 'International payout', connect: 'Stripe', unresolved: 'Unresolved' };
const totalsLabels: [keyof HeldStatement['totals'], string][] = [
  ['opening_cents', 'Opening'], ['earned_cents', 'Earned share'], ['restored_cents', 'Restored'],
  ['reductions_cents', 'Reductions'], ['offsets_cents', 'Posted debt offsets'],
  ['applied_payments_cents', 'Applied payments'], ['closing_cents', 'Closing'],
  ['debt_opening_cents', 'Opening debt'], ['debt_incurred_cents', 'Debt incurred'],
  ['debt_recovered_cents', 'Debt recovered'], ['debt_open_cents', 'Open debt'],
  ['gross_paid_cents', 'Paid before returns and recording reversals'],
  ['cash_returned_cents', 'Cash returned'], ['recording_reversed_cents', 'Recording reversals'],
  ['held_paid_cents', 'International payments, net'], ['connect_paid_cents', 'Stripe payments'],
  ['total_paid_cents', 'Total paid, net'],
];

function money(cents: number | null, currency: string | null): string {
  if (cents === null || !currency) return 'Not confirmed';
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency, currencyDisplay: 'code' }).format(cents / 100);
}

function Amount({ label, cents, currency, emptyText = 'Not confirmed' }: { label: string; cents: number | null; currency: string | null; emptyText?: string }) {
  return <div className="flex justify-between gap-4"><dt>{label}</dt><dd className="font-medium tabular-nums">{cents === null || !currency ? emptyText : money(cents, currency)}</dd></div>;
}

const reasonSentences: Record<string, string> = {
  held_fee_pending: 'The payment processing fee is still being confirmed.',
  seller_debt_reconciliation_required: 'Your outstanding debt needs to be checked before payment eligibility can be confirmed.',
  historical_eligibility_not_evaluated: 'Payment eligibility is not assessed for past periods.',
  capture_journal_unposted_or_conflicting: 'The sale’s accounting records need to be checked before payment eligibility can be confirmed.',
  held_manual_projection_mismatch: 'Recorded international payments need to be reconciled with your balance.',
  held_liability_projection_mismatch: 'Your international balance needs to be reconciled with the accounting records.',
  held_uncertain_payment: 'An earlier payment record needs to be confirmed before payment eligibility can be assessed.',
  active_claim: 'Part of your balance is reserved for a payment under review.',
  earned: 'Your share of a sale was added to your balance.',
  restored: 'An amount was restored to your balance.',
  refund: 'A refund reduced your balance.',
  applied_payment: 'A payment was applied to the amount we owe you.',
  posted_offset: 'Part of your balance was used to reduce your outstanding debt.',
  completed_payment: 'An international payment was recorded as completed.',
  connect_transfer: 'A Stripe payment was recorded.',
  uncertain_payment: 'An earlier payment record has not been confirmed.',
  recording_reversal: 'An earlier payment recording was reversed.',
  allocation_correction: 'The amount applied to your balance was corrected.',
  cash_return: 'A return of funds was recorded.',
};

function reasonSentence(reason: string): string {
  return Object.hasOwn(reasonSentences, reason) ? reasonSentences[reason] : 'Further checks are needed for this statement item.';
}

function Reasons({ reasons }: { reasons: string[] }) {
  return reasons.length > 0 ? <p className="mt-2 break-words">Restriction reasons: {reasons.map(reasonSentence).join(' ')}</p> : null;
}

export default function HeldPayoutsPanel({ ownOperation }: { ownOperation: () => () => boolean }) {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [selection, setSelection] = useState<{ period: StatementPeriod }>({ period: {} });
  const [response, setResponse] = useState<SellerPayoutsResponse | null>(null);
  // Keep established visibility while another period is loading or fails.
  const [hasHeldPayouts, setHasHeldPayouts] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [periodError, setPeriodError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const generation = useRef(0);
  const downloadController = useRef<AbortController | null>(null);
  // Tomorrow is the latest exclusive GL date accepted by the server (UTC).
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  useEffect(() => {
    const isCurrent = ownOperation();
    const controller = new AbortController();
    const version = ++generation.current;
    const current = () => !controller.signal.aborted && version === generation.current && isCurrent();
    if (!current()) return;
    setLoading(true);
    setError('');
    setResponse(null);
    setDownloading(false);
    setDownloadError('');
    getHeldStatement(selection.period, controller.signal).then(data => {
      if (current()) {
        setResponse(data);
        setHasHeldPayouts(data.seller_payout_method === 'held' || data.statement.orders.length > 0 || data.statement.payments.some(payment => payment.reason !== 'connect_transfer'));
      }
    }).catch(() => {
      if (current()) setError('We couldn’t load your statement. Please try again.');
    }).finally(() => { if (current()) setLoading(false); });
    return () => {
      controller.abort();
      downloadController.current?.abort();
      generation.current++;
    };
  }, [selection, ownOperation]);

  function applyPeriod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ownOperation()()) return;
    if ((start && end && start >= end) || (start && start >= tomorrow) || (end && end > tomorrow)) {
      setPeriodError('Choose a start before the end date, with an end date no later than tomorrow (UTC).');
      return;
    }
    setPeriodError('');
    // Invalidate pending downloads immediately, before the next effect runs.
    generation.current++;
    downloadController.current?.abort();
    setSelection({ period: { ...(start ? { period_start: start } : {}), ...(end ? { period_end: end } : {}) } });
  }

  async function download() {
    const isCurrent = ownOperation();
    if (!isCurrent() || loading || !response) return;
    const version = generation.current;
    const controller = new AbortController();
    downloadController.current = controller;
    const current = () => !controller.signal.aborted && version === generation.current && isCurrent();
    setDownloading(true);
    setDownloadError('');
    try {
      // Pin the server's resolved dates too, so an all-history download cannot
      // silently include another day if midnight passes after the screen loads.
      const blob = await downloadHeldStatement({
        period_start: response.statement.period_start,
        period_end: response.statement.period_end,
      }, controller.signal);
      if (!current()) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'held-statement.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Allow the browser to begin consuming the Blob before releasing it.
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      if (current()) setDownloadError('We couldn’t download your statement. Please try again.');
    } finally {
      if (current()) setDownloading(false);
    }
  }

  const statement = response?.statement;
  if (!hasHeldPayouts) return null;
  return <section aria-labelledby="held-statement-heading" className="my-6 rounded-xl border border-gray-200 bg-white p-6 text-sm shadow-sm">
    <h2 id="held-statement-heading" className="mb-3 text-lg font-semibold">International payout statement</h2>
    <p>International payouts use USDC on Solana, recorded as USD at 1:1. Historic international sales remain here after switching to Stripe.</p>
    <p className="mt-2">Available means eligible for an approved payment; it does not mean paid or withdrawable. There is no fixed payment schedule or business minimum. An external rail minimum may apply.</p>
    <form onSubmit={applyPeriod} className="my-4 flex flex-wrap items-end gap-3">
      <label>Period start (inclusive)<input type="date" value={start} max={tomorrow} onChange={e => setStart(e.target.value)} className="block rounded border p-2" /></label>
      <label>Period end (exclusive)<input type="date" value={end} max={tomorrow} onChange={e => setEnd(e.target.value)} className="block rounded border p-2" /></label>
      <button type="submit" className="rounded border px-3 py-2">Show statement</button>
    </form>
    <p>Leave dates blank for all history through today. Periods use GL posting dates, including the start and excluding the end (UTC).</p>
    {periodError && <p role="alert" className="mt-2 text-red-700">{periodError}</p>}
    {loading && <p role="status" className="mt-4">Loading statement…</p>}
    {error && <div role="alert" className="mt-4"><p>{error}</p><button type="button" onClick={() => setSelection({ period: selection.period })} className="mt-2 underline">Try again</button></div>}
    {statement && <>
      <p className="mt-4">Period: {statement.period_start === '0001-01-01' ? 'Beginning of history' : statement.period_start} to {statement.period_end} (exclusive).</p>
      <p>Eligibility observed: {statement.eligibility_as_of}. Past periods do not reconstruct past payment eligibility.</p>
      {response.seller_payout_method === 'connect' && <p className="mt-2">Your current payout method is Stripe. These records retain each sale’s original payout treatment.</p>}
      <button type="button" disabled={downloading} onClick={download} className="my-4 rounded border px-3 py-2 disabled:opacity-50">{downloading ? 'Downloading…' : 'Download CSV'}</button>
      {downloadError && <p role="alert">{downloadError}</p>}
      <h3 className="mb-2 font-semibold">Statement totals</h3>
      <p>Includes original international, Stripe and unresolved treatments, shown separately below. Earned share precedes the itemised deductions.</p>
      <dl aria-label="Statement totals" className="my-3 space-y-2">{totalsLabels.map(([key, label]) => <Amount key={key} label={label} cents={statement.totals[key]} currency={statement.currency} />)}</dl>
      <div className="overflow-x-auto"><table className="my-4 w-full text-left"><caption className="text-left font-semibold">Original payout treatments</caption><thead><tr><th scope="col">Treatment</th><th scope="col">Opening</th><th scope="col">Earned share</th><th scope="col">Closing</th></tr></thead><tbody>
        {(['held', 'connect', 'unresolved'] as const).map(t => <tr key={t}><th scope="row">{treatmentNames[t]}</th><td>{money(statement.treatments[t].opening_cents, statement.currency)}</td><td>{money(statement.treatments[t].earned_cents, statement.currency)}</td><td>{money(statement.treatments[t].closing_cents, statement.currency)}</td></tr>)}
      </tbody></table></div>
      <h3 className="font-semibold">International balances and restrictions</h3>
      <dl aria-label="International balances" className="my-3 space-y-2">
        <Amount label="Unpaid" cents={statement.held.unpaid_cents} currency={statement.currency} />
        <Amount label="Held" cents={statement.held.held_cents} currency={statement.currency} />
        <Amount label="Available for an approved payment" cents={statement.held.available_cents} currency={statement.currency} />
        <Amount label="Active claims (included in held)" cents={statement.held.active_claim_cents} currency={statement.currency} />
        <Amount label="Total claimed amount" cents={statement.held.claimed_amount_cents} currency={statement.currency} />
        <Amount label="Projected debt offsets (not posted)" cents={statement.held.projected_offset_cents} currency={statement.currency} />
      </dl>
      {statement.restricted && <p>Payment eligibility is restricted while reconciliation is required.</p>}
      <Reasons reasons={statement.reasons} />
      <h3 className="mt-5 font-semibold">Itemised activity</h3>
      {!statement.details.length && <p>No statement activity in this period. Opening balances and restrictions may still apply.</p>}
      <ul className="divide-y">{statement.details.map(item => <li key={item.id} className="py-3 break-words">
        <p>{item.date} · {treatmentNames[item.treatment]}</p>
        <p>{reasonSentence(item.reason)}</p>
        <p>Order IDs: {item.order_ids.join(', ') || 'None'}</p>
        <dl><Amount label="Change to what we owe you" cents={item.payable_cents} currency={statement.currency} /><Amount label="Change to debt" cents={item.debt_cents} currency={statement.currency} /></dl>
      </li>)}</ul>
      <h3 className="mt-5 font-semibold">Payments and corrections</h3>
      {!statement.payments.length && <p>No payments or corrections recorded in this period.</p>}
      <ul className="divide-y">{statement.payments.map(payment => <li key={payment.id} className="py-3 break-words">
        <p className="font-medium">{payment.uncertain ? 'Uncertain import — not counted as paid or applied' : payment.correction_of_id ? 'Payment correction' : 'Recorded payment'}</p>
        <p>Payment ID: {payment.id}.</p>
        <p>{reasonSentence(payment.reason)}</p>
        {payment.correction_of_id && <p>Original payment ID: {payment.correction_of_id}</p>}
        <p>Completion recorded: {payment.completed_at || 'None'}</p>
        <dl>
          {payment.correction_of_id && !payment.uncertain
            ? <Amount label="Correction amount" cents={payment.amount_cents ?? (payment.reason === 'cash_return' ? payment.paid_amount_cents : null)} currency={statement.currency} emptyText={payment.reason === 'cash_return' ? 'Not confirmed' : 'Not applicable'} />
            : <Amount label={payment.uncertain ? 'Reported amount (unverified)' : 'Paid (actual total sent)'} cents={payment.paid_amount_cents} currency={payment.paid_currency} />}
          <Amount label="Applied to what we owe you" cents={payment.applied_to_payable_cents} currency={statement.currency} />
        </dl>
      </li>)}</ul>
      <h3 className="mt-5 font-semibold">International sale detail</h3>
      {!statement.orders.length && <p>No international sales to show.</p>}
      <ul className="divide-y">{statement.orders.map(order => <li key={order.order_id} className="py-3 break-words">
        <p>Order ID: {order.order_id}</p><p>Availability hold until: {order.hold_until || 'Not confirmed'}</p>
        <dl>
          <Amount label="Unpaid" cents={order.unpaid_cents} currency={statement.currency} />
          <Amount label="Held" cents={order.held_cents} currency={statement.currency} />
          <Amount label="Available for an approved payment" cents={order.available_cents} currency={statement.currency} />
          <Amount label="Active claims (included in held)" cents={order.active_claim_cents} currency={statement.currency} />
          <Amount label="Total claimed amount" cents={order.claimed_amount_cents} currency={statement.currency} />
          <Amount label="Projected debt offsets (not posted)" cents={order.projected_offset_cents} currency={statement.currency} />
        </dl><Reasons reasons={order.reasons} />
      </li>)}</ul>
    </>}
  </section>;
}
