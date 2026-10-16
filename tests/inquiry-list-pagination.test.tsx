// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Buyer from '@/app/dashboard/inquiries/page';
import Seller from '@/app/dashboard/seller/inquiries/page';
import { useInquiryList } from '@/hooks/useInquiryList';
import { getMyConversations } from '@/api/conversations';
import type { ConversationListItem } from '@/types';

const client = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/api/client', () => ({ api: client }));
vi.mock('next/link', () => ({ default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a> }));
const items = Array.from({ length: 21 }, (_, i) => ({
  id: `synthetic-${i + 1}`, listing_title: `Synthetic inquiry ${i + 1}`,
  status: 'awaiting_seller', unread_by_buyer: 1, unread_by_seller: 1,
  last_message_preview: 'Synthetic question', last_message_at: '2026-10-16T12:00:00Z',
})) as ConversationListItem[];
function backend(records = items) {
  client.get.mockImplementation(async (path: string, options: { params: { page: number; per_page: number } }) => {
    if (path !== '/conversations/mine') throw new Error('Unexpected detail/read-mark request');
    const { page, per_page } = options.params;
    return { data: records.slice((page - 1) * per_page, page * per_page) };
  });
}
function deferred() {
  let resolve!: (value: { data: ConversationListItem[] }) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<{ data: ConversationListItem[] }>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function settle() { await act(async () => {}); }
async function tick(ms = 10000) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }
function next() { fireEvent.click(screen.getByRole('button', { name: 'Next' })); }
function previous() { fireEvent.click(screen.getByRole('button', { name: 'Previous' })); }
function onlyListReads() {
  expect(client.get.mock.calls.every(([path]) => path === '/conversations/mine')).toBe(true);
  expect(client.post).not.toHaveBeenCalled();
}
beforeEach(() => {
  vi.useFakeTimers(); vi.resetAllMocks(); backend();
  Element.prototype.scrollIntoView = vi.fn();
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  vi.stubGlobal('fetch', () => { throw new Error('Network forbidden'); });
  vi.stubGlobal('XMLHttpRequest', class { constructor() { throw new Error('Network forbidden'); } });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe.each([['buyer', Buyer], ['seller', Seller]] as const)('%s mounted list', (role, Page) => {
  it('reaches synthetic record 21 and returns without detail, send or read marking', async () => {
    render(<Page />); await settle();
    expect(screen.getAllByText(items[0].listing_title).length).toBeGreaterThan(0);
    expect(screen.queryByText(items[20].listing_title)).toBeNull();
    expect((screen.getByRole('button', { name: 'Previous' }) as HTMLButtonElement).disabled).toBe(true);
    next(); await settle();
    expect(screen.getAllByText(items[20].listing_title).length).toBeGreaterThan(0);
    expect(screen.queryByText(items[0].listing_title)).toBeNull();
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true);
    expect(client.get).toHaveBeenLastCalledWith('/conversations/mine', { params: { role, page: 2, per_page: 20 } });
    previous(); await settle();
    expect(screen.getAllByText(items[0].listing_title).length).toBeGreaterThan(0);
    expect(client.get).toHaveBeenCalledTimes(3); onlyListReads();
  });
  it('keeps exact-multiple empty-page back navigation truthful', async () => {
    backend(items.slice(0, 20)); render(<Page />); await settle(); next(); await settle();
    expect(screen.getByText(/No inquiries on this page/)).toBeTruthy();
    expect(screen.queryByText('No inquiries yet')).toBeNull();
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true);
    previous(); await settle(); expect(screen.getAllByText(items[0].listing_title).length).toBeGreaterThan(0);
    onlyListReads();
  });
  it('offers read retry on initial and page errors, preserves back controls and stale data on poll errors', async () => {
    client.get.mockRejectedValueOnce(new Error('offline')); render(<Page />); await settle();
    expect(screen.getByRole('alert').textContent).toContain('Failed to load');
    fireEvent.click(screen.getByRole('button', { name: 'Retry inquiries' })); await settle();
    client.get.mockRejectedValueOnce(new Error('page offline')); next(); await settle();
    expect(screen.queryByText(items[0].listing_title)).toBeNull();
    expect(screen.getByText('Page 2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry inquiries' })); await settle();
    expect(screen.getAllByText(items[20].listing_title).length).toBeGreaterThan(0);
    client.get.mockRejectedValueOnce(new Error('poll offline')); await tick();
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getAllByText(items[20].listing_title).length).toBeGreaterThan(0);
    await tick(); expect(screen.queryByRole('alert')).toBeNull();
    previous(); await settle(); onlyListReads();
  });
  it('polls only the selected page every ten seconds and on becoming visible, then stops on unmount', async () => {
    const view = render(<Page />); await settle(); next(); await settle(); client.get.mockClear();
    await tick(9999); expect(client.get).not.toHaveBeenCalled();
    await tick(1); expect(client.get).toHaveBeenCalledOnce();
    expect(client.get).toHaveBeenLastCalledWith('/conversations/mine', { params: { role, page: 2, per_page: 20 } });
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    await tick(20000); fireEvent(document, new Event('visibilitychange')); await settle();
    expect(client.get).toHaveBeenCalledOnce();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    fireEvent(document, new Event('visibilitychange')); await settle(); expect(client.get).toHaveBeenCalledTimes(2);
    view.unmount(); await tick(20000); fireEvent(document, new Event('visibilitychange'));
    expect(client.get).toHaveBeenCalledTimes(2); onlyListReads();
  });
  it('ignores late success and failure from page one after navigation', async () => {
    render(<Page />); await settle();
    const old = deferred(); client.get.mockReturnValueOnce(old.promise); await tick();
    next(); await settle(); old.resolve({ data: items.slice(0, 20) }); await settle();
    expect(screen.queryByText(items[0].listing_title)).toBeNull();
    const oldError = deferred(); client.get.mockReturnValueOnce(oldError.promise); await tick();
    previous(); await settle(); oldError.reject(new Error('late error')); await settle();
    expect(screen.queryByRole('alert')).toBeNull(); expect(screen.getByText('Page 1')).toBeTruthy();
  });
  it('keeps Previous available during a page read and ignores its late result after returning', async () => {
    render(<Page />); await settle();
    const pending = deferred(); client.get.mockReturnValueOnce(pending.promise);
    next(); await settle(); expect(screen.getByRole('status').textContent).toContain('Loading inquiries');
    previous(); await settle(); pending.resolve({ data: [items[20]] }); await settle();
    expect(screen.getByText('Page 1')).toBeTruthy();
    expect(screen.queryByText(items[20].listing_title)).toBeNull(); onlyListReads();
  });
  it('keeps initial empty account messaging', async () => {
    backend([]); render(<Page />); await settle(); expect(screen.getByText('No inquiries yet')).toBeTruthy();
  });
});

