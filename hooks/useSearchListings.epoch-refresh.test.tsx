// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, notifyManager } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSearchListings } from './useSearchListings';

const api = vi.hoisted(() => ({ listListings: vi.fn(), searchListings: vi.fn() }));
vi.mock('@/api/listings', () => api);

const minute = 60_000;
const page = (offset = 0) => Array.from({ length: 12 }, (_, i) => ({
  id: `listing-${offset + i}`, slug: `listing-${offset + i}`, status: 'published',
}));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
let client: QueryClient;
let visibility: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'performance', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(10_000_000);
  notifyManager.setScheduler(queueMicrotask);
  client = new QueryClient({ defaultOptions: { queries: { staleTime: minute, retry: 1 } } });
  visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});
afterEach(() => {
  cleanup();
  client.clear();
  notifyManager.setScheduler(callback => setTimeout(callback, 0));
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.resetAllMocks();
});
function changeVisibility(state: 'hidden' | 'visible') {
  visibility.mockReturnValue(state);
  document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
}
function renderSearch(q: string) {
  return renderHook(() => useSearchListings({ q }), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

it.each([
  { q: '', background: false }, { q: 'licence', background: false },
  { q: '', background: true }, { q: 'licence', background: true },
])('refreshes all pages for $q, background=$background (B, B2, G, C, F)', async ({ q, background }) => {
  const route = q ? api.searchListings : api.listListings;
  const response = (offset = 0) => q ? { results: page(offset), total: 36 } : page(offset);
  // B/B2: first load starts in either the foreground or a background tab.
  act(() => changeVisibility(background ? 'hidden' : 'visible'));
  const initial = deferred<ReturnType<typeof response>>();
  const freshInitial = deferred<ReturnType<typeof response>>();
  route.mockReturnValueOnce(initial.promise).mockReturnValueOnce(freshInitial.promise);
  const hook = renderSearch(q);
  await waitFor(() => expect(route).toHaveBeenCalledTimes(1));
  await act(async () => { changeVisibility('hidden'); changeVisibility('visible'); });
  await waitFor(() => expect(route).toHaveBeenCalledTimes(2));
  await act(async () => initial.resolve(response()));
  expect(hook.result.current.items).toEqual([]);
  await act(async () => freshInitial.resolve(response()));
  await waitFor(() => expect(hook.result.current.items).toHaveLength(12));

  // B: a subsequent first-page request is pending on an ordinary tab return.
  const oldRefresh = deferred<ReturnType<typeof response>>();
  const freshRefresh = deferred<ReturnType<typeof response>>();
  route.mockReturnValueOnce(oldRefresh.promise).mockReturnValueOnce(freshRefresh.promise);
  act(() => { void hook.result.current.refetch(); });
  await waitFor(() => expect(route).toHaveBeenCalledTimes(3));
  await act(async () => { changeVisibility('hidden'); changeVisibility('visible'); });
  await waitFor(() => expect(route).toHaveBeenCalledTimes(4));
  expect(hook.result.current.items).toEqual([]);
  expect(hook.result.current.isLoading).toBe(true);
  expect(hook.result.current.isError).toBe(false);
  expect(hook.result.current.error).toBeNull();
  await act(async () => { oldRefresh.resolve(response()); freshRefresh.resolve(response()); });
  await waitFor(() => expect(hook.result.current.items).toHaveLength(12));

  // Load two pages, then G: interrupt a third page. Both retained pages must refresh.
  route.mockResolvedValueOnce(response(12));
  await act(async () => { await hook.result.current.fetchNextPage(); });
  expect(hook.result.current.items).toHaveLength(24);
  const oldMore = deferred<ReturnType<typeof response>>();
  const refreshedFirst = deferred<ReturnType<typeof response>>();
  const refreshedSecond = deferred<ReturnType<typeof response>>();
  route.mockReturnValueOnce(oldMore.promise)
    .mockReturnValueOnce(refreshedFirst.promise).mockReturnValueOnce(refreshedSecond.promise);
  act(() => { void hook.result.current.fetchNextPage(); });
  await waitFor(() => expect(route).toHaveBeenCalledTimes(6));
  await act(async () => { changeVisibility('hidden'); changeVisibility('visible'); });
  await waitFor(() => expect(route).toHaveBeenCalledTimes(7));
  await act(async () => { oldMore.resolve(response(24)); refreshedFirst.resolve(response()); });
  await waitFor(() => expect(route).toHaveBeenCalledTimes(8));
  expect(hook.result.current.items).toEqual([]);
  await act(async () => refreshedSecond.resolve(response(12)));
  await waitFor(() => expect(hook.result.current.items).toHaveLength(24));
  expect(hook.result.current.data?.pageParams).toEqual([0, 12]);

  // C: spec order. Adjacent bumps produce one effective full refetch.
  const restored = deferred<ReturnType<typeof response>>();
  route.mockReturnValueOnce(restored.promise).mockResolvedValueOnce(response(12));
  await act(async () => {
    changeVisibility('hidden');
    changeVisibility('visible');
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
  await waitFor(() => expect(route).toHaveBeenCalledTimes(9));
  expect(hook.result.current.items).toEqual([]);
  expect(hook.result.current.isLoading).toBe(true);
  expect(hook.result.current.isError).toBe(false);
  await act(async () => restored.resolve(response()));
  await waitFor(() => expect(hook.result.current.items).toHaveLength(24));
  expect(route).toHaveBeenCalledTimes(10);

  // F: performance pauses during foreground sleep, with no browser restore event.
  const afterSleep = deferred<ReturnType<typeof response>>();
  route.mockReturnValueOnce(afterSleep.promise).mockResolvedValueOnce(response(12));
  vi.setSystemTime(Date.now() + 2 * minute);
  await act(async () => vi.advanceTimersByTime(minute));
  await waitFor(() => expect(route).toHaveBeenCalledTimes(11));
  expect(hook.result.current.items).toEqual([]);
  expect(hook.result.current.isLoading).toBe(true);
  expect(hook.result.current.isError).toBe(false);
  await act(async () => afterSleep.resolve(response()));
  await waitFor(() => expect(hook.result.current.items).toHaveLength(24));
  expect(hook.result.current.isError).toBe(false);
});

it('shows the error after the epoch refresh and its production retry fail', async () => {
  vi.useRealTimers();
  api.listListings.mockResolvedValue(page());
  const hook = renderSearch('');
  await waitFor(() => expect(hook.result.current.items).toHaveLength(12));
  api.listListings.mockRejectedValue(new Error('Refresh failed'));
  await act(async () => { changeVisibility('hidden'); changeVisibility('visible'); });
  await waitFor(() => expect(hook.result.current.isFetching).toBe(false), { timeout: 3000 });
  expect(api.listListings).toHaveBeenCalledTimes(3);
  expect(hook.result.current.items).toEqual([]);
  expect(hook.result.current.isLoading).toBe(false);
  expect(hook.result.current.isError).toBe(true);
  expect(hook.result.current.error?.message).toBe('Refresh to load current marketplace results.');
});

// Some event loops can drain microtasks between the two restoration events.
it.each(['', 'licence'])('supersedes an already-started focus refresh on persisted pageshow for %j', async q => {
  vi.useRealTimers();
  const route = q ? api.searchListings : api.listListings;
  const response = q ? { results: page(), total: 12 } : page();
  route.mockResolvedValueOnce(response);
  const hook = renderSearch(q);
  await waitFor(() => expect(hook.result.current.items).toHaveLength(12));
  const focusResponse = deferred<typeof response>();
  const restoredResponse = deferred<typeof response>();
  route.mockReturnValueOnce(focusResponse.promise).mockReturnValueOnce(restoredResponse.promise);
  await act(async () => { changeVisibility('hidden'); changeVisibility('visible'); });
  await waitFor(() => expect(route).toHaveBeenCalledTimes(2));
  await act(async () => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await waitFor(() => expect(route).toHaveBeenCalledTimes(3));
  await act(async () => focusResponse.resolve(response));
  expect(hook.result.current.items).toEqual([]);
  expect(hook.result.current.isLoading).toBe(true);
  expect(hook.result.current.isError).toBe(false);
  await act(async () => restoredResponse.resolve(response));
  await waitFor(() => expect(hook.result.current.items).toHaveLength(12));
});
