// @vitest-environment jsdom
import {act, cleanup, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {fetchBuyerSummary} from '@/lib/api';
import {summary} from '@/tests/summaryFixture';
import BuyerAtAGlance from './BuyerAtAGlance';
vi.mock('@/lib/api', () => ({fetchBuyerSummary: vi.fn()}));
beforeEach(() => {vi.useFakeTimers(); vi.resetAllMocks(); Object.defineProperty(document, 'visibilityState', {configurable: true, value: 'visible'});});
afterEach(() => {cleanup(); vi.useRealTimers();});
it('removes withdrawn summary on the next 10-second refresh', async () => {
  vi.mocked(fetchBuyerSummary).mockResolvedValueOnce(summary).mockResolvedValue(null);
  await act(async () => {render(<BuyerAtAGlance slug="sales" initialSummary={summary} checkedAt={Date.now()} />);});
  expect(screen.getByRole('region', {name: 'At a glance'})).toBeTruthy();
  await act(async () => {await vi.advanceTimersByTimeAsync(10_000);});
  expect(screen.queryByRole('region', {name: 'At a glance'})).toBeNull();
});
it('expires even when the network never returns and ignores a late response', async () => {
  let finish!: (value: typeof summary) => void;
  vi.mocked(fetchBuyerSummary).mockReturnValue(new Promise(resolve => {finish = resolve;}));
  render(<BuyerAtAGlance slug="sales" initialSummary={summary} checkedAt={Date.now()} />);
  await act(async () => {await vi.advanceTimersByTimeAsync(20_000);});
  expect(screen.queryByRole('region', {name: 'At a glance'})).toBeNull();
  await act(async () => {finish(summary);});
  expect(screen.queryByRole('region', {name: 'At a glance'})).toBeNull();
});
it('hides on failure, clears on suspension and fetches again on resume', async () => {
  vi.mocked(fetchBuyerSummary).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(summary);
  await act(async () => {render(<BuyerAtAGlance slug="sales" initialSummary={summary} checkedAt={Date.now()} />);});
  expect(screen.queryByRole('region', {name: 'At a glance'})).toBeNull();
  await act(async () => {
    Object.defineProperty(document, 'visibilityState', {configurable: true, value: 'hidden'});
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(40_000);
  });
  expect(fetchBuyerSummary).toHaveBeenCalledTimes(1);
  await act(async () => {
    Object.defineProperty(document, 'visibilityState', {configurable: true, value: 'visible'});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(fetchBuyerSummary).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('region', {name: 'At a glance'})).toBeTruthy();
});
it('starts with no markup when absent and can show a newly approved summary', async () => {
  vi.mocked(fetchBuyerSummary).mockResolvedValueOnce(null).mockResolvedValue(summary);
  const view = render(<BuyerAtAGlance slug="sales" checkedAt={Date.now()} />);
  expect(view.container.innerHTML).toBe('');
  await act(async () => {await vi.advanceTimersByTimeAsync(10_000);});
  expect(screen.getByRole('region', {name: 'At a glance'})).toBeTruthy();
});
