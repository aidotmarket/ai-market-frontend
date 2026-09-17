// @vitest-environment jsdom
import {webcrypto} from 'node:crypto';
import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {makePreview} from '@/tests/previewFixture';
import {fetchPreviewKeys, fetchPreviewManifest} from '@/lib/api';
import {fetchPackage} from '@/lib/listing-preview/transport';
import {scanLocalPreview} from '@/lib/listing-preview/policy';
import ListingSamplePreview from './ListingSamplePreview';

vi.mock('@/lib/api', () => ({fetchPreviewManifest: vi.fn(), fetchPreviewKeys: vi.fn()}));
vi.mock('@/lib/listing-preview/transport', () => ({fetchPackage: vi.fn()}));
vi.mock('@/lib/listing-preview/policy', () => ({scanLocalPreview: vi.fn()}));
let f: Awaited<ReturnType<typeof makePreview>>;
beforeEach(async () => {
  vi.stubGlobal('crypto', webcrypto); vi.resetAllMocks(); f = await makePreview();
  vi.spyOn(Date, 'now').mockReturnValue(f.now);
  Object.defineProperty(document, 'visibilityState', {configurable: true, value: 'visible'});
  vi.mocked(fetchPreviewManifest).mockResolvedValue(f.manifest); vi.mocked(fetchPreviewKeys).mockResolvedValue(f.keys);
  vi.mocked(fetchPackage).mockResolvedValue(f.raw); vi.mocked(scanLocalPreview).mockResolvedValue(undefined);
});
afterEach(() => {cleanup(); vi.restoreAllMocks(); vi.useRealTimers();});
async function mount() {render(<ListingSamplePreview slug="current-canonical" listingId={f.manifest.listing_id} />); await screen.findByRole('button', {name: 'View sample'});}
async function view() {await mount(); fireEvent.click(screen.getByRole('button', {name: 'View sample'})); await screen.findByRole('table');}
async function visibility(state: string) {await act(async () => {Object.defineProperty(document, 'visibilityState', {configurable: true, value: state}); document.dispatchEvent(new Event('visibilitychange'));});}

it('has byte-empty markup without a manifest and no seller fetch', async () => {
  vi.mocked(fetchPreviewManifest).mockResolvedValue(null); const v = render(<ListingSamplePreview slug="none" listingId={f.manifest.listing_id} />);
  await waitFor(() => expect(fetchPreviewManifest).toHaveBeenCalledOnce()); expect(v.container.innerHTML).toBe(''); expect(fetchPackage).not.toHaveBeenCalled();
});
it('does not fetch the seller before an explicit request or when keys are 503/absent', async () => {
  await mount(); expect(fetchPackage).not.toHaveBeenCalled(); expect(scanLocalPreview).not.toHaveBeenCalled();
  cleanup(); vi.mocked(fetchPreviewKeys).mockResolvedValue(null); const v = render(<ListingSamplePreview slug="no-keys" listingId={f.manifest.listing_id} />);
  await waitFor(() => expect(fetchPreviewKeys).toHaveBeenCalledTimes(2)); expect(v.container.innerHTML).toBe(''); expect(fetchPackage).not.toHaveBeenCalled();
});
it('waits for verification and the final manifest before rendering any row', async () => {
  let finish!: () => void; vi.mocked(scanLocalPreview).mockReturnValue(new Promise(r => {finish = r;}));
  await mount(); fireEvent.click(screen.getByRole('button', {name: 'View sample'}));
  await waitFor(() => expect(scanLocalPreview).toHaveBeenCalledOnce());
  expect(screen.queryByRole('table')).toBeNull(); expect(screen.queryByText('barley')).toBeNull(); expect(fetchPreviewManifest).toHaveBeenCalledTimes(2);
  await act(async () => {finish();}); await screen.findByRole('table'); expect(fetchPreviewManifest).toHaveBeenCalledTimes(3);
});
it('hides on tab departure and stays hidden after withdrawal on return', async () => {
  await view(); await visibility('hidden'); expect(screen.queryByRole('table')).toBeNull();
  vi.mocked(fetchPreviewManifest).mockResolvedValue(null); await visibility('visible');
  await screen.findByText('Sample unavailable'); expect(screen.queryByRole('table')).toBeNull();
});
it('revalidates a same-size independently retained checkpoint on tab return', async () => {
  await view(); await visibility('hidden'); expect(screen.queryByRole('table')).toBeNull();
  await visibility('visible'); await screen.findByRole('table');
  expect(fetchPackage).toHaveBeenCalledTimes(2);
});
it('stays hidden after an offline return and rejects an expired manifest on fresh request', async () => {
  await view(); await visibility('hidden'); vi.mocked(fetchPreviewManifest).mockRejectedValue(new TypeError('offline'));
  await visibility('visible'); await screen.findByText('Sample unavailable'); expect(screen.queryByRole('table')).toBeNull();
  cleanup(); vi.mocked(fetchPreviewManifest).mockResolvedValue({...f.manifest, valid_until: '2026-09-17T00:00:00.000000Z'});
  await mount(); fireEvent.click(screen.getByRole('button', {name: 'View sample'})); await screen.findByText('Sample unavailable');
  expect(screen.queryByRole('table')).toBeNull(); expect(fetchPackage).toHaveBeenCalledTimes(1);
});
it('rejects offline and late replies after a return timeout', async () => {
  await view(); await visibility('hidden'); vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
  let finish!: (v: typeof f.manifest) => void; vi.mocked(fetchPreviewManifest).mockReturnValue(new Promise(r => {finish = r;}));
  await visibility('visible'); await act(async () => {await vi.advanceTimersByTimeAsync(5000);});
  expect(screen.queryByRole('table')).toBeNull(); expect(screen.getByText('Sample unavailable')).toBeTruthy();
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
  await mount(); fireEvent.click(screen.getByRole('button', {name: 'View sample'})); await screen.findByText('Sample unavailable');
  expect(fetchPackage).not.toHaveBeenCalled(); expect(screen.queryByRole('table')).toBeNull();
});
