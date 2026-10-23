// @vitest-environment jsdom
import React, { Suspense } from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/store/auth';
import { useInquiryList } from '@/hooks/useInquiryList';
import DetailPage from '@/app/dashboard/inquiries/[id]/page';
import SellerPage from '@/app/dashboard/seller/inquiries/page';
import type { ConversationDetail, ConversationListItem, User } from '@/types';

const api = vi.hoisted(() => ({ getConversation: vi.fn(), getMyConversations: vi.fn(), replyToConversation: vi.fn(), pollConversation: vi.fn() }));
vi.mock('@/api/conversations', () => api);
vi.mock('@/api/auth', () => ({}));
vi.mock('next/link', () => ({ default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a> }));
function auth(id: string | null, token = `synthetic-${id}`) {
  useAuthStore.setState({ user: id ? { id } as User : null, token: id ? token : null, isAuthenticated: !!id, hydrated: true, isLoading: false });
}
function detail(owner = 'A'): ConversationDetail {
  return { id: 'thread', listing_id: 'listing', listing_title: `Private ${owner}`, buyer_id: owner, seller_id: 'seller', status: 'awaiting_seller', created_at: '2026-10-23T00:00:00Z', last_message_at: '2026-10-23T00:00:00Z', unread_by_buyer: 0, unread_by_seller: 0,
    messages: [{ id: `message-${owner}`, inquiry_id: 'thread', role: 'buyer', content: `Secret ${owner}`, created_at: '2026-10-23T00:00:00Z' }] };
}
function items(owner = 'A', count = 1): ConversationListItem[] {
  return Array.from({ length: count }, (_, i) => ({ id: `thread-${i}`, listing_id: 'listing', last_message_preview: 'Synthetic preview', created_at: detail().created_at, listing_title: `Private ${owner}`, status: 'awaiting_seller', last_message_at: detail().created_at, unread_by_buyer: 0, unread_by_seller: 0 }));
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function settle() { await act(async () => {}); }
async function tick(ms: number) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }
async function mount(surface: 'detail' | 'seller' = 'detail') {
  if (surface === 'seller') {
    const view = render(<SellerPage />); await settle();
    fireEvent.click(screen.getByRole('button', { name: /Private A/ })); await settle(); return view;
  }
  const params = Promise.resolve({ id: 'thread' });
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(<Suspense fallback="Suspended"><DetailPage params={params} /></Suspense>); });
  return view;
}
function draft(value = 'Old draft') { fireEvent.change(screen.getByRole('textbox'), { target: { value } }); }
function send() { fireEvent.click(screen.getByRole('button', { name: 'Reply' })); }
beforeEach(() => {
  vi.useFakeTimers(); vi.resetAllMocks(); auth('A');
  Element.prototype.scrollIntoView = vi.fn();
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  vi.stubGlobal('fetch', () => { throw new Error('Network forbidden'); });
  vi.stubGlobal('XMLHttpRequest', class { constructor() { throw new Error('Network forbidden'); } });
  api.getConversation.mockResolvedValue(detail()); api.getMyConversations.mockResolvedValue(items());
  api.pollConversation.mockResolvedValue({ new_messages: [], inquiry_status: 'awaiting_seller', has_more: false });
  api.replyToConversation.mockResolvedValue({ success: true, message_id: 'ack' });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe.each(['detail', 'seller'] as const)('%s private account visit', (surface) => {
  it.each(['B', null, 'A-B-A'] as const)('retires settled context and draft across %s', async (next) => {
    await mount(surface); draft();
    api.getConversation.mockReturnValue(new Promise(() => {}));
    api.getMyConversations.mockReturnValue(new Promise(() => {}));
    act(() => { auth(next === 'A-B-A' ? 'B' : next); if (next === 'A-B-A') auth('A'); });
    expect(screen.queryByText('Secret A')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    const reads = api.getConversation.mock.calls.length;
    await tick(20000);
    expect(api.getConversation).toHaveBeenCalledTimes(reads);
  });
  it('rejects the old rendered action in the same turn and accepts a new action', async () => {
    await mount(surface); draft(); const oldButton = screen.getByRole('button', { name: 'Reply' });
    api.getConversation.mockResolvedValue(detail('B')); api.getMyConversations.mockResolvedValue(items('B'));
    act(() => { auth('B'); fireEvent.click(oldButton); }); await settle();
    expect(api.replyToConversation).not.toHaveBeenCalled();
    if (surface === 'seller') {
      expect(screen.queryByRole('textbox')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: /Private B/ })); await settle();
    }
    draft('New draft'); send(); await settle();
    expect(api.replyToConversation).toHaveBeenCalledExactlyOnceWith(surface === 'seller' ? 'thread-0' : 'thread', 'New draft', surface === 'seller' ? 'seller' : 'buyer');
  });
  it.each(['success', 'error'] as const)('ignores a late reply %s without any new-account refetch or busy-state mutation', async (outcome) => {
    await mount(surface); draft();
    const pending = deferred<{ success: boolean; message_id: string }>();
    api.replyToConversation.mockReturnValueOnce(pending.promise); send();
    api.getConversation.mockResolvedValue(detail('B')); api.getMyConversations.mockResolvedValue(items('B'));
    act(() => auth('B')); await settle();
    if (surface === 'seller') { fireEvent.click(screen.getByRole('button', { name: /Private B/ })); await settle(); }
    draft('Current pending draft');
    const current = deferred<{ success: boolean; message_id: string }>();
    api.replyToConversation.mockReturnValueOnce(current.promise); send();
    const reads = api.getConversation.mock.calls.length; const lists = api.getMyConversations.mock.calls.length;
    await act(async () => { if (outcome === 'success') pending.resolve({ success: true, message_id: 'old-ack' }); else pending.reject(new Error('old error')); });
    expect(api.getConversation).toHaveBeenCalledTimes(reads); expect(api.getMyConversations).toHaveBeenCalledTimes(lists);
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('Current pending draft');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Sending...' }).disabled).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('keeps a legitimate pending reply through same-account token refresh and recovers an accepted read failure with GET only', async () => {
    await mount(surface); draft(); const pending = deferred<{ success: boolean; message_id: string }>();
    api.replyToConversation.mockReturnValueOnce(pending.promise); send();
    act(() => auth('A', 'rotated-synthetic')); await settle();
    expect(screen.getByText('Secret A')).toBeTruthy();
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('Old draft');
    expect(api.getConversation).toHaveBeenCalledTimes(1);
    api.getConversation.mockRejectedValueOnce(new Error('read failed'));
    await act(async () => pending.resolve({ success: true, message_id: 'ack' }));
    expect(screen.getByText(/Reply accepted/)).toBeTruthy(); expect(screen.getByRole('alert')).toBeTruthy();
    api.getConversation.mockResolvedValue({ ...detail(), messages: [...detail().messages, { ...detail().messages[0], id: 'ack', content: 'Server masked reply' }] });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh conversation' })); await settle();
    expect(screen.getByText('Server masked reply')).toBeTruthy(); expect(screen.queryByText(/Reply accepted/)).toBeNull();
    expect(api.replyToConversation).toHaveBeenCalledTimes(1);
  });
  it.each(['success', 'error'] as const)('ignores stale initial detail %s while the new account read is pending', async (outcome) => {
    const pending = deferred<ConversationDetail>(); api.getConversation.mockReturnValueOnce(pending.promise);
    await mount(surface);
    api.getConversation.mockReturnValue(new Promise(() => {})); api.getMyConversations.mockResolvedValue(items('B'));
    act(() => auth('B')); await settle();
    if (surface === 'seller') { fireEvent.click(screen.getByRole('button', { name: /Private B/ })); await settle(); }
    await act(async () => { if (outcome === 'success') pending.resolve(detail()); else pending.reject(new Error('old read')); });
    expect(screen.queryByText('Secret A')).toBeNull(); expect(screen.queryByRole('textbox')).toBeNull(); expect(screen.queryByRole('alert')).toBeNull();
  });
  it.each(['success', 'error'] as const)('ignores a stale post-ack refresh %s and its finally callback', async (outcome) => {
    await mount(surface); draft();
    const pending = deferred<ConversationDetail>(); api.getConversation.mockReturnValueOnce(pending.promise);
    send(); await settle(); expect(screen.getByText(/Reply accepted/)).toBeTruthy();
    api.getConversation.mockResolvedValue(detail('B')); api.getMyConversations.mockResolvedValue(items('B'));
    act(() => auth('B')); await settle();
    if (surface === 'seller') { fireEvent.click(screen.getByRole('button', { name: /Private B/ })); await settle(); }
    draft('New unsent draft'); const reads = api.getConversation.mock.calls.length;
    await act(async () => { if (outcome === 'success') pending.resolve(detail()); else pending.reject(new Error('old refresh')); });
    expect(screen.queryByText('Secret A')).toBeNull(); expect(screen.queryByRole('alert')).toBeNull();
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('New unsent draft');
    expect(api.getConversation).toHaveBeenCalledTimes(reads);
  });
  it.each(['logout', 'A-B-A'] as const)('retires pending replies across %s before commit', async (transition) => {
    await mount(surface); draft(); const button = screen.getByRole('button', { name: 'Reply' });
    const pending = deferred<{ success: boolean; message_id: string }>(); api.replyToConversation.mockReturnValueOnce(pending.promise);
    send(); api.getConversation.mockReturnValue(new Promise(() => {})); api.getMyConversations.mockReturnValue(new Promise(() => {}));
    act(() => { auth(transition === 'logout' ? null : 'B'); if (transition === 'A-B-A') auth('A'); fireEvent.click(button); }); await settle();
    const reads = api.getConversation.mock.calls.length;
    await act(async () => pending.resolve({ success: true, message_id: 'obsolete' }));
    expect(api.getConversation).toHaveBeenCalledTimes(reads); expect(api.replyToConversation).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Reply accepted/)).toBeNull(); expect(screen.queryByRole('textbox')).toBeNull();
  });
  it('ignores an old poll and starts the new account cursor from its own detail', async () => {
    await mount(surface); const pending = deferred<unknown>(); api.pollConversation.mockReturnValueOnce(pending.promise);
    await tick(1000);
    api.getConversation.mockResolvedValue({ ...detail('B'), messages: [{ ...detail('B').messages[0], created_at: '2026-10-22T00:00:00Z' }] });
    api.getMyConversations.mockResolvedValue(items('B')); act(() => auth('B')); await settle();
    if (surface === 'seller') { fireEvent.click(screen.getByRole('button', { name: /Private B/ })); await settle(); }
    await act(async () => pending.resolve({ new_messages: [{ ...detail().messages[0], content: 'Late poll secret', created_at: '2026-10-24T00:00:00Z' }], inquiry_status: 'closed', has_more: true }));
    expect(screen.queryByText('Late poll secret')).toBeNull();
    await tick(1000);
    expect(api.pollConversation).toHaveBeenLastCalledWith(surface === 'seller' ? 'thread-0' : 'thread', '2026-10-22T00:00:00Z');
  });
});

