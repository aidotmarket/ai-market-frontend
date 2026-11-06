// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import HeldPayoutsPanel from './HeldPayoutsPanel';
import { recordingReversalFixture, statementFixture } from '@/tests/fixtures/HeldPayoutsPanel.fixture';

vi.mock('@/api/client', () => ({ api: { get: vi.fn() } }));
const ownOperation = () => () => true;
const get = vi.mocked(api.get);

function rowAmount(container: HTMLElement, label: string) {
  return within(container).getByText(label, { selector: 'dt' }).nextElementSibling?.textContent?.replace(/\s/g, ' ');
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.resetAllMocks();
  get.mockResolvedValue({ data: statementFixture() });
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = vi.fn(() => 'blob:statement');
    static revokeObjectURL = vi.fn();
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('renders backend totals, mixed treatments, itemised activity and restrictions without recalculating', async () => {
  render(<HeldPayoutsPanel ownOperation={ownOperation} />);
  const summary = await screen.findByLabelText('Statement totals');
  const expected = {
    Opening: 'USD 0.00', 'Earned share': 'USD 400.00', Restored: 'USD 10.00', Reductions: 'USD 40.00',
    'Posted debt offsets': 'USD 10.00', 'Applied payments': 'USD 260.00', Closing: 'USD 100.00',
    'Opening debt': 'USD 0.00', 'Debt incurred': 'USD 40.00', 'Debt recovered': 'USD 10.00', 'Open debt': 'USD 30.00',
    'Total paid, net': 'USD 300.00',
  };
  for (const [label, amount] of Object.entries(expected)) expect(rowAmount(summary, label)).toBe(amount);
  const balances = screen.getByLabelText('International balances');
  expect(rowAmount(balances, 'Held')).toBe('USD 100.00');
  expect(rowAmount(balances, 'Active claims (included in held)')).toBe('USD 10.00');
  expect(rowAmount(balances, 'Projected debt offsets (not posted)')).toBe('USD 0.00');
  expect(screen.getByText('Restriction reasons: Part of your balance is reserved for a payment under review. An earlier payment record needs to be confirmed before payment eligibility can be assessed.')).toBeTruthy();
  expect(screen.getByRole('table', { name: 'Original payout treatments' }).textContent).toContain('Stripe');
  expect(screen.queryByText(/^Entry ID:/)).toBeNull();
  for (const entry of statementFixture().statement.details) expect(document.body.textContent).not.toContain(entry.id);
  expect(screen.getAllByText('Your share of a sale was added to your balance.')).toHaveLength(2);
  expect(screen.getByText(/Available means eligible for an approved payment/)).toBeTruthy();
  expect(screen.getByText(/There is no fixed payment schedule or business minimum/)).toBeTruthy();
  expect(get).toHaveBeenCalledWith('/seller/payouts', expect.objectContaining({ params: { currency: 'USD', format: 'json' }, signal: expect.any(AbortSignal) }));
});

it('keeps uncertain imports distinct from paid and applies no discharge', async () => {
  render(<HeldPayoutsPanel ownOperation={ownOperation} />);
  const uncertain = (await screen.findByText('Uncertain import — not counted as paid or applied')).closest('li')!;
  expect(rowAmount(uncertain, 'Reported amount (unverified)')).toBe('EUR 50.00');
  expect(rowAmount(uncertain, 'Applied to what we owe you')).toBe('USD 0.00');
  expect(within(uncertain).queryByText('Paid (actual total sent)')).toBeNull();
  expect(rowAmount(screen.getByLabelText('Statement totals'), 'Total paid, net')).toBe('USD 300.00');
});

it('shows actual paid separately from applied payable and the debt created by a late payment', async () => {
  render(<HeldPayoutsPanel ownOperation={ownOperation} />);
  const paid = (await screen.findAllByText('Recorded payment'))[0].closest('li')!;
  expect(rowAmount(paid, 'Paid (actual total sent)')).toBe('USD 100.00');
  expect(rowAmount(paid, 'Applied to what we owe you')).toBe('USD 60.00');
  expect(rowAmount(screen.getByLabelText('Statement totals'), 'Debt incurred')).toBe('USD 40.00');
});

it('labels projected offsets separately from posted offsets and keeps claims within held', async () => {
  const fixture = statementFixture();
  fixture.statement.restricted = false; fixture.statement.reasons = [];
  fixture.statement.payments.pop();
  Object.assign(fixture.statement.held, { held_cents: 4000, available_cents: 6000, projected_offset_cents: 3000 });
  Object.assign(fixture.statement.orders[0], { held_cents: 4000, available_cents: 6000, projected_offset_cents: 3000, reasons: ['active_claim'] });
  get.mockResolvedValue({ data: fixture });
  render(<HeldPayoutsPanel ownOperation={ownOperation} />);
  const balances = await screen.findByLabelText('International balances');
  expect(rowAmount(balances, 'Held')).toBe('USD 40.00');
  expect(rowAmount(balances, 'Active claims (included in held)')).toBe('USD 10.00');
  expect(rowAmount(balances, 'Available for an approved payment')).toBe('USD 60.00');
  expect(rowAmount(balances, 'Projected debt offsets (not posted)')).toBe('USD 30.00');
  expect(rowAmount(screen.getByLabelText('Statement totals'), 'Posted debt offsets')).toBe('USD 10.00');
});

it('shows the backend correction amount for a reversal with no paid amount', async () => {
  const fixture = statementFixture();
  fixture.statement.payments = [{ ...recordingReversalFixture(), amount_cents: 10000 }];
  get.mockResolvedValue({ data: fixture });
  render(<HeldPayoutsPanel ownOperation={ownOperation} />);
  const correction = (await screen.findByText('Payment correction')).closest('li')!;
  expect(within(correction).queryByText('Paid (actual total sent)')).toBeNull();
  expect(rowAmount(correction, 'Correction amount')).toBe('USD 100.00');
  expect(within(correction).getByText(`Original payment ID: ${fixture.statement.payments[0].correction_of_id}`)).toBeTruthy();
  expect(within(correction).queryByText('Not confirmed')).toBeNull();
});

it.each(['recording_reversal', 'allocation_correction'])('shows Not applicable for a %s without a correction amount', async reason => {
  const fixture = statementFixture();
  fixture.statement.payments = [{ ...recordingReversalFixture(), reason }];
  get.mockResolvedValue({ data: fixture });
  render(<HeldPayoutsPanel ownOperation={ownOperation} />);
  const correction = (await screen.findByText('Payment correction')).closest('li')!;
  expect(rowAmount(correction, 'Correction amount')).toBe('Not applicable');
  expect(rowAmount(correction, 'Applied to what we owe you')).toBe('-USD 60.00');
  expect(within(correction).queryByText('Not confirmed')).toBeNull();
});

it('retains the cash return amount when the backend has no amount_cents yet', async () => {
  const fixture = statementFixture();
  fixture.statement.payments = [{ ...recordingReversalFixture(), reason: 'cash_return', paid_currency: 'USD', paid_amount_cents: 5000 }];
  get.mockResolvedValue({ data: fixture });
  render(<HeldPayoutsPanel ownOperation={ownOperation} />);
  const correction = (await screen.findByText('Payment correction')).closest('li')!;
  expect(rowAmount(correction, 'Correction amount')).toBe('USD 50.00');
});

it.each([
  ['held_fee_pending', 'The payment processing fee is still being confirmed.'],
  ['seller_debt_reconciliation_required', 'Your outstanding debt needs to be checked before payment eligibility can be confirmed.'],
  ['historical_eligibility_not_evaluated', 'Payment eligibility is not assessed for past periods.'],
  ['capture_journal_unposted_or_conflicting', 'The sale’s accounting records need to be checked before payment eligibility can be confirmed.'],
  ['held_manual_projection_mismatch', 'Recorded international payments need to be reconciled with your balance.'],
  ['held_liability_projection_mismatch', 'Your international balance needs to be reconciled with the accounting records.'],
  ['held_uncertain_payment', 'An earlier payment record needs to be confirmed before payment eligibility can be assessed.'],
  ['unknown_internal_reason', 'Further checks are needed for this statement item.'],
  ['toString', 'Further checks are needed for this statement item.'],
])('uses plain language for %s across restrictions, activity and payments', async (code, sentence) => {
  const fixture = statementFixture();
  fixture.statement.reasons = [code];
  fixture.statement.orders[0].reasons = [code];
  fixture.statement.details[0].reason = code;
  fixture.statement.payments[0].reason = code;
  get.mockResolvedValue({ data: fixture });
  const { container } = render(<HeldPayoutsPanel ownOperation={ownOperation} />);
  await screen.findByLabelText('Statement totals');
  expect(screen.getAllByText(`Restriction reasons: ${sentence}`)).toHaveLength(2);
  expect(screen.getAllByText(sentence)).toHaveLength(2);
  expect(container.textContent).not.toContain(code);
});

it('hides the section for a pure Stripe Connect seller while still fetching', async () => {
  const fixture = statementFixture();
  fixture.seller_payout_method = 'connect';
  fixture.statement.orders = [];
  fixture.statement.details = fixture.statement.details.filter(item => item.treatment === 'connect');
  fixture.statement.payments = fixture.statement.payments.filter(payment => payment.reason === 'connect_transfer');
  get.mockResolvedValue({ data: fixture });
  const { container } = render(<HeldPayoutsPanel ownOperation={ownOperation} />);
  await act(async () => {});
  expect(get).toHaveBeenCalledTimes(1);
  expect(container.textContent).toBe('');
  expect(screen.queryByRole('heading', { name: 'International payout statement' })).toBeNull();
});

it('shows the section for a held seller with no orders or payments', async () => {
  const fixture = statementFixture();
  fixture.statement.orders = []; fixture.statement.payments = [];
  get.mockResolvedValue({ data: fixture });
  render(<HeldPayoutsPanel ownOperation={ownOperation} />);
  expect(await screen.findByRole('heading', { name: 'International payout statement' })).toBeTruthy();
});

it('shows the section for a switched-back seller with only historic held payments', async () => {
  const fixture = statementFixture();
  fixture.seller_payout_method = 'connect';
  fixture.statement.orders = [];
  get.mockResolvedValue({ data: fixture });
  render(<HeldPayoutsPanel ownOperation={ownOperation} />);
  expect(await screen.findByRole('heading', { name: 'International payout statement' })).toBeTruthy();
});

it('shows no section or error for a non-seller admin receiving 403', async () => {
  get.mockRejectedValueOnce({ response: { status: 403 } });
  const { container } = render(<HeldPayoutsPanel ownOperation={ownOperation} />);
  await act(async () => {});
  expect(get).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('alert')).toBeNull();
  expect(container.textContent).toBe('');
});