it('orders overlapping same-page reads and ignores old role and unmounted generations', async () => {
  const { result, rerender, unmount } = renderHook(({ role }: { role: 'buyer' | 'seller' }) => useInquiryList(role), { initialProps: { role: 'buyer' } });
  await settle();
  const older = deferred(); const newer = deferred();
  client.get.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
  act(() => { void result.current.refetch(); void result.current.refetch(); });
  newer.resolve({ data: [items[20]] }); await settle(); older.resolve({ data: [items[0]] }); await settle();
  expect(result.current.inquiries).toEqual([items[20]]);
  const oldFailure = deferred(); client.get.mockReturnValueOnce(oldFailure.promise);
  act(() => { void result.current.refetch(); void result.current.refetch(); }); await settle();
  oldFailure.reject(new Error('older request failed')); await settle();
  expect(result.current.error).toBe('');
  expect(result.current.inquiries).toEqual(items.slice(0, 20));
  const obsolete = deferred(); client.get.mockReturnValueOnce(obsolete.promise);
  act(() => { void result.current.refetch(); }); rerender({ role: 'seller' }); await settle();
  obsolete.reject(new Error('old role failed')); await settle(); expect(result.current.error).toBe('');
  expect(result.current.inquiries).toEqual(items.slice(0, 20));
  const last = deferred(); client.get.mockReturnValueOnce(last.promise); act(() => { void result.current.refetch(); });
  unmount(); const snapshot = result.current; const reads = client.get.mock.calls.length;
  last.resolve({ data: [] }); await settle(); await result.current.refetch();
  expect(result.current).toBe(snapshot); await tick(); expect(client.get).toHaveBeenCalledTimes(reads);
});

it('collapses a seller thread across page navigation and never reopens it on return', async () => {
  render(<Seller />); await settle();
  // This explicit action alone is allowed to request the thread.
  client.get.mockResolvedValueOnce({ data: { ...items[0], messages: [] } });
  fireEvent.click(screen.getByText(items[0].listing_title).closest('button')!); await settle();
  expect(screen.getByRole('textbox')).toBeTruthy();
  client.get.mockClear(); next(); await settle(); previous(); await settle();
  expect(screen.queryByRole('textbox')).toBeNull(); onlyListReads();
});

it('defaults and bounds API pagination while retaining role-only callers', async () => {
  await getMyConversations('buyer');
  expect(client.get).toHaveBeenLastCalledWith('/conversations/mine', { params: { role: 'buyer', page: 1, per_page: 20 } });
  await getMyConversations('seller', -1, 200);
  expect(client.get).toHaveBeenLastCalledWith('/conversations/mine', { params: { role: 'seller', page: 1, per_page: 100 } });
  await getMyConversations('buyer', NaN, Infinity);
  expect(client.get).toHaveBeenLastCalledWith('/conversations/mine', { params: { role: 'buyer', page: 1, per_page: 20 } });
});
