// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, notifyManager } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSearchListings } from './useSearchListings';

const api = vi.hoisted(() => ({ listListings: vi.fn(), searchListings: vi.fn() }));
vi.mock('@/api/listings', () => api);

const minute = 60_000;
const listing = { id: 'retained', slug: 'retained', status: 'published' };
let client: QueryClient;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'performance', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(10_000_000);
  notifyManager.setScheduler(queueMicrotask);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  api.listListings.mockResolvedValue([listing]);
  api.searchListings.mockResolvedValue({ results: [listing], total: 1 });
});

afterEach(() => {
  cleanup();
  client.clear();
  notifyManager.setScheduler(callback => setTimeout(callback, 0));
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.resetAllMocks();
});

async function mount(q = '') {
  let hook!: ReturnType<typeof renderSearch>;
  await act(async () => { hook = renderSearch(q); });
  return hook;
}

function renderSearch(q: string) {
  return renderHook(() => useSearchListings({ q }), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

function restore() {
  act(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
}

async function failRefresh(hook: Awaited<ReturnType<typeof mount>>) {
  api.listListings.mockRejectedValue(new Error('Refresh failed'));
  api.searchListings.mockRejectedValue(new Error('Refresh failed'));
  await act(async () => { await hook.result.current.refetch(); });
}

async function succeedRefresh(hook: Awaited<ReturnType<typeof mount>>) {
  api.listListings.mockResolvedValue([listing]);
  api.searchListings.mockResolvedValue({ results: [listing], total: 1 });
  await act(async () => { await hook.result.current.refetch(); });
  await waitFor(() => expect(hook.result.current.items).toHaveLength(1));
  expect(hook.result.current.isError).toBe(false);
}

it.each(['', 'licence'])('keeps %j restoration invalidation across failed refresh and remount', async q => {
  const first = await mount(q);
  await waitFor(() => expect(first.result.current.items).toHaveLength(1));
  act(() => vi.advanceTimersByTime(minute));
  vi.setSystemTime(Date.now() - 60 * minute + 16 * minute);
  restore();
  expect(first.result.current.items).toEqual([]);
  await failRefresh(first);
  first.unmount();

  const remounted = await mount(q);
  expect(remounted.result.current.items).toEqual([]);
  await waitFor(() => expect(remounted.result.current.isFetching).toBe(false));
  expect(remounted.result.current.items).toEqual([]);
  await succeedRefresh(remounted);

  // The next restoration must suppress even the successfully refreshed page.
  restore();
  expect(remounted.result.current.items).toEqual([]);
  await failRefresh(remounted);
  remounted.unmount();
  const restoredAgain = await mount(q);
  expect(restoredAgain.result.current.items).toEqual([]);
  await waitFor(() => expect(restoredAgain.result.current.isFetching).toBe(false));
  await succeedRefresh(restoredAgain);
});

it.each(['visibilitychange', 'tick'])('invalidates foreground sleep without pageshow on %s', async event => {
  const hook = await mount();
  await waitFor(() => expect(hook.result.current.items).toHaveLength(1));
  act(() => vi.advanceTimersByTime(minute));
  // Clock rollback followed by sleep: wall age is negative and performance paused.
  vi.setSystemTime(Date.now() - 60 * minute + 16 * minute);
  expect(hook.result.current.items).toHaveLength(1);
  act(() => {
    if (event === 'visibilitychange') {
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
      document.dispatchEvent(new Event('visibilitychange'));
    } else {
      vi.advanceTimersByTime(minute);
    }
  });
  expect(hook.result.current.items).toEqual([]);
  await failRefresh(hook);
  expect(hook.result.current.items).toEqual([]);
  hook.unmount();
  const remounted = await mount();
  expect(remounted.result.current.items).toEqual([]);
  await waitFor(() => expect(remounted.result.current.isFetching).toBe(false));
  await succeedRefresh(remounted);
});

it('shares restoration invalidation with another observer and a cached query key', async () => {
  const browse = await mount();
  const semantic = await mount('licence');
  await waitFor(() => expect(browse.result.current.items).toHaveLength(1));
  await waitFor(() => expect(semantic.result.current.items).toHaveLength(1));
  semantic.unmount();
  restore();
  expect(browse.result.current.items).toEqual([]);
  api.searchListings.mockRejectedValue(new Error('Refresh failed'));
  const remounted = await mount('licence');
  expect(remounted.result.current.items).toEqual([]);
  await waitFor(() => expect(remounted.result.current.isFetching).toBe(false));
  await succeedRefresh(remounted);
  expect(browse.result.current.items).toEqual([]);
});
