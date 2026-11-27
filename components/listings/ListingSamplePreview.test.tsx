// @vitest-environment jsdom
import {readFileSync} from 'node:fs';
import * as verifier from '@/lib/listing-preview/verifier';
import {testSign} from '@/tests/previewFixture';
import {webcrypto} from 'node:crypto';
import {act, cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {makeCurrentPreview, makeFreshnessTransitionPreview, makePreview} from '@/tests/previewFixture';
import {fetchPreviewKeys, fetchPreviewManifest, fetchSignedSummaryPayload} from '@/lib/api';
import {fetchPackage} from '@/lib/listing-preview/transport';
import ListingSamplePreview from './ListingSamplePreview';

vi.mock('@/lib/api', () => ({fetchPreviewManifest: vi.fn(), fetchPreviewKeys: vi.fn(), fetchSignedSummaryPayload: vi.fn()}));
vi.mock('@/lib/listing-preview/transport', () => ({fetchPackage: vi.fn()}));
let f: Awaited<ReturnType<typeof makePreview>>;
beforeEach(async () => {
  vi.stubGlobal('crypto', webcrypto); vi.resetAllMocks(); vi.mocked(fetchSignedSummaryPayload).mockResolvedValue(null); f = await makePreview();
  vi.spyOn(Date, 'now').mockReturnValue(f.now);
  Object.defineProperty(document, 'visibilityState', {configurable: true, value: 'visible'});
  vi.mocked(fetchPreviewManifest).mockResolvedValue(f.manifest); vi.mocked(fetchPreviewKeys).mockResolvedValue(f.keys);
  vi.mocked(fetchPackage).mockResolvedValue(f.raw);
});
afterEach(() => {cleanup(); vi.restoreAllMocks(); vi.useRealTimers();});
async function mount() {render(<ListingSamplePreview slug="current-canonical" listingId={f.manifest.listing_id} />); await screen.findByRole('button', {name: 'View sample'});}
async function view() {await mount(); fireEvent.click(screen.getByRole('button', {name: 'View sample'})); await screen.findByRole('table');}
async function visibility(state: string) {await act(async () => {Object.defineProperty(document, 'visibilityState', {configurable: true, value: state}); document.dispatchEvent(new Event('visibilitychange'));});}

it('has byte-empty markup without a manifest and no seller fetch', async () => {
  vi.mocked(fetchPreviewManifest).mockResolvedValue(null); const v = render(<ListingSamplePreview slug="none" listingId={f.manifest.listing_id} />);
  await waitFor(() => expect(fetchPreviewManifest).toHaveBeenCalledOnce()); expect(v.container.innerHTML).toBe(''); expect(fetchPackage).not.toHaveBeenCalled();
});
it('shows the listing guidance whenever the preview has no sample to show', async () => {
  const emptyNotice = 'Want to check field names or whether a data dictionary is included? Use Ask a Question before you buy.';
  vi.mocked(fetchPreviewManifest).mockResolvedValueOnce(null).mockResolvedValueOnce(f.manifest).mockRejectedValueOnce(new TypeError('offline'));
  await act(async () => {render(<ListingSamplePreview slug="sample" listingId={f.manifest.listing_id} emptyNotice={emptyNotice} />);});
  expect(screen.getByText(emptyNotice)).toBeTruthy();
  await visibility('visible');
  expect(await screen.findByRole('button', {name: 'View sample'})).toBeTruthy();
  expect(screen.queryByText(emptyNotice)).toBeNull();
  await visibility('visible');
  expect(screen.getByText(emptyNotice)).toBeTruthy();
  expect(screen.queryByRole('button', {name: 'View sample'})).toBeNull();
  expect(fetchPackage).not.toHaveBeenCalled();
});
it('shows the load failure and listing guidance together when verification fails after View sample', async () => {
  const emptyNotice = 'Want to check field names or whether a data dictionary is included? Use Ask a Question before you buy.';
  const failureMessage = 'We could not load this sample just now. Ask the seller for a sample using the question form on this listing.';
  vi.spyOn(verifier, 'verifyManifest').mockRejectedValueOnce(new Error('verification failed'));
  render(<ListingSamplePreview slug="sample" listingId={f.manifest.listing_id} emptyNotice={emptyNotice} />);

  fireEvent.click(await screen.findByRole('button', {name: 'View sample'}));

  await screen.findByText(failureMessage);
  const status = within(screen.getByRole('status'));
  expect(status.getByText(failureMessage)).toBeTruthy();
  expect(status.getByText(emptyNotice)).toBeTruthy();
});
it('does not fetch the seller before an explicit request or when keys are 503/absent', async () => {
  await mount(); expect(fetchPackage).not.toHaveBeenCalled();
  cleanup(); vi.mocked(fetchPreviewKeys).mockResolvedValue(null); const v = render(<ListingSamplePreview slug="no-keys" listingId={f.manifest.listing_id} />);
  await waitFor(() => expect(fetchPreviewKeys).toHaveBeenCalledTimes(2)); expect(v.container.innerHTML).toBe(''); expect(fetchPackage).not.toHaveBeenCalled();
});
it('reports the current read-only selected fields to seller chrome without changing preview markup', async () => {
  const onManifest = vi.fn();
  const view = render(<ListingSamplePreview slug="current-canonical" listingId={f.manifest.listing_id} onManifest={onManifest} />);
  await screen.findByRole('button', {name: 'View sample'});
  expect(onManifest).toHaveBeenCalledWith(f.manifest);
  expect(view.container.textContent).not.toContain(f.manifest.selected_fields.join(','));
});
it('waits for verification and the final manifest before rendering any row', async () => {
  let finish!: (manifest: typeof f.manifest) => void; let calls = 0;
  vi.mocked(fetchPreviewManifest).mockImplementation(() => ++calls === 3 ? new Promise(r => {finish = r;}) : Promise.resolve(f.manifest));
  await mount(); fireEvent.click(screen.getByRole('button', {name: 'View sample'}));
  await waitFor(() => expect(fetchPreviewManifest).toHaveBeenCalledTimes(3));
  expect(screen.queryByRole('table')).toBeNull(); expect(screen.queryByText('barley')).toBeNull();
  await act(async () => {finish(f.manifest);}); await screen.findByRole('table');
});
it('hides on tab departure and stays hidden after withdrawal on return', async () => {
  await view(); await visibility('hidden'); expect(screen.queryByRole('table')).toBeNull();
  vi.mocked(fetchPreviewManifest).mockResolvedValue(null); await visibility('visible');
  await screen.findByText('We could not load this sample just now. Ask the seller for a sample using the question form on this listing.'); expect(screen.queryByRole('table')).toBeNull();
});
it('revalidates a same-size independently retained checkpoint on tab return', async () => {
  await view(); await visibility('hidden'); expect(screen.queryByRole('table')).toBeNull();
  await visibility('visible'); await screen.findByRole('table');
  expect(fetchPackage).toHaveBeenCalledTimes(2);
});
it('stays hidden after an offline return and rejects an expired manifest on fresh request', async () => {
  await view(); await visibility('hidden'); vi.mocked(fetchPreviewManifest).mockRejectedValue(new TypeError('offline'));
  await visibility('visible'); await screen.findByText('We could not load this sample just now. Ask the seller for a sample using the question form on this listing.'); expect(screen.queryByRole('table')).toBeNull();
  cleanup(); vi.mocked(fetchPreviewManifest).mockResolvedValue({...f.manifest, valid_until: '2026-09-17T00:00:00.000000Z'});
  await mount(); fireEvent.click(screen.getByRole('button', {name: 'View sample'})); await screen.findByText('We could not load this sample just now. Ask the seller for a sample using the question form on this listing.');
  expect(screen.queryByRole('table')).toBeNull(); expect(fetchPackage).toHaveBeenCalledTimes(1);
});
it('keeps rows hidden with neutral UI when the device clock is behind the signed generation time', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse(f.manifest.generated_at) - 1_000);
  await mount(); fireEvent.click(screen.getByRole('button', {name: 'View sample'}));
  await screen.findByText('We could not load this sample just now. Ask the seller for a sample using the question form on this listing.');
  expect(screen.queryByRole('table')).toBeNull();
  expect(screen.queryByText('clock_uncertain')).toBeNull();
  expect(fetchPackage).not.toHaveBeenCalled();
});
it('rejects offline and late replies after a return timeout', async () => {
  await view(); await visibility('hidden'); vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
  let finish!: (v: typeof f.manifest) => void; vi.mocked(fetchPreviewManifest).mockReturnValue(new Promise(r => {finish = r;}));
  await visibility('visible'); await act(async () => {await vi.advanceTimersByTimeAsync(5000);});
  expect(screen.queryByRole('table')).toBeNull(); expect(screen.getByText('We could not load this sample just now. Ask the seller for a sample using the question form on this listing.')).toBeTruthy();
  await act(async () => {finish(f.manifest);}); expect(screen.queryByRole('table')).toBeNull();
});
it('has no untouched-tab polling and clears on bfcache return before revalidation', async () => {
  await view(); const calls = vi.mocked(fetchPreviewManifest).mock.calls.length;
  vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']}); await act(async () => {await vi.advanceTimersByTimeAsync(120000);});
  expect(fetchPreviewManifest).toHaveBeenCalledTimes(calls); expect(screen.getByRole('table')).toBeTruthy();
  vi.mocked(fetchPreviewManifest).mockReturnValue(new Promise(() => undefined));
  await act(async () => {window.dispatchEvent(new PageTransitionEvent('pageshow', {persisted: true}));});
  expect(screen.queryByRole('table')).toBeNull();
});
it('never contacts the seller after a platform-signature failure', async () => {
  f.manifest.approval.platform_envelope.signature = 'A'.repeat(86);
  await mount(); fireEvent.click(screen.getByRole('button', {name: 'View sample'})); await screen.findByText('We could not load this sample just now. Ask the seller for a sample using the question form on this listing.');
  expect(fetchPackage).not.toHaveBeenCalled(); expect(screen.queryByRole('table')).toBeNull();
});

