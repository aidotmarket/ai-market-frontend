// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GatewayVerificationFlow, { AWS_COST_DISCLOSURE } from './GatewayVerificationFlow';
import * as gateway from '@/api/dataVerificationGateway';
import * as payin from '@/api/dataVerificationPayin';
import type { GatewayVerificationEpoch, PublishedScanFindings } from '@/types';
vi.mock('@/api/dataVerificationGateway', async importOriginal => ({ ...await importOriginal<typeof gateway>(), probeGatewayVerification: vi.fn(), getGatewayVerificationProbe: vi.fn(), startGatewayVerification: vi.fn(), getGatewayVerificationEpoch: vi.fn(), gatewayVerificationLifecycle: vi.fn(), getAwsVerifierStatus: vi.fn(), setupAwsVerifier: vi.fn(), removeVerificationRunner: vi.fn() }));
vi.mock('@/api/dataVerificationPayin', () => ({ getDataVerificationPayInReadiness: vi.fn() }));
vi.mock('@/components/DataVerificationPaymentMethod', () => ({ default: () => <p>Hosted card setup</p> }));
const originalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage')!;
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
  afterEach(() => { cleanup(); vi.useRealTimers(); Object.defineProperty(window, 'localStorage', originalStorage); });
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
  it('recovers an uncertain authorization after quote expiry with the original command and key', async () => {
    vi.mocked(gateway.startGatewayVerification).mockRejectedValueOnce(new Error('authorization response lost'));
    await getQuote(); acknowledge();
    fireEvent.click(screen.getByRole('button', { name: 'Start paid verification' }));
    await screen.findByRole('alert');
    const original = vi.mocked(gateway.startGatewayVerification).mock.calls[0][1];
    // The backend now resolves this command before expiry/source checks, even
    // when its AUTHORIZING epoch has no scan spec yet.
    vi.setSystemTime(Date.now() + 24 * 60 * 60 * 1000);
    const authorizing = { ...epoch, state: 'AUTHORIZING' as const, reconciliation_required: true };
    vi.mocked(gateway.startGatewayVerification).mockResolvedValueOnce({ data: authorizing, retryAfter: 2 });
    vi.mocked(gateway.getGatewayVerificationEpoch).mockResolvedValue({ data: authorizing, retryAfter: 2 });
    cleanup(); render(<GatewayVerificationFlow listingId="listing" sellerId="seller" />);
    await screen.findByText('Your verification quote');
    screen.getAllByRole('checkbox').filter(el => /I understand|I agree/.test(el.parentElement?.textContent ?? '')).forEach(el => fireEvent.click(el));
    fireEvent.click(screen.getByRole('button', { name: 'Start paid verification' }));
    await screen.findByText('We are confirming your payment. Please wait before starting again.');
    expect(vi.mocked(gateway.startGatewayVerification).mock.calls[1][1]).toEqual(original);
    expect(JSON.parse(window.localStorage.getItem(key)!)).toMatchObject({ startCommand: original, epochId: 'epoch' });
    expect(gateway.probeGatewayVerification).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Get a new quote' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Start paid verification' })).toBeNull();
  });
  it.each(['AUTHORIZING', 'SCANNING_LOCAL', 'CAPTURED'] as const)('follows the existing %s epoch when a new command is refused', async state => {
    const existing = { ...epoch, verification_id: 'existing-epoch', state, reconciliation_required: state === 'AUTHORIZING' };
    vi.mocked(gateway.startGatewayVerification).mockRejectedValueOnce({ response: { status: 409, data: { detail: { code: 'verification_in_progress', epoch_id: 'existing-epoch' } } } });
    vi.mocked(gateway.getGatewayVerificationEpoch).mockResolvedValue({ data: existing, retryAfter: 2 });
    await getQuote(); acknowledge();
    fireEvent.click(screen.getByRole('button', { name: 'Start paid verification' }));
    await screen.findByText(state === 'AUTHORIZING' ? 'We are confirming your payment. Please wait before starting again.' : state === 'CAPTURED' ? 'Review your findings' : 'Verification is in progress. You can return to this page to check it.');
    expect(gateway.getGatewayVerificationEpoch).toHaveBeenCalledWith('listing', 'existing-epoch');
    const saved = JSON.parse(window.localStorage.getItem(key)!);
    expect(saved.epochId).toBe('existing-epoch');
    expect(saved.startCommand).toEqual(vi.mocked(gateway.startGatewayVerification).mock.calls[0][1]);
    expect(saved.quoteRefused).toBeUndefined();
    expect(screen.queryByRole('button', { name: 'Get a new quote' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Start paid verification' })).toBeNull();
    if (state === 'SCANNING_LOCAL') expect(screen.getByRole('button', { name: 'Cancel verification' })).toBeTruthy();
    if (state === 'CAPTURED') expect(screen.getByRole('button', { name: 'Publish all findings' })).toBeTruthy();
    cleanup(); render(<GatewayVerificationFlow listingId="listing" sellerId="seller" />);
    await screen.findByText(state === 'AUTHORIZING' ? 'We are confirming your payment. Please wait before starting again.' : state === 'CAPTURED' ? 'Review your findings' : 'Verification is in progress. You can return to this page to check it.');
    expect(gateway.startGatewayVerification).toHaveBeenCalledTimes(1);
    expect(gateway.probeGatewayVerification).toHaveBeenCalledTimes(1);
  });
  it('does not offer renewal for a terminal status still awaiting payment reconciliation', async () => {
    window.localStorage.setItem(key, JSON.stringify({ probeCommand: { confirm: true, preview_requested: false, idempotency_key: 'key' }, epochId: 'epoch' }));
    vi.mocked(gateway.getGatewayVerificationEpoch).mockResolvedValue({ data: { ...epoch, state: 'DECLINED', reconciliation_required: true }, retryAfter: 2 });
    render(<GatewayVerificationFlow listingId="listing" sellerId="seller" />);
    await screen.findByText('We are confirming your payment. Please wait before starting again.');
    expect(screen.queryByRole('button', { name: 'Get a new quote' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Start paid verification' })).toBeNull();
  });
  it('retains the existing epoch when its first status read is lost', async () => {
    vi.mocked(gateway.startGatewayVerification).mockRejectedValueOnce({ response: { status: 409, data: { detail: { code: 'verification_in_progress', epoch_id: 'epoch' } } } });
    vi.mocked(gateway.getGatewayVerificationEpoch).mockRejectedValueOnce(new Error('lost status'));
    await getQuote(); acknowledge();
    fireEvent.click(screen.getByRole('button', { name: 'Start paid verification' }));
    await screen.findByRole('alert');
    expect(JSON.parse(window.localStorage.getItem(key)!).epochId).toBe('epoch');
    expect(screen.queryByRole('button', { name: 'Start paid verification' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Get a new quote' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    await screen.findByText('Verification is in progress. You can return to this page to check it.');
    expect(gateway.startGatewayVerification).toHaveBeenCalledTimes(1);
  });
  it.each(['quote_binding_or_expiry', 'source_changed', { code: 'quote_binding_or_expiry' }, { code: 'source_changed' }])('renews after definite %s refusal during card setup and across refresh', async detail => {
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
    expect(screen.queryByRole('button', { name: 'Check again' })).toBeNull();
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
    { response: { status: 409, data: { detail: { code: 'verification_in_progress' } } } },
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
    expect(screen.getByRole('heading', { name: 'Check verification availability' })).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    const count = vi.mocked(gateway.getGatewayVerificationProbe).mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(6999); });
    expect(gateway.getGatewayVerificationProbe).toHaveBeenCalledTimes(count);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(gateway.getGatewayVerificationProbe).toHaveBeenCalledTimes(count + 1);
  });
});

const awsStatus: gateway.AWSVerifierStatus = {
  state: 'none', eligible: true, connection_id: 'connection', runner_id: null, region: 'eu-north-1', code_sha256: null,
  registered_at: null, last_seen_at: null, poll_interval_minutes: 1, setup_expires_at: null,
};
const registered = { ...awsStatus, state: 'waiting' as const, runner_id: 'aws-runner', code_sha256: 'a'.repeat(64), registered_at: '2026-10-05T12:00:00Z' };
const awsArtifact: PublishedScanFindings = {
  ...artifact,
  execution: { ...artifact.execution, runner_kind: 'aws', connector_type: 'aws_s3_verifier', connector_version: 'aws_s3_verifier-v1' },
  provenance_label: "Facts computed in the seller's own AWS account",
  attestation: "On 2026-10-04 00:00:00 UTC, at the data owner's authorization and expense, ai.market directed a scan of the seller-designated source for this listing inside the owner's own AWS account; the structural facts below were computed by ai.market-authored open-source scanner code (version 1.2.3) executed in that owner-controlled environment, and the findings are published unedited.",
  disclaimer: "This is a seller-published, point-in-time scan of what the seller-designated source exposed to the scanner in the owner's own AWS account on 2026-10-04; the source may change at any time, and this is not a continuing audit, warranty, compliance certification, or guarantee that data delivered later will match or remain available, accurate, complete, or unchanged. Verification does not assess data accuracy, legality, or fitness for any purpose.",
};
async function openAws(sellerId = 'seller') {
  render(<GatewayVerificationFlow listingId="listing" sellerId={sellerId} verifier={{ kind: 'aws', connectionId: 'connection' }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Verify this data' }));
  await waitFor(() => expect(gateway.getAwsVerifierStatus).toHaveBeenCalled());
}
async function awsQuote() {
  vi.mocked(gateway.getAwsVerifierStatus).mockResolvedValue({ ...registered, state: 'ready' });
  await openAws();
  await screen.findByText('Ready');
  fireEvent.click(screen.getByRole('button', { name: 'Check data and get quote' }));
  await screen.findByText('Your verification quote');
}
describe('AWS verifier in the shared seller flow', () => {
  let replace: ReturnType<typeof vi.fn>;
  let close: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.clearAllMocks();
    const values = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', { configurable: true, value: {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key)),
    } });
    replace = vi.fn(); close = vi.fn();
    vi.spyOn(window, 'open').mockReturnValue({ opener: window, location: { replace }, close } as unknown as Window);
    vi.mocked(gateway.getAwsVerifierStatus).mockReset().mockResolvedValue(awsStatus);
    vi.mocked(gateway.setupAwsVerifier).mockReset().mockResolvedValue({ connection_id: 'connection', quick_create_url: 'https://console.aws.amazon.com/?param_RegistrationToken=secret-token', expires_at_utc: '2026-10-05T12:30:00Z', scanner_version: '1.2.3', image_digest: 'sha256:hash' });
    vi.mocked(gateway.removeVerificationRunner).mockReset().mockResolvedValue(undefined);
    vi.mocked(gateway.probeGatewayVerification).mockReset().mockResolvedValue(queued);
    vi.mocked(gateway.getGatewayVerificationProbe).mockReset().mockResolvedValue(quote);
    vi.mocked(gateway.startGatewayVerification).mockReset().mockResolvedValue({ data: epoch, retryAfter: 2 });
    vi.mocked(gateway.getGatewayVerificationEpoch).mockReset().mockResolvedValue({ data: epoch, retryAfter: 2 });
    vi.mocked(payin.getDataVerificationPayInReadiness).mockReset().mockResolvedValue({ version: 'data_verification_payin_readiness_v1', state: 'ready', can_start_setup: false, can_replace_payment_method: true, message: 'ignored' });
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); Object.defineProperty(window, 'localStorage', originalStorage); });
  it('confirms setup, passes the prefilled URL directly to a new tab, and waits for status ready after registration', async () => {
    await openAws();
    fireEvent.click(await screen.findByRole('button', { name: 'Set up the verifier' }));
    expect(gateway.setupAwsVerifier).not.toHaveBeenCalled();
    vi.mocked(gateway.getAwsVerifierStatus).mockResolvedValue({ ...awsStatus, state: 'waiting' });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm setup' }));
    await screen.findByText('Waiting for verifier');
    expect(gateway.setupAwsVerifier).toHaveBeenCalledWith({ connection_id: 'connection' });
    expect(window.open).toHaveBeenCalledWith('about:blank', '_blank');
    expect(replace).toHaveBeenCalledWith('https://console.aws.amazon.com/?param_RegistrationToken=secret-token');
    expect((screen.getByRole('button', { name: 'Check data and get quote' }) as HTMLButtonElement).disabled).toBe(true);
    vi.mocked(gateway.getAwsVerifierStatus).mockResolvedValue(registered);
    fireEvent.click(screen.getByRole('button', { name: 'Check verifier status' }));
    await screen.findByText(registered.code_sha256);
    expect(screen.getByText(registered.registered_at)).toBeTruthy();
    expect(screen.queryByText('Ready')).toBeNull();
    vi.mocked(gateway.getAwsVerifierStatus).mockResolvedValue({ ...registered, state: 'ready' });
    fireEvent.click(screen.getByRole('button', { name: 'Check verifier status' }));
    await screen.findByText('Ready');
    expect((screen.getByRole('button', { name: 'Check data and get quote' }) as HTMLButtonElement).disabled).toBe(false);
    expect(gateway.probeGatewayVerification).not.toHaveBeenCalled();
  });
  it('polls at thirty seconds and never marks a registered waiting runner ready', async () => {
    vi.mocked(gateway.getAwsVerifierStatus).mockResolvedValue(registered);
    await openAws(); await screen.findByText('Waiting for verifier');
    vi.useFakeTimers();
    // Remount under fake timers to control the entire status loop.
    cleanup();
    await act(async () => {
      render(<GatewayVerificationFlow listingId="listing" sellerId="seller" verifier={{ kind: 'aws', connectionId: 'connection' }} />);
    });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Verify this data' })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(29999); });
    expect(gateway.getAwsVerifierStatus).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(gateway.getAwsVerifierStatus).toHaveBeenCalledTimes(3);
    expect(screen.queryByText('Ready')).toBeNull();
  });
  it.each(['aws_region_unsupported', 'aws_source_too_large', 'aws_source_scope_unrepresentable', 'registration_expired', 'registration_replayed'])('shows %s without a quote or payment', async code => {
    vi.mocked(gateway.setupAwsVerifier).mockRejectedValue({ response: { status: 409, data: { detail: code } } });
    await openAws();
    fireEvent.click(await screen.findByRole('button', { name: 'Set up the verifier' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm setup' }));
    expect((await screen.findByRole('alert')).textContent).toBe(gateway.verificationRefusalCopy(code));
    if (code === 'aws_source_too_large') expect(screen.getByRole('link', { name: 'Set up your own AIM Data gateway' }).getAttribute('href')).toBe('/dashboard/gateways');
    expect(close).toHaveBeenCalled();
    expect(gateway.probeGatewayVerification).not.toHaveBeenCalled();
    expect(payin.getDataVerificationPayInReadiness).not.toHaveBeenCalled();
  });
  it('requires explicit replacement confirmation after a concurrent registration', async () => {
    vi.mocked(gateway.setupAwsVerifier).mockRejectedValueOnce({ response: { status: 409, data: { detail: 'replacement_confirmation_required' } } });
    await openAws();
    fireEvent.click(await screen.findByRole('button', { name: 'Set up the verifier' }));
    vi.mocked(gateway.getAwsVerifierStatus).mockResolvedValue(registered);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm setup' }));
    await screen.findByRole('button', { name: 'Confirm replacement' });
    expect(gateway.setupAwsVerifier).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm replacement' }));
    await waitFor(() => expect(gateway.setupAwsVerifier).toHaveBeenCalledTimes(2));
    expect(gateway.setupAwsVerifier).toHaveBeenLastCalledWith({ connection_id: 'connection', replace_runner_id: 'aws-runner', confirm_replace: true });
  });
  it('explains exact registration retry recovery and expiry without retaining the setup secret', async () => {
    vi.mocked(gateway.getAwsVerifierStatus).mockResolvedValue({ ...awsStatus, state: 'waiting', setup_expires_at: '2026-10-05T12:30:00Z' });
    const session = vi.spyOn(Storage.prototype, 'setItem');
    const log = vi.spyOn(console, 'log');
    const error = vi.spyOn(console, 'error');
    const beacon = vi.fn(); Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: beacon });
    await openAws();
    fireEvent.click(await screen.findByRole('button', { name: 'Set up the verifier' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm setup' }));
    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(screen.getByText(/An exact registration retry recovers its acknowledgment/)).toBeTruthy();
    expect(window.localStorage.setItem).not.toHaveBeenCalled(); expect(session).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled(); expect(beacon).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('secret-token');
  });
  it.each(['aws', 'gateway'] as const)('confirms removal for %s and explains unchanged delivery', async kind => {
    if (kind === 'aws') {
      vi.mocked(gateway.getAwsVerifierStatus).mockResolvedValue({ ...registered, state: 'ready' }); await openAws();
    } else render(<GatewayVerificationFlow listingId="listing" sellerId="seller" verifier={{ kind: 'gateway', runnerId: 'gateway-runner' }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove verifier' }));
    expect(gateway.removeVerificationRunner).not.toHaveBeenCalled();
    expect(screen.getByText(/Marketplace delivery is unchanged/)).toBeTruthy();
    if (kind === 'aws') {
      expect(screen.getByText(/Deleting the CloudFormation stack stops its AWS resources and costs/)).toBeTruthy();
      vi.mocked(gateway.getAwsVerifierStatus).mockResolvedValue({ ...registered, state: 'removed' });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Confirm removal' }));
    await waitFor(() => expect(gateway.removeVerificationRunner).toHaveBeenCalledWith(`${kind}-runner`));
    if (kind === 'aws') { await screen.findByText('Removed'); expect((screen.getByRole('button', { name: 'Check data and get quote' }) as HTMLButtonElement).disabled).toBe(true); }
  });
  it('discloses exact AWS costs before the confirmed probe and gets a quote without a card', async () => {
    vi.mocked(gateway.getAwsVerifierStatus).mockResolvedValue({ ...registered, state: 'ready' });
    await openAws(); await screen.findByText('Ready');
    expect(screen.getByText(AWS_COST_DISCLOSURE)).toBeTruthy();
    expect(AWS_COST_DISCLOSURE).toBe('Runs in your AWS account; typical cost about one cent per scan plus a small monthly amount. The strict network option costs more. The free probe also runs a scan in your AWS account; AWS charges are separate from the ai.market verification fee.');
    expect(gateway.probeGatewayVerification).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Check data and get quote' }));
    await screen.findByText('Your verification quote');
    expect(gateway.probeGatewayVerification).toHaveBeenCalledWith('listing', expect.objectContaining({ confirm: true }));
    expect(payin.getDataVerificationPayInReadiness).not.toHaveBeenCalled();
    screen.getAllByRole('checkbox').filter(el => /I understand|I agree/.test(el.parentElement?.textContent ?? '')).forEach(el => expect((el as HTMLInputElement).checked).toBe(false));
    expect(window.localStorage.setItem).toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(window.localStorage.setItem).mock.calls)).not.toMatch(/secret-token|quick_create_url|RegistrationToken/);
  });
  it('keeps JIT setup deliberate and resumes the same paid request after refresh', async () => {
    vi.mocked(payin.getDataVerificationPayInReadiness).mockResolvedValueOnce({ version: 'data_verification_payin_readiness_v1', state: 'setup_required', can_start_setup: true, can_replace_payment_method: false, message: 'ignored' });
    await awsQuote(); acknowledge(); fireEvent.click(screen.getByRole('button', { name: 'Start paid verification' }));
    await screen.findByText('Hosted card setup');
    const saved = JSON.parse(window.localStorage.getItem(key)!).startCommand;
    expect(gateway.startGatewayVerification).not.toHaveBeenCalled();
    cleanup(); await openAws(); await screen.findByText('Your verification quote');
    screen.getAllByRole('checkbox').filter(el => /I understand|I agree/.test(el.parentElement?.textContent ?? '')).forEach(el => fireEvent.click(el));
    fireEvent.click(screen.getByRole('button', { name: 'Start paid verification' }));
    await waitFor(() => expect(gateway.startGatewayVerification).toHaveBeenCalledWith('listing', saved));
  });
  it.each(['publish', 'decline'] as const)('reviews the frozen AWS copy and confirms %s with equal decision buttons', async action => {
    const captured = { ...epoch, state: 'CAPTURED' as const, captured_usd: '2.00', publication_allowed: true, findings: awsArtifact };
    vi.mocked(gateway.getGatewayVerificationEpoch).mockResolvedValue({ data: captured, retryAfter: 2 });
    window.localStorage.setItem(key, JSON.stringify({ probeCommand: { confirm: true, preview_requested: false, idempotency_key: 'key' }, epochId: 'epoch' }));
    await openAws(); await screen.findByText('Review your findings');
    expect(screen.getByText(awsArtifact.provenance_label!)).toBeTruthy();
    expect(screen.getByText(awsArtifact.attestation)).toBeTruthy(); expect(screen.getByText(awsArtifact.disclaimer)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Publish all findings' }).className).toBe(screen.getByRole('button', { name: 'Decline publication' }).className);
    fireEvent.click(screen.getByRole('button', { name: action === 'publish' ? 'Publish all findings' : 'Decline publication' }));
    expect(gateway.gatewayVerificationLifecycle).not.toHaveBeenCalled();
    const state = action === 'publish' ? 'PUBLISHED' : 'DECLINED';
    vi.mocked(gateway.gatewayVerificationLifecycle).mockResolvedValue({ data: { ...captured, state }, retryAfter: 2 });
    vi.mocked(gateway.getGatewayVerificationEpoch).mockResolvedValue({ data: { ...captured, state }, retryAfter: 2 });
    fireEvent.click(screen.getByRole('button', { name: action === 'publish' ? 'Confirm publication' : 'Confirm decline' }));
    await waitFor(() => expect(gateway.gatewayVerificationLifecycle).toHaveBeenCalledWith('listing', { verification_id: 'epoch', listing_id: 'listing', source_handle_id: 'source', requested_action: action, confirm: true }));
  });
  it('retries a lost AWS paid response after refresh with the exact saved command', async () => {
    vi.mocked(gateway.startGatewayVerification).mockRejectedValueOnce(new Error('lost response'));
    await awsQuote(); acknowledge();
    fireEvent.click(screen.getByRole('button', { name: 'Start paid verification' }));
    await screen.findByRole('alert');
    const original = vi.mocked(gateway.startGatewayVerification).mock.calls[0][1];
    cleanup(); await openAws(); await screen.findByText('Your verification quote');
    screen.getAllByRole('checkbox').filter(el => /I understand|I agree/.test(el.parentElement?.textContent ?? '')).forEach(el => fireEvent.click(el));
    fireEvent.click(screen.getByRole('button', { name: 'Start paid verification' }));
    await waitFor(() => expect(gateway.startGatewayVerification).toHaveBeenCalledTimes(2));
    expect(vi.mocked(gateway.startGatewayVerification).mock.calls[1][1]).toEqual(original);
  });
  it('retries a lost AWS probe after refresh with the same confirmation and key', async () => {
    vi.mocked(gateway.getAwsVerifierStatus).mockResolvedValue({ ...registered, state: 'ready' });
    vi.mocked(gateway.probeGatewayVerification).mockRejectedValueOnce(new Error('lost response'));
    await openAws(); await screen.findByText('Ready');
    fireEvent.click(screen.getByRole('button', { name: 'Check data and get quote' }));
    await screen.findByRole('alert');
    const original = vi.mocked(gateway.probeGatewayVerification).mock.calls[0][1];
    cleanup(); await openAws(); await screen.findByText('Ready');
    fireEvent.click(screen.getByRole('button', { name: 'Check data and get quote' }));
    await screen.findByText('Your verification quote');
    expect(gateway.probeGatewayVerification).toHaveBeenLastCalledWith('listing', original);
  });
  it('confirms withdrawal using the frozen AWS epoch binding', async () => {
    window.localStorage.setItem(key, JSON.stringify({ probeCommand: { confirm: true, preview_requested: false, idempotency_key: 'key' }, epochId: 'epoch' }));
    vi.mocked(gateway.getGatewayVerificationEpoch).mockResolvedValue({ data: { ...epoch, state: 'PUBLISHED' }, retryAfter: 2 });
    await openAws(); fireEvent.click(await screen.findByRole('button', { name: 'Withdraw findings' }));
    expect(gateway.gatewayVerificationLifecycle).not.toHaveBeenCalled();
    vi.mocked(gateway.gatewayVerificationLifecycle).mockResolvedValue({ data: { ...epoch, state: 'WITHDRAWN' }, retryAfter: 2 });
    vi.mocked(gateway.getGatewayVerificationEpoch).mockResolvedValue({ data: { ...epoch, state: 'WITHDRAWN' }, retryAfter: 2 });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm withdrawal' }));
    await screen.findByText('These findings have been withdrawn.');
    expect(gateway.gatewayVerificationLifecycle).toHaveBeenCalledWith('listing', { verification_id: 'epoch', listing_id: 'listing', source_handle_id: 'source', requested_action: 'withdraw', confirm: true });
  });
  it('isolates a saved AWS attempt from another seller', async () => {
    window.localStorage.setItem(key, JSON.stringify({ probeCommand: { confirm: true, preview_requested: false, idempotency_key: 'key' }, epochId: 'epoch' }));
    await openAws('other-seller'); await screen.findByText('Set up the verifier to check this data.');
    expect(gateway.getGatewayVerificationEpoch).not.toHaveBeenCalled();
    expect(screen.queryByText('Loading your existing verification. Check again to follow its status.')).toBeNull();
  });
  it('disables new probes when a ready status cannot be refreshed', async () => {
    vi.mocked(gateway.getAwsVerifierStatus).mockResolvedValueOnce({ ...registered, state: 'ready' }).mockRejectedValue(new Error('offline'));
    await openAws(); await screen.findByText('Ready');
    fireEvent.click(screen.getByRole('button', { name: 'Check verifier status' }));
    await screen.findByRole('alert');
    expect((screen.getByRole('button', { name: 'Check data and get quote' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
