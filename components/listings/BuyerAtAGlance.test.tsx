// @vitest-environment jsdom
import {act, cleanup, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {fetchBuyerSummary} from '@/lib/api';
import {summary} from '@/tests/summaryFixture';
import BuyerAtAGlance from './BuyerAtAGlance';
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
  vi.mocked(fetchBuyerSummary).mockResolvedValueOnce(summary).mockResolvedValue(null);
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
  let finish!: (value: typeof summary) => void;
  vi.mocked(fetchBuyerSummary).mockReturnValue(new Promise(resolve => {finish = resolve;}));
  render(<BuyerAtAGlance slug="sales" initialSummary={summary} />);
  await visibility('visible');
  const signal = vi.mocked(fetchBuyerSummary).mock.calls[0][1];
  await act(async () => {await vi.advanceTimersByTimeAsync(5_000);});
  expect(signal?.aborted).toBe(true);
  expect(screen.queryByRole('region', {name: 'At a glance'})).toBeNull();
  await act(async () => {finish(summary);});
  expect(screen.queryByRole('region', {name: 'At a glance'})).toBeNull();
});
it('fails closed on refresh errors and can recover on the next return', async () => {
  vi.mocked(fetchBuyerSummary).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(summary);
  render(<BuyerAtAGlance slug="sales" initialSummary={summary} />);
  await visibility('visible');
  expect(screen.queryByRole('region', {name: 'At a glance'})).toBeNull();
  await visibility('hidden'); await visibility('visible');
  expect(screen.getByRole('region', {name: 'At a glance'})).toBeTruthy();
});
it('starts with no markup and shows newly approved metadata on return', async () => {
  vi.mocked(fetchBuyerSummary).mockResolvedValue(summary);
  const view = render(<BuyerAtAGlance slug="sales" />);
  expect(view.container.innerHTML).toBe('');
  await visibility('visible');
  expect(screen.getByRole('region', {name: 'At a glance'})).toBeTruthy();
  expect(view.container.textContent).not.toContain('you');
});