it('loads historic international sales after switching to Stripe even with admission disabled', async () => {
  const fixture = statementFixture();
  fixture.seller_payout_method = 'connect';
  fixture.request_enabled = fixture.approval_enabled = false;
  get.mockResolvedValue({ data: fixture });
  render(<HeldPayoutsPanel ownOperation={ownOperation} />);
  expect(await screen.findByText(/Your current payout method is Stripe/)).toBeTruthy();
  expect(screen.getByText(/Order ID: 00000000-0000-4000-8000-000000000003/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Download CSV' })).toBeTruthy();
});

it('downloads CSV from the same endpoint with the displayed half-open GL period', async () => {
  render(<HeldPayoutsPanel ownOperation={ownOperation} />);
  await screen.findByRole('button', { name: 'Download CSV' });
  fireEvent.change(screen.getByLabelText('Period start (inclusive)'), { target: { value: '2026-10-01' } });
  fireEvent.change(screen.getByLabelText('Period end (exclusive)'), { target: { value: '2026-11-01' } });
  const fixture = statementFixture(); fixture.statement.period_end = '2026-11-01';
  get.mockResolvedValueOnce({ data: fixture });
  fireEvent.click(screen.getByRole('button', { name: 'Show statement' }));
  await screen.findByText('Period: 2026-10-01 to 2026-11-01 (exclusive).');
  const blob = new Blob(['path,value\r\n/currency,"USD"'], { type: 'text/csv' });
  get.mockResolvedValueOnce({ data: blob });
  // Unsubmitted picker edits must not silently change the downloaded period.
  fireEvent.change(screen.getByLabelText('Period start (inclusive)'), { target: { value: '2026-09-01' } });
  fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
  await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledWith(blob));
  expect(get).toHaveBeenLastCalledWith('/seller/payouts', expect.objectContaining({ params: { currency: 'USD', period_start: '2026-10-01', period_end: '2026-11-01', format: 'csv' }, responseType: 'blob' }));
  const link = vi.mocked(HTMLAnchorElement.prototype.click).mock.instances[0] as HTMLAnchorElement;
  expect(link.download).toBe('held-statement.csv');
  await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:statement'));
});

it('shows an empty period while retaining opening and closing balances', async () => {
  const fixture = statementFixture();
  fixture.statement.details = []; fixture.statement.payments = []; fixture.statement.orders = [];
  for (const key of Object.keys(fixture.statement.totals) as (keyof typeof fixture.statement.totals)[]) fixture.statement.totals[key] = 0;
  for (const key of Object.keys(fixture.statement.held) as (keyof typeof fixture.statement.held)[]) fixture.statement.held[key] = 0;
  fixture.statement.totals.opening_cents = 5000; fixture.statement.totals.closing_cents = 5000;
  fixture.statement.treatments = {
    held: { opening_cents: 0, earned_cents: 0, closing_cents: 0 },
    connect: { opening_cents: 5000, earned_cents: 0, closing_cents: 5000 },
    unresolved: { opening_cents: 0, earned_cents: 0, closing_cents: 0 },
  };
  fixture.statement.restricted = false; fixture.statement.reasons = [];
  get.mockResolvedValue({ data: fixture });
  render(<HeldPayoutsPanel ownOperation={ownOperation} />);
  expect(await screen.findByText(/No statement activity in this period/)).toBeTruthy();
  expect(screen.getByText('No payments or corrections recorded in this period.')).toBeTruthy();
  expect(rowAmount(screen.getByLabelText('Statement totals'), 'Opening')).toBe('USD 50.00');
  expect(rowAmount(screen.getByLabelText('Statement totals'), 'Closing')).toBe('USD 50.00');
});

it('pins the server-resolved dates for an all-history CSV download', async () => {
  const fixture = statementFixture(); fixture.statement.period_start = '0001-01-01';
  get.mockResolvedValueOnce({ data: fixture });
  render(<HeldPayoutsPanel ownOperation={ownOperation} />);
  await screen.findByRole('button', { name: 'Download CSV' });
  get.mockResolvedValueOnce({ data: new Blob(['csv']) });
  fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
  await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
  expect(get).toHaveBeenLastCalledWith('/seller/payouts', expect.objectContaining({ params: {
    currency: 'USD', period_start: '0001-01-01', period_end: '2026-11-07', format: 'csv',
  } }));
});

it('uses a friendly load error, hides backend evidence and retries', async () => {
  render(<HeldPayoutsPanel ownOperation={ownOperation} />);
  await screen.findByLabelText('Statement totals');
  get.mockRejectedValueOnce(new Error('private evidence ref and signature'));
  fireEvent.click(screen.getByRole('button', { name: 'Show statement' }));
  expect(await screen.findByText('We couldn’t load your statement. Please try again.')).toBeTruthy();
  expect(screen.queryByText(/private evidence/)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Download CSV' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('button', { name: 'Download CSV' })).toBeTruthy();
});

it('uses a friendly CSV error and allows another attempt', async () => {
  render(<HeldPayoutsPanel ownOperation={ownOperation} />);
  await screen.findByRole('button', { name: 'Download CSV' });
  get.mockRejectedValueOnce(new Error('restricted wallet address'));
  fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
  expect(await screen.findByText('We couldn’t download your statement. Please try again.')).toBeTruthy();
  expect(screen.queryByText(/restricted wallet/)).toBeNull();
  expect((screen.getByRole('button', { name: 'Download CSV' }) as HTMLButtonElement).disabled).toBe(false);
});

it('hides the section when the backend has no C4b statement to establish visibility', async () => {
  get.mockResolvedValue({ data: { seller_payout_method: 'held', requests: [] } });
  const { container } = render(<HeldPayoutsPanel ownOperation={ownOperation} />);
  await act(async () => {});
  expect(container.textContent).toBe('');
  expect(screen.queryByRole('button', { name: 'Download CSV' })).toBeNull();
});

it('rejects an empty or reversed date range without making another request', async () => {
  render(<HeldPayoutsPanel ownOperation={ownOperation} />);
  await screen.findByRole('button', { name: 'Download CSV' });
  fireEvent.change(screen.getByLabelText('Period start (inclusive)'), { target: { value: '2026-10-01' } });
  fireEvent.change(screen.getByLabelText('Period end (exclusive)'), { target: { value: '2026-10-01' } });
  fireEvent.click(screen.getByRole('button', { name: 'Show statement' }));
  expect(await screen.findByRole('alert')).toBeTruthy(); expect(get).toHaveBeenCalledTimes(1);
});

it('ignores stale statement responses when a new period is selected', async () => {
  render(<HeldPayoutsPanel ownOperation={ownOperation} />);
  await screen.findByLabelText('Statement totals');
  const pending = deferred<{ data: ReturnType<typeof statementFixture> }>();
  get.mockReturnValueOnce(pending.promise);
  fireEvent.click(screen.getByRole('button', { name: 'Show statement' }));
  const signal = get.mock.calls[1][1]?.signal;
  fireEvent.click(screen.getByRole('button', { name: 'Show statement' }));
  await screen.findByRole('button', { name: 'Download CSV' });
  const stale = statementFixture(); stale.statement.totals.closing_cents = 99999;
  await act(async () => pending.resolve({ data: stale }));
  expect(signal?.aborted).toBe(true);
  expect(rowAmount(screen.getByLabelText('Statement totals'), 'Closing')).toBe('USD 100.00');
});

it('does not download a CSV after the account visit is retired', async () => {
  let active = true;
  render(<HeldPayoutsPanel ownOperation={() => () => active} />);
  await screen.findByRole('button', { name: 'Download CSV' });
  const pending = deferred<{ data: Blob }>(); get.mockReturnValueOnce(pending.promise);
  fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
  active = false;
  await act(async () => pending.resolve({ data: new Blob(['csv']) }));
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it('cancels a pending CSV when the displayed period changes', async () => {
  render(<HeldPayoutsPanel ownOperation={ownOperation} />);
  await screen.findByRole('button', { name: 'Download CSV' });
  const pending = deferred<{ data: Blob }>(); get.mockReturnValueOnce(pending.promise);
  fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
  const signal = get.mock.calls[1][1]?.signal;
  fireEvent.click(screen.getByRole('button', { name: 'Show statement' }));
  await screen.findByRole('button', { name: 'Download CSV' });
  await act(async () => pending.resolve({ data: new Blob(['old period']) }));
  expect(signal?.aborted).toBe(true);
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it('does not render extra wallet, signature or evidence fields from a response', async () => {
  const fixture = statementFixture();
  Object.assign(fixture.statement.payments[0], { wallet_address: 'SECRET_WALLET', external_reference: 'SECRET_SIGNATURE', payment_evidence_ref: 'SECRET_EVIDENCE' });
  get.mockResolvedValue({ data: fixture });
  const { container } = render(<HeldPayoutsPanel ownOperation={ownOperation} />);
  await screen.findByRole('button', { name: 'Download CSV' });
  expect(container.textContent).not.toContain('SECRET_');
  expect(container.textContent).not.toMatch(/bank transfer/i);
});