describe('actual list account visits', () => {
  it.each(['success', 'error'] as const)('retires old page/refetch actions, page state and late %s across A-B-A', async (outcome) => {
    api.getMyConversations.mockResolvedValue(items('A', 20));
    const view = renderHook(() => useInquiryList('buyer')); await settle();
    act(() => view.result.current.changePage(2)); await settle();
    const old = view.result.current; const pending = deferred<ConversationListItem[]>();
    api.getMyConversations.mockReturnValueOnce(pending.promise); act(() => { void old.refetch(); });
    api.getMyConversations.mockReturnValue(new Promise(() => {}));
    act(() => { auth('B'); auth('A'); void old.refetch(); old.changePage(9); }); await settle();
    expect(view.result.current.page).toBe(1); expect(view.result.current.inquiries).toEqual([]); expect(view.result.current.loading).toBe(true);
    expect(api.getMyConversations).toHaveBeenLastCalledWith('buyer', 1, 20);
    const reads = api.getMyConversations.mock.calls.length;
    await act(async () => { if (outcome === 'success') pending.resolve(items()); else pending.reject(new Error('old list')); });
    expect(view.result.current.inquiries).toEqual([]); expect(view.result.current.loading).toBe(true); expect(view.result.current.error).toBe('');
    expect(api.getMyConversations).toHaveBeenCalledTimes(reads);
  });
  it('does not fetch without an identity or after logout, and resumes on login', async () => {
    auth(null); const view = renderHook(() => useInquiryList('buyer')); await settle(); await tick(20000);
    expect(api.getMyConversations).not.toHaveBeenCalled();
    act(() => auth('A')); await settle(); expect(view.result.current.inquiries).toHaveLength(1);
    const old = view.result.current; act(() => auth(null)); await settle();
    await old.refetch(); act(() => old.changePage(2)); await tick(20000);
    expect(view.result.current.inquiries).toEqual([]); expect(api.getMyConversations).toHaveBeenCalledTimes(1);
  });
  it('retains current paging and pending reads through token rotation; current retry, role and visibility still work', async () => {
    api.getMyConversations.mockResolvedValue(items('A', 20));
    const view = renderHook(({ role }: { role: 'buyer' | 'seller' }) => useInquiryList(role), { initialProps: { role: 'buyer' } }); await settle();
    act(() => view.result.current.changePage(2)); await settle();
    const pending = deferred<ConversationListItem[]>(); api.getMyConversations.mockReturnValueOnce(pending.promise);
    act(() => { void view.result.current.refetch(); auth('A', 'rotated'); }); await settle();
    expect(view.result.current.page).toBe(2); expect(view.result.current.inquiries).toHaveLength(20);
    await act(async () => pending.reject(new Error('current failure'))); expect(view.result.current.error).toContain('Failed to load');
    await act(async () => { await view.result.current.refetch(); }); expect(view.result.current.error).toBe('');
    view.rerender({ role: 'seller' }); await settle(); expect(api.getMyConversations).toHaveBeenLastCalledWith('seller', 2, 20);
    api.getMyConversations.mockClear(); Object.defineProperty(document, 'hidden', { configurable: true, value: true }); await tick(10000);
    expect(api.getMyConversations).not.toHaveBeenCalled();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false }); fireEvent(document, new Event('visibilitychange')); await settle();
    expect(api.getMyConversations).toHaveBeenCalledExactlyOnceWith('seller', 2, 20);
    const old = view.result.current; view.unmount(); await old.refetch(); act(() => old.changePage(3)); await tick(20000);
    expect(api.getMyConversations).toHaveBeenCalledTimes(1);
  });
});

it('does not mount or fetch private detail without authenticated identity', async () => {
  auth(null); await mount(); await tick(10000);
  expect(api.getConversation).not.toHaveBeenCalled(); expect(api.pollConversation).not.toHaveBeenCalled();
  expect(screen.queryByRole('textbox')).toBeNull();
});
