// @vitest-environment jsdom
import {act, cleanup, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {fetchBuyerSummary} from '@/lib/api';
import fixture from '@/tests/fixtures/s1931-listing-license-display.json';
import type {LicenseDisplay} from '@/lib/publicPresentation';
import type {ListingSummary} from '@/lib/api';
import {summary} from '@/tests/summaryFixture';
import BuyerAtAGlance from './BuyerAtAGlance';
const refreshed = {at_a_glance: summary, license_display: null};
vi.mock('@/lib/api', () => ({fetchBuyerSummary: vi.fn()}));
beforeEach(() => {vi.useFakeTimers(); vi.resetAllMocks(); Object.defineProperty(document, 'visibilityState', {configurable: true, value: 'visible'});});
afterEach(() => {cleanup(); vi.useRealTimers();});
async function visibility(state: string) {
  await act(async () => {
    Object.defineProperty(document, 'visibilityState', {configurable: true, value: state});
    document.dispatchEvent(new Event('visibilitychange'));
  });
}
it('keeps initial metadata without fetching, polling or flashing on initial pageshow', async () => {
  render(<BuyerAtAGlance slug="sales" initialSummary={summary} />);
  await act(async () => {
    window.dispatchEvent(new PageTransitionEvent('pageshow', {persisted: false}));
    await vi.advanceTimersByTimeAsync(120_000);
  });
  expect(screen.getByRole('region', {name: 'At a glance'})).toBeTruthy();
  expect(fetchBuyerSummary).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
it('refreshes once on visible and once on persisted pageshow, removing withdrawals', async () => {
  vi.mocked(fetchBuyerSummary).mockResolvedValueOnce(refreshed).mockResolvedValue({at_a_glance: null, license_display: null});
  render(<BuyerAtAGlance slug="sales" initialSummary={summary} />);
  await visibility('hidden');
  expect(fetchBuyerSummary).not.toHaveBeenCalled();
  await visibility('visible');
  expect(fetchBuyerSummary).toHaveBeenCalledTimes(1);
  await act(async () => {window.dispatchEvent(new PageTransitionEvent('pageshow', {persisted: true}));});
  expect(fetchBuyerSummary).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('region', {name: 'At a glance'})).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
});
it('expires a hung refresh after five seconds and ignores late data', async () => {
  let finish!: (value: typeof refreshed) => void;
  vi.mocked(fetchBuyerSummary).mockReturnValue(new Promise(resolve => {finish = resolve;}));
  render(<BuyerAtAGlance slug="sales" initialSummary={summary} />);
  await visibility('visible');
  const signal = vi.mocked(fetchBuyerSummary).mock.calls[0][1];
  await act(async () => {await vi.advanceTimersByTimeAsync(5_000);});
  expect(signal?.aborted).toBe(true);
  expect(screen.queryByRole('region', {name: 'At a glance'})).toBeNull();
  await act(async () => {finish(refreshed);});
  expect(screen.queryByRole('region', {name: 'At a glance'})).toBeNull();
});
it('fails closed on refresh errors and can recover on the next return', async () => {
  vi.mocked(fetchBuyerSummary).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(refreshed);
  render(<BuyerAtAGlance slug="sales" initialSummary={summary} />);
  await visibility('visible');
  expect(screen.queryByRole('region', {name: 'At a glance'})).toBeNull();
  await visibility('hidden'); await visibility('visible');
  expect(screen.getByRole('region', {name: 'At a glance'})).toBeTruthy();
});
it('starts with no markup and shows newly approved metadata on return', async () => {
  vi.mocked(fetchBuyerSummary).mockResolvedValue(refreshed);
  const view = render(<BuyerAtAGlance slug="sales" />);
  expect(view.container.innerHTML).toBe('');
  await visibility('visible');
  expect(screen.getByRole('region', {name: 'At a glance'})).toBeTruthy();
  expect(view.container.textContent).not.toContain('you');
});

it('overlays only the public licence row and preserves the supplied summary', async () => {
  const original = structuredClone(fixture.at_a_glance) as ListingSummary;
  const before = JSON.stringify(original);
  render(<BuyerAtAGlance slug={fixture.slug} initialSummary={original} licenseDisplay={fixture.license_display as LicenseDisplay} />);
  const region = screen.getByRole('region', {name: 'At a glance'});
  expect(region.textContent).toContain('ai.market Standard Data Licence v1.1');
  expect(region.textContent).toContain('Platform-corrected licence display; original seller approval retained');
  expect(region.textContent).not.toContain('provided by the seller');
  expect(region.textContent).not.toContain('v1.0');
  expect(JSON.stringify(original)).toBe(before);
});

it('keeps the original licence and attribution without a correction', () => {
  render(<BuyerAtAGlance slug={fixture.slug} initialSummary={fixture.at_a_glance as ListingSummary} />);
  const region = screen.getByRole('region', {name: 'At a glance'});
  expect(region.textContent).toContain('ai.market Standard Data Licence v1.0');
  expect(region.textContent).toContain('Source: provided by the seller');
});

it('refreshes the summary and correction together on visibility and bfcache return', async () => {
  const original = fixture.at_a_glance as ListingSummary;
  vi.mocked(fetchBuyerSummary).mockResolvedValueOnce({at_a_glance: original, license_display: fixture.license_display as LicenseDisplay})
    .mockResolvedValueOnce({at_a_glance: original, license_display: null});
  render(<BuyerAtAGlance slug={fixture.slug} initialSummary={original} />);
  await visibility('visible');
  expect(screen.getByRole('region', {name: 'At a glance'}).textContent).toContain('v1.1');
  await act(async () => {window.dispatchEvent(new PageTransitionEvent('pageshow', {persisted: true}));});
  const region = screen.getByRole('region', {name: 'At a glance'});
  expect(region.textContent).toContain('v1.0');
  expect(region.textContent).toContain('Source: provided by the seller');
  expect(region.textContent).not.toContain('Platform-corrected');
});

it.each([
  {...fixture.license_display, provenance: 'seller_entered'},
  {...fixture.license_display, license_label: 'arbitrary licence'},
])('keeps the complete original buyer display for an unsupported correction %#', licenseDisplay => {
  const props = {slug: fixture.slug, initialSummary: fixture.at_a_glance as ListingSummary};
  const view = render(<BuyerAtAGlance {...props} />);
  const before = view.container.innerHTML;
  view.rerender(<BuyerAtAGlance {...props} licenseDisplay={licenseDisplay as LicenseDisplay} />);
  expect(view.container.innerHTML).toBe(before);
});