it('displays seller-published content without a browser content gate', async () => {
  f = await makePreview([{name: 'seller@example.test https://example.test =SUM(A1)'}], [['name', 'string', false, {}]]);
  vi.mocked(fetchPreviewManifest).mockResolvedValue(f.manifest); vi.mocked(fetchPackage).mockResolvedValue(f.raw);
  await view(); expect(screen.getByText('seller@example.test https://example.test =SUM(A1)')).toBeTruthy();
});

it('binds descriptions and units from the current signed payload before insertion', async () => {
  const signed = JSON.parse(readFileSync('tests/fixtures/preview/signed-summary-payload.json', 'utf8'));
  const e = f.manifest.approval.platform_envelope;
  for (const field of ['summary_hash', 'render_hash', 'source_revision'] as const) {
    f.manifest[field] = signed[field]; e.binding[field] = signed[field];
  }
  e.seller_signature = testSign(verifier.disclosureBytes(e.binding)); e.signature = testSign(verifier.platformBytes(e));
  vi.mocked(fetchSignedSummaryPayload).mockResolvedValue(signed);
  await view(); expect(screen.getByText('Crop label')).toBeTruthy();
  expect(fetchSignedSummaryPayload).toHaveBeenCalledWith('current-canonical', expect.any(AbortSignal));
});
it('silently uses identity-only columns when the signed payload is absent or has another hash', async () => {
  vi.mocked(fetchSignedSummaryPayload).mockResolvedValue(JSON.parse(readFileSync('tests/fixtures/preview/signed-summary-payload.json', 'utf8')));
  await view(); expect(screen.queryByText('Crop label')).toBeNull(); expect(screen.queryByText('We could not load this sample just now. Ask the seller for a sample using the question form on this listing.')).toBeNull();
});

