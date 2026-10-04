// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GatewayVerificationFlow from './GatewayVerificationFlow';
import * as gateway from '@/api/dataVerificationGateway';
import * as payin from '@/api/dataVerificationPayin';
import type { GatewayVerificationEpoch, PublishedScanFindings } from '@/types';
vi.mock('@/api/dataVerificationGateway', async importOriginal => ({ ...await importOriginal<typeof gateway>(), probeGatewayVerification: vi.fn(), getGatewayVerificationProbe: vi.fn(), startGatewayVerification: vi.fn(), getGatewayVerificationEpoch: vi.fn(), gatewayVerificationLifecycle: vi.fn() }));
vi.mock('@/api/dataVerificationPayin', () => ({ getDataVerificationPayInReadiness: vi.fn() }));
vi.mock('@/components/DataVerificationPaymentMethod', () => ({ default: () => <p>Hosted card setup</p> }));
const key = 'gateway-verification:seller:listing';
const queued = { data: { probe_id: 'probe', state: 'queued' as const }, retryAfter: 0.001 };
const quote = { data: { probe_id: 'probe', state: 'complete' as const, quote_id: 'quote', refusal: null, maximum_hold_usd: '25.00' }, retryAfter: 2 };
const epoch: GatewayVerificationEpoch = { listing_id: 'listing', source_handle_id: 'source', verification_id: 'epoch', state: 'SCANNING_LOCAL', authorization_usd: '25.00', captured_usd: null, result_available: false, publication_allowed: false, reconciliation_required: false, narrative: null, listing_claim_comparison: null, withdrawn_at_utc: null };
const artifact: PublishedScanFindings = {
  publication_state: 'PUBLISHED', artifact_version: 'data-verification-public-artifact-v1',
  verification_series_id: 'series', epoch_id: 'epoch', listing_id: 'listing',
  title: 'Scan findings — 2026-10-04', scan_date_utc: '2026-10-04T00:00:00Z',
  scanned_at_utc: '2026-10-04T00:00:00Z', completed_at_utc: '2026-10-04T00:00:01Z',
  duration_ms: 1000, published_at_utc: '2026-10-04T00:00:02Z',
  spec: { id: 'spec', version: '1', hash: 'a'.repeat(64), depth_class: 'complete_standard_v1', canonicalization_version: 'python-json-sort-compact-v1', listing_version_id: 'version' },
  execution: { agent_version: '1.2.3', scanner_version: '1.2.3', runner_kind: 'gateway', connector_type: 'aim_gateway', connector_version: 'aim_gateway-v1', content_sha256_reference: 'a'.repeat(12) },
  methods: { row_count_algorithm_version: 'exact-v1', distinct_algorithm_version: 'hll-sha256-v1', histogram_version: 'fixed-buckets-v1', numeric_bucket_version: 'fixed-buckets-v1' },
  coverage: { objects_discovered: 1, objects_scanned: 1, objects_skipped_by_reason: { permission_denied: 0, unsupported_type: 0, timeout: 0 }, skipped: [] },
  deterministic_facts: [{ object_id: 'a'.repeat(64) as PublishedScanFindings['deterministic_facts'][number]['object_id'], columns: [{ position: 0, null_rate: '0.000000', approx_distinct_count: 'suppressed_low_occupancy', length_histogram: null, numeric_range_buckets: null }] }],
  fingerprint_hash: 'a'.repeat(64), narrative_state: 'grounded', narrative: 'Written findings', listing_claim_comparison: 'Listing comparison', narrative_notice: null,
  seller_context_provided: true, preview_requested: false,
  provenance_label: "Facts computed in the seller's own self-hosted AIM Data gateway",
  attestation: 'The findings are published unedited.', disclaimer: 'This scan is not a guarantee of future data.',
};
async function getQuote(preview = false) {
  render(<GatewayVerificationFlow listingId="listing" sellerId="seller" />);
  await waitFor(() => expect((screen.getByRole('button', { name: 'Check data and get quote' }) as HTMLButtonElement).disabled).toBe(false));
  if (preview) fireEvent.click(screen.getByRole('checkbox', { name: 'Include column names and row counts in the findings' }));
  fireEvent.click(screen.getByRole('button', { name: 'Check data and get quote' }));
  await screen.findByText('Your verification quote');
}
function acknowledge() {
  const selectNames = ['Subject area', 'What each record describes', 'Time covered', 'How often the data changes'];
  const values = ['software_technology', 'event', 'current_snapshot', 'daily'];
  selectNames.forEach((name, i) => fireEvent.change(screen.getByRole('combobox', { name }), { target: { value: values[i] } }));
  screen.getAllByRole('checkbox').filter(el => /I understand|I agree/.test(el.parentElement?.textContent ?? '')).forEach(el => fireEvent.click(el));
}
describe('gateway seller verification flow', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', { configurable: true, value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    } });
    vi.clearAllMocks();
    vi.mocked(gateway.probeGatewayVerification).mockResolvedValue(queued);
    vi.mocked(gateway.getGatewayVerificationProbe).mockResolvedValue(quote);
    vi.mocked(gateway.startGatewayVerification).mockResolvedValue({ data: epoch, retryAfter: 2 });
    vi.mocked(gateway.getGatewayVerificationEpoch).mockResolvedValue({ data: epoch, retryAfter: 2 });
    vi.mocked(payin.getDataVerificationPayInReadiness).mockResolvedValue({ version: 'data_verification_payin_readiness_v1', state: 'ready', can_start_setup: false, can_replace_payment_method: true, message: 'ignored' });
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });
  it('hides Verify this data until the backend confirms a quote', async () => {
    render(<GatewayVerificationFlow listingId="listing" sellerId="seller" />);
    expect(screen.queryByRole('heading', { name: 'Verify this data' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Check verification availability' })).toBeTruthy();
    expect(gateway.probeGatewayVerification).not.toHaveBeenCalled();
  });
  it('cancels using the owned GET binding after a fresh confirmation', async () => {
    window.localStorage.setItem(key, JSON.stringify({ probeCommand: { confirm: true, preview_requested: false, idempotency_key: 'key' }, epochId: 'epoch' }));
    vi.mocked(gateway.gatewayVerificationLifecycle).mockResolvedValue({ data: { ...epoch, state: 'CANCELLED_VOIDED' }, retryAfter: 2 });
    render(<GatewayVerificationFlow listingId="listing" sellerId="seller" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel verification' }));
    expect(gateway.gatewayVerificationLifecycle).not.toHaveBeenCalled();
    vi.mocked(gateway.getGatewayVerificationEpoch).mockResolvedValue({ data: { ...epoch, state: 'CANCELLED_VOIDED' }, retryAfter: 2 });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm cancellation' }));
    await screen.findByText('Verification ended and the temporary hold was released. No completed verification charge was made.');
    expect(gateway.gatewayVerificationLifecycle).toHaveBeenCalledWith('listing', { verification_id: 'epoch', listing_id: 'listing', source_handle_id: 'source', requested_action: 'cancel', confirm: true });
  });
  it.each([{ source_handle_id: undefined }, { listing_id: 'another-listing' }])('does not enable cancellation without a matching GET binding: %j', async binding => {
    window.localStorage.setItem(key, JSON.stringify({ probeCommand: { confirm: true, preview_requested: false, idempotency_key: 'key' }, epochId: 'epoch' }));
    vi.mocked(gateway.getGatewayVerificationEpoch).mockResolvedValue({ data: { ...epoch, ...binding }, retryAfter: 2 });
    render(<GatewayVerificationFlow listingId="listing" sellerId="seller" />);
    expect((await screen.findByRole('button', { name: 'Cancel verification' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('gets a free quote without checking a card and requires two unchecked acknowledgements', async () => {
    await getQuote();
    expect(screen.getByRole('heading', { name: 'Verify this data' })).toBeTruthy();
    expect(payin.getDataVerificationPayInReadiness).not.toHaveBeenCalled();
    expect(gateway.startGatewayVerification).not.toHaveBeenCalled();
    const acknowledgements = screen.getAllByRole('checkbox').filter(el => /I understand|I agree/.test(el.parentElement?.textContent ?? ''));
    expect(acknowledgements).toHaveLength(2);
    acknowledgements.forEach(el => expect((el as HTMLInputElement).checked).toBe(false));
    expect((screen.getByRole('button', { name: 'Start paid verification' }) as HTMLButtonElement).disabled).toBe(true);
    acknowledge();
    fireEvent.click(screen.getByRole('button', { name: 'Start paid verification' }));
    await waitFor(() => expect(gateway.startGatewayVerification).toHaveBeenCalledTimes(1));
    expect(vi.mocked(gateway.startGatewayVerification).mock.calls[0][1]).toMatchObject({ quote_id: 'quote', publication_terms_acknowledged: true, corpus_consent_acknowledged: true });
  });
  it('blocks E7 before quote with the exact required sentence', async () => {
    vi.mocked(gateway.getGatewayVerificationProbe).mockResolvedValue({ data: { probe_id: 'probe', state: 'refused', quote_id: null, refusal: gateway.E7_REFUSAL, maximum_hold_usd: null }, retryAfter: 2 });
    render(<GatewayVerificationFlow listingId="listing" sellerId="seller" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Check data and get quote' }));
    expect((await screen.findByRole('alert')).textContent).toBe(gateway.E7_REFUSAL);
    expect(screen.queryByText('Your verification quote')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Data verification' })).toBeTruthy();
    expect(payin.getDataVerificationPayInReadiness).not.toHaveBeenCalled();
  });
  it('opens card setup only after deliberate paid start and never starts automatically', async () => {
    vi.mocked(payin.getDataVerificationPayInReadiness).mockResolvedValue({ version: 'data_verification_payin_readiness_v1', state: 'setup_required', can_start_setup: true, can_replace_payment_method: false, message: 'ignored' });
    await getQuote(); acknowledge();
    expect(screen.queryByText('Hosted card setup')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Start paid verification' }));
    await screen.findByText('Hosted card setup');
    expect(gateway.startGatewayVerification).not.toHaveBeenCalled();
    expect(JSON.parse(window.localStorage.getItem(key)!).startCommand.idempotency_key).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to verification' }));
    expect(gateway.startGatewayVerification).not.toHaveBeenCalled();
  });
  it('resumes the persisted paid command after hosted card setup', async () => {
    vi.mocked(payin.getDataVerificationPayInReadiness).mockResolvedValueOnce({ version: 'data_verification_payin_readiness_v1', state: 'setup_required', can_start_setup: true, can_replace_payment_method: false, message: 'ignored' });
    await getQuote(); acknowledge();
    fireEvent.click(screen.getByRole('button', { name: 'Start paid verification' }));
    await screen.findByText('Hosted card setup');
    const savedCommand = JSON.parse(window.localStorage.getItem(key)!).startCommand;
    expect(gateway.startGatewayVerification).not.toHaveBeenCalled();
    cleanup();
    render(<GatewayVerificationFlow listingId="listing" sellerId="seller" />);
    await screen.findByText('Your verification quote');
    screen.getAllByRole('checkbox').filter(el => /I understand|I agree/.test(el.parentElement?.textContent ?? '')).forEach(el => fireEvent.click(el));
    fireEvent.click(screen.getByRole('button', { name: 'Start paid verification' }));
    await waitFor(() => expect(gateway.startGatewayVerification).toHaveBeenCalledTimes(1));
    expect(vi.mocked(gateway.startGatewayVerification).mock.calls[0][1]).toEqual(savedCommand);
  });
  it('retains the exact paid request across a lost response and refresh', async () => {
    vi.mocked(gateway.startGatewayVerification).mockRejectedValueOnce(new Error('lost response'));
    await getQuote(); acknowledge(); fireEvent.click(screen.getByRole('button', { name: 'Start paid verification' }));
    await screen.findByRole('alert');
    const original = vi.mocked(gateway.startGatewayVerification).mock.calls[0][1];
    cleanup(); render(<GatewayVerificationFlow listingId="listing" sellerId="seller" />);
    await screen.findByText('Your verification quote');
    expect(gateway.startGatewayVerification).toHaveBeenCalledTimes(1);
    screen.getAllByRole('checkbox').filter(el => /I understand|I agree/.test(el.parentElement?.textContent ?? '')).forEach(el => fireEvent.click(el));
    fireEvent.click(screen.getByRole('button', { name: 'Start paid verification' }));
    await waitFor(() => expect(gateway.startGatewayVerification).toHaveBeenCalledTimes(2));
    expect(vi.mocked(gateway.startGatewayVerification).mock.calls[1][1]).toEqual(original);
  });
  it.each(['quote_binding_or_expiry', 'source_changed'])('renews after definite %s refusal during card setup and across refresh', async detail => {
    vi.mocked(payin.getDataVerificationPayInReadiness).mockResolvedValueOnce({ version: 'data_verification_payin_readiness_v1', state: 'setup_required', can_start_setup: true, can_replace_payment_method: false, message: 'ignored' });
    await getQuote(); acknowledge();
    const oldProbe = JSON.parse(window.localStorage.getItem(key)!).probeCommand;
    fireEvent.click(screen.getByRole('button', { name: 'Start paid verification' }));
    await screen.findByText('Hosted card setup');
    const oldStart = JSON.parse(window.localStorage.getItem(key)!).startCommand;
    cleanup(); render(<GatewayVerificationFlow listingId="listing" sellerId="seller" />);
    await screen.findByText('Your verification quote');
    screen.getAllByRole('checkbox').filter(el => /I understand|I agree/.test(el.parentElement?.textContent ?? '')).forEach(el => fireEvent.click(el));
    vi.mocked(gateway.startGatewayVerification).mockRejectedValueOnce({ response: { status: 409, data: { detail } } });
    fireEvent.click(screen.getByRole('button', { name: 'Start paid verification' }));
    await screen.findByRole('alert');
    expect(vi.mocked(gateway.startGatewayVerification).mock.calls[0][1]).toEqual(oldStart);
    expect(JSON.parse(window.localStorage.getItem(key)!)).toEqual({ probeCommand: oldProbe, quoteRefused: true });
    cleanup(); render(<GatewayVerificationFlow listingId="listing" sellerId="seller" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Get a new quote' }));
    await screen.findByText('Your verification quote');
    const newProbe = vi.mocked(gateway.probeGatewayVerification).mock.calls[1][1];
    expect(newProbe.idempotency_key).not.toBe(oldProbe.idempotency_key);
    screen.getAllByRole('combobox').forEach(el => {
      expect((el as HTMLSelectElement).disabled).toBe(false);
      expect((el as HTMLSelectElement).value).toBe('');
    });
    acknowledge(); fireEvent.click(screen.getByRole('button', { name: 'Start paid verification' }));
    await screen.findByText('Verification is in progress. You can return to this page to check it.');
    expect(vi.mocked(gateway.startGatewayVerification).mock.calls[1][1].idempotency_key).not.toBe(oldStart.idempotency_key);
  });
  it.each([
    { response: { status: 500, data: { detail: 'source_changed' } } },
    { response: { status: 409, data: { detail: 'unknown_conflict' } } },
  ])('retains the paid command on an ambiguous response: %j', async cause => {
    vi.mocked(gateway.startGatewayVerification).mockRejectedValueOnce(cause);
    await getQuote(); acknowledge(); fireEvent.click(screen.getByRole('button', { name: 'Start paid verification' }));
    await screen.findByRole('alert');
    const original = vi.mocked(gateway.startGatewayVerification).mock.calls[0][1];
    expect(JSON.parse(window.localStorage.getItem(key)!).startCommand).toEqual(original);
    expect(screen.queryByRole('button', { name: 'Get a new quote' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Start paid verification' }));
    await waitFor(() => expect(gateway.startGatewayVerification).toHaveBeenCalledTimes(2));
    expect(vi.mocked(gateway.startGatewayVerification).mock.calls[1][1]).toEqual(original);
  });
  it('resets description and preview on a new attempt and guards incomplete paid start', async () => {
    await getQuote(true); acknowledge();
    fireEvent.click(screen.getByRole('button', { name: 'Get a new quote' }));
    const preview = screen.getByRole('checkbox', { name: 'Include column names and row counts in the findings' });
    expect((preview as HTMLInputElement).checked).toBe(false);
    fireEvent.click(preview);
    fireEvent.click(screen.getByRole('button', { name: 'Check data and get quote' }));
    await screen.findByText('Your verification quote');
    screen.getAllByRole('combobox').forEach(el => expect((el as HTMLSelectElement).value).toBe(''));
    screen.getAllByRole('checkbox').filter(el => /I understand|I agree/.test(el.parentElement?.textContent ?? '')).forEach(el => fireEvent.click(el));
    const start = screen.getByRole('button', { name: 'Start paid verification' }) as HTMLButtonElement;
    start.disabled = false;
    fireEvent.click(start);
    expect(payin.getDataVerificationPayInReadiness).not.toHaveBeenCalled();
    expect(gateway.startGatewayVerification).not.toHaveBeenCalled();
    expect(screen.getByRole('option', { name: 'A summary of multiple records' }).getAttribute('value')).toBe('aggregate');
    expect(screen.getByLabelText('Categories defined by the data source')).toBeTruthy();
    expect(screen.getByText(/approved summary statistics/)).toBeTruthy();
  });
  it('restores an accepted attempt by reading status without another authorization', async () => {
    window.localStorage.setItem(key, JSON.stringify({ probeCommand: { confirm: true, preview_requested: false, idempotency_key: 'key' }, epochId: 'epoch' }));
    render(<GatewayVerificationFlow listingId="listing" sellerId="seller" />);
    await screen.findByText('Verification is in progress. You can return to this page to check it.');
    expect(gateway.startGatewayVerification).not.toHaveBeenCalled();
    expect(payin.getDataVerificationPayInReadiness).not.toHaveBeenCalled();
  });
  it('keeps publish and decline equal and unavailable when full review is missing from the server', async () => {
    window.localStorage.setItem(key, JSON.stringify({ probeCommand: { confirm: true, preview_requested: false, idempotency_key: 'key' }, epochId: 'epoch' }));
    vi.mocked(gateway.getGatewayVerificationEpoch).mockResolvedValue({ data: { ...epoch, state: 'CAPTURED', captured_usd: '2.00', result_available: true, publication_allowed: true, narrative: 'Complete summary' }, retryAfter: 2 });
    render(<GatewayVerificationFlow listingId="listing" sellerId="seller" />);
    await screen.findByText('Review your findings');
    const publish = screen.getByRole('button', { name: 'Publish all findings' }) as HTMLButtonElement;
    const decline = screen.getByRole('button', { name: 'Decline publication' }) as HTMLButtonElement;
    expect(publish.className).toBe(decline.className); expect(publish.disabled).toBe(true); expect(decline.disabled).toBe(true);
  });
  it.each(['publish', 'decline'] as const)('requires a fresh confirmation and sends the complete %s binding after full review', async action => {
    window.localStorage.setItem(key, JSON.stringify({ probeCommand: { confirm: true, preview_requested: false, idempotency_key: 'key' }, epochId: 'epoch' }));
    vi.mocked(gateway.getGatewayVerificationEpoch).mockResolvedValue({ data: { ...epoch, state: 'CAPTURED', captured_usd: '2.00', result_available: true, publication_allowed: true, findings: { ...artifact, publication_state: 'NOT_PUBLISHED', published_at_utc: null } }, retryAfter: 2 });
    vi.mocked(gateway.gatewayVerificationLifecycle).mockResolvedValue({ data: { ...epoch, state: action === 'publish' ? 'PUBLISHED' : 'DECLINED' }, retryAfter: 2 });
    render(<GatewayVerificationFlow listingId="listing" sellerId="seller" />);
    await screen.findByText('Written findings');
    expect(screen.getByText('These findings are private. Buyers can see them only if you publish them.')).toBeTruthy();
    expect(screen.getByText('Private — not published')).toBeTruthy();
    expect(screen.getByText('Listing comparison')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: action === 'publish' ? 'Publish all findings' : 'Decline publication' }));
    expect(gateway.gatewayVerificationLifecycle).not.toHaveBeenCalled();
    vi.mocked(gateway.getGatewayVerificationEpoch).mockResolvedValue({ data: { ...epoch, state: action === 'publish' ? 'PUBLISHED' : 'DECLINED' }, retryAfter: 2 });
    fireEvent.click(screen.getByRole('button', { name: action === 'publish' ? 'Confirm publication' : 'Confirm decline' }));
    await waitFor(() => expect(gateway.gatewayVerificationLifecycle).toHaveBeenCalledWith('listing', { verification_id: 'epoch', listing_id: 'listing', source_handle_id: 'source', requested_action: action, confirm: true }));
  });
  it('confirms withdrawal and allows a new scan to replace a published report', async () => {
    window.localStorage.setItem(key, JSON.stringify({ probeCommand: { confirm: true, preview_requested: false, idempotency_key: 'key' }, epochId: 'epoch' }));
    vi.mocked(gateway.getGatewayVerificationEpoch).mockResolvedValue({ data: { ...epoch, state: 'PUBLISHED' }, retryAfter: 2 });
    vi.mocked(gateway.gatewayVerificationLifecycle).mockResolvedValue({ data: { ...epoch, state: 'WITHDRAWN' }, retryAfter: 2 });
    render(<GatewayVerificationFlow listingId="listing" sellerId="seller" />);
    const withdraw = await screen.findByRole('button', { name: 'Withdraw findings' });
    expect(screen.getByRole('button', { name: 'Get a new quote' })).toBeTruthy();
    fireEvent.click(withdraw); expect(gateway.gatewayVerificationLifecycle).not.toHaveBeenCalled();
    vi.mocked(gateway.getGatewayVerificationEpoch).mockResolvedValue({ data: { ...epoch, state: 'WITHDRAWN' }, retryAfter: 2 });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm withdrawal' }));
    await screen.findByText('These findings have been withdrawn.');
  });
  it('retries a lost probe response with its original persisted consent key', async () => {
    vi.mocked(gateway.probeGatewayVerification).mockRejectedValueOnce(new Error('lost response'));
    render(<GatewayVerificationFlow listingId="listing" sellerId="seller" />);
    fireEvent.click(screen.getByRole('button', { name: 'Check data and get quote' }));
    await screen.findByRole('alert');
    const command = vi.mocked(gateway.probeGatewayVerification).mock.calls[0][1];
    cleanup(); render(<GatewayVerificationFlow listingId="listing" sellerId="seller" />);
    fireEvent.click(screen.getByRole('button', { name: 'Check data and get quote' }));
    await screen.findByText('Your verification quote');
    expect(vi.mocked(gateway.probeGatewayVerification).mock.calls[1][1]).toEqual(command);
  });
  it.each([
    ['verifier_upgrade_or_offline', 'Reconnect your gateway or upgrade it to a version that supports data verification, then try again.'],
    ['source_unreachable', 'Your gateway or data is offline. Reconnect it and try again.'],
  ])('shows plain copy for %s without opening card setup', async (refusal, copy) => {
    vi.mocked(gateway.getGatewayVerificationProbe).mockResolvedValue({ data: { probe_id: 'probe', state: 'refused', refusal, quote_id: null, maximum_hold_usd: null }, retryAfter: 2 });
    render(<GatewayVerificationFlow listingId="listing" sellerId="seller" />);
    fireEvent.click(screen.getByRole('button', { name: 'Check data and get quote' }));
    await screen.findByText(copy);
    expect(payin.getDataVerificationPayInReadiness).not.toHaveBeenCalled();
  });
  it('uses Retry-After before repeating queued reads', async () => {
    vi.useFakeTimers(); vi.mocked(gateway.getGatewayVerificationProbe).mockResolvedValue({ ...queued, retryAfter: 7 });
    await act(async () => { render(<GatewayVerificationFlow listingId="listing" sellerId="seller" />); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Check data and get quote' })); });
    expect(gateway.getGatewayVerificationProbe).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    const count = vi.mocked(gateway.getGatewayVerificationProbe).mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(6999); });
    expect(gateway.getGatewayVerificationProbe).toHaveBeenCalledTimes(count);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(gateway.getGatewayVerificationProbe).toHaveBeenCalledTimes(count + 1);
  });
});