it('hides all rows before seller contact for an F2-signed attestation digest mismatch', async () => {
  const e = f.manifest.approval.platform_envelope;
  e.binding.scan_attestation_digest = '0'.repeat(64);
  e.seller_signature = testSign(verifier.disclosureBytes(e.binding)); e.signature = testSign(verifier.platformBytes(e));
  await mount(); fireEvent.click(screen.getByRole('button', {name: 'View sample'})); await screen.findByText('We could not load this sample just now. Ask the seller for a sample using the question form on this listing.');
  expect(fetchPackage).not.toHaveBeenCalled(); expect(screen.queryByRole('table')).toBeNull();
  expect(screen.queryByText('scan_mismatch')).toBeNull();
});

it.each([false, true])('shows source staleness separately from freshness staleness=%s through the full viewer', async freshnessStale => {
  f = await makeCurrentPreview();
  if (freshnessStale) {
    const threshold = Date.parse(f.manifest.freshness_stale_at);
    f.manifest.generated_at = f.manifest.freshness_stale_at;
    f.manifest.valid_until = new Date(threshold + 30_000).toISOString().replace('000Z', '000000Z');
    f.manifest.stale = true; f.now = threshold + 1_000;
  }
  f.manifest.source_stale = true; f.manifest.source_stale_since = f.manifest.generated_at;
  vi.spyOn(Date, 'now').mockReturnValue(f.now);
  vi.mocked(fetchPreviewManifest).mockResolvedValue(f.manifest); vi.mocked(fetchPackage).mockResolvedValue(f.raw);
  await view();
  expect(screen.getByText(`Sample predates the current version (since ${f.manifest.source_stale_since}).`)).toBeTruthy();
  expect(Boolean(screen.queryByText('Stale'))).toBe(freshnessStale);
  const calls = vi.mocked(fetchPreviewManifest).mock.calls.length;
  vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
  await act(async () => {await vi.advanceTimersByTimeAsync(120000);});
  expect(fetchPreviewManifest).toHaveBeenCalledTimes(calls); expect(screen.getByRole('table')).toBeTruthy();
});
it('renders effective re-attestation while retaining the original authenticated binding', async () => {
  f = (await makeFreshnessTransitionPreview()).reattested;
  vi.spyOn(Date, 'now').mockReturnValue(f.now);
  vi.mocked(fetchPreviewManifest).mockResolvedValue(f.manifest); vi.mocked(fetchPackage).mockResolvedValue(f.raw);
  await view();
  expect(screen.getByText(`Last attested by seller: ${f.manifest.last_attested_by_seller_at}`)).toBeTruthy();
  expect(screen.queryByText('Stale')).toBeNull();
  expect(screen.queryByText(/Sample predates the current version/)).toBeNull();
});
it('hides malformed source overlays before requesting the seller package', async () => {
  f.manifest.source_stale = true; f.manifest.source_stale_since = null;
  await mount(); fireEvent.click(screen.getByRole('button', {name: 'View sample'}));
  await screen.findByText('We could not load this sample just now. Ask the seller for a sample using the question form on this listing.'); expect(fetchPackage).not.toHaveBeenCalled();
  expect(screen.queryByRole('table')).toBeNull();
});
