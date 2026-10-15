// @vitest-environment jsdom
import React, { Suspense } from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError } from 'axios';
import { useConversationPoll } from '@/hooks/useConversationPoll';
import { pollConversation, replyToConversation } from '@/api/conversations';
import DetailPage from '@/app/dashboard/inquiries/[id]/page';
import SellerPage from '@/app/dashboard/seller/inquiries/page';
import InquiryWidget from '@/components/InquiryWidget';
import type { ConversationDetail, ConversationMessage } from '@/types';

const client = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), listError: '' }));
vi.mock('@/api/client', () => ({ api: client }));
vi.mock('@/store/auth', () => ({ useAuthStore: () => ({ user: { id: 'viewer' }, isAuthenticated: true }) }));
vi.mock('@/hooks/useInquiryList', () => ({ useInquiryList: () => ({
  inquiries: [
    { id: 'a', listing_title: 'Listing a', status: 'awaiting_seller', last_message_at: '2026-10-15T00:00:00Z', unread_by_seller: 1 },
    { id: 'b', listing_title: 'Listing b', status: 'awaiting_seller', last_message_at: '2026-10-15T00:00:00Z', unread_by_seller: 0 },
  ], loading: false, error: client.listError, refetch: vi.fn(),
}) }));
const first = '2026-10-15T00:00:00Z';
const later = '2026-10-15T00:01:00Z';
function message(id = 'm1', thread = 'a', created_at = first, content = 'Initial server question'): ConversationMessage {
  return { id, inquiry_id: thread, role: 'buyer', content, created_at };
}
function detail(id = 'a', messages = [message()], seller = false): ConversationDetail {
  return { id, listing_id: 'listing', listing_title: `Listing ${id}`, buyer_id: seller ? null : 'viewer', seller_id: seller ? 'viewer' : null,
    status: 'awaiting_seller', last_message_at: first, unread_by_buyer: 0, unread_by_seller: 0, created_at: first, messages };
}
function envelope(messages: ConversationMessage[] = [], status = 'awaiting_buyer', has_more = false) {
  return { data: { new_messages: messages, inquiry_status: status, has_more } };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function tick(ms: number) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }
async function settle() { await act(async () => {}); }
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); client.listError = '';
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('fetch', () => { throw new Error('Network forbidden'); });
  vi.stubGlobal('XMLHttpRequest', class { constructor() { throw new Error('Network forbidden'); } });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('actual API and mounted poll transport', () => {
  it('keeps reply acknowledgement distinct and preserves the poll envelope and encoded routes', async () => {
    const ack = { success: true, message_id: 'm2', filtered: true, mediation_disclosure: 'Mediated' };
    client.post.mockResolvedValue({ data: ack }); client.get.mockResolvedValue(envelope([message()]));
    expect(await replyToConversation('a/b', 'Draft', 'seller')).toEqual(ack);
    expect(client.post).toHaveBeenCalledWith('/conversations/a%2Fb/reply', { content: 'Draft', role: 'seller' });
    expect(await pollConversation('a/b', first)).toEqual(envelope([message()]).data);
    expect(client.get).toHaveBeenCalledWith('/conversations/a%2Fb/poll', { params: { since: first } });
  });
  it.each([false, true])('starts when async detail provides a watermark (id already present: %s), and does not rewind', async (present) => {
    const received = vi.fn();
    client.get.mockResolvedValueOnce(envelope([message('m2', 'a', later)], 'awaiting_buyer', true)).mockResolvedValue(envelope());
    const { rerender } = renderHook(({ id, since }) => useConversationPoll(id, since, received), {
      initialProps: { id: present ? 'a' : null as string | null, since: null as string | null },
    });
    await tick(4000); expect(client.get).not.toHaveBeenCalled();
    rerender({ id: 'a', since: first }); await tick(1000);
    expect(received).toHaveBeenCalledWith([message('m2', 'a', later)], 'awaiting_buyer');
    rerender({ id: 'a', since: first }); await tick(500);
    expect(client.get).toHaveBeenLastCalledWith('/conversations/a/poll', { params: { since: later } });
  });
  it('pauses hidden reads, resumes once, prevents overlapping visibility polls, and cleans up', async () => {
    const pending = deferred<ReturnType<typeof envelope>>();
    client.get.mockReturnValue(pending.promise);
    const { unmount } = renderHook(() => useConversationPoll('a', first, vi.fn()));
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    await tick(4000); expect(client.get).not.toHaveBeenCalled();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    fireEvent(document, new Event('visibilitychange')); await tick(500);
    fireEvent(document, new Event('visibilitychange')); await tick(1000);
    expect(client.get).toHaveBeenCalledOnce();
    unmount(); pending.resolve(envelope()); await settle(); await tick(10000);
    expect(client.get).toHaveBeenCalledOnce();
  });
  it('resets for another thread and ignores a late old poll', async () => {
    const pending = deferred<ReturnType<typeof envelope>>(); const received = vi.fn();
    client.get.mockReturnValueOnce(pending.promise).mockResolvedValue(envelope());
    const { rerender } = renderHook(({ id, since }) => useConversationPoll(id, since, received), { initialProps: { id: 'a', since: later } });
    await tick(1000); rerender({ id: 'b', since: first }); await tick(1000);
    expect(client.get).toHaveBeenLastCalledWith('/conversations/b/poll', { params: { since: first } });
    received.mockClear(); pending.resolve(envelope([message('old')])); await settle();
    expect(received).not.toHaveBeenCalled();
  });
  it('ignores an in-flight poll superseded by a server detail refresh', async () => {
    const pending = deferred<ReturnType<typeof envelope>>(); const received = vi.fn();
    client.get.mockReturnValueOnce(pending.promise).mockResolvedValue(envelope());
    const { result } = renderHook(() => useConversationPoll('a', first, received));
    await tick(1000); act(() => result.current.updateSince(later));
    pending.resolve(envelope([], 'closed')); await settle(); expect(received).not.toHaveBeenCalled();
    await tick(3000); expect(client.get).toHaveBeenLastCalledWith('/conversations/a/poll', { params: { since: later } });
  });
});

async function mountPage(kind: 'detail' | 'seller' | 'widget', response?: Promise<{ data: ConversationDetail }>) {
  client.get.mockImplementation((url: string) => url.endsWith('/poll') ? Promise.resolve(envelope()) : response ?? Promise.resolve({ data: detail('a', [message()], kind === 'seller') }));
  if (kind === 'widget') {
    client.post.mockResolvedValueOnce({ data: detail() });
    const view = render(<InquiryWidget listingId="listing-a" listingSlug="a" listingTitle="Listing a" />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Initial server question' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Question' }));
    await settle();
    client.post.mockClear();
    return view;
  }
  if (kind === 'seller') {
    const view = render(<SellerPage />); fireEvent.click(screen.getByRole('button', { name: /Listing a/ }));
    await settle(); return view;
  }
  const params = Promise.resolve({ id: 'a' });
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(<Suspense fallback="Suspended"><DetailPage params={params} /></Suspense>); });
  await settle(); return view;
}

describe.each(['detail', 'seller', 'widget'] as const)('%s mounted reply form', (kind) => {
  it('starts polls after deferred detail, renders actual messages once, and reflects current status', async () => {
    if (kind === 'widget') {
      await mountPage(kind);
      client.get.mockResolvedValue(envelope([message('m2', 'a', later, 'Actual mediated record')], 'awaiting_buyer'));
      await tick(1000); await tick(3000);
      expect(screen.getAllByText('Actual mediated record')).toHaveLength(1);
      expect(screen.queryByText(/Escalated to seller/)).toBeNull();
      expect(client.get).toHaveBeenLastCalledWith('/conversations/a/poll', { params: { since: later } });
      return;
    }
    const pending = deferred<{ data: ConversationDetail }>();
    await mountPage(kind, pending.promise); await tick(4000); expect(client.get).toHaveBeenCalledTimes(1);
    pending.resolve({ data: detail('a', [message()], kind === 'seller') }); await settle();
    client.get.mockResolvedValue(envelope([message('m2', 'a', later, 'Actual mediated record')], 'awaiting_buyer'));
    await tick(1000); await tick(3000);
    expect(screen.getAllByText('Actual mediated record')).toHaveLength(1);
    if (kind === 'detail') expect(screen.queryByText(/Escalated to seller/)).toBeNull();
    else expect(screen.getByText('Awaiting buyer')).toBeTruthy();
  });
  it('guards repeated Enter/click and displays only refreshed server content, deduplicating polling overlap', async () => {
    await mountPage(kind);
    const pending = deferred<{ data: unknown }>(); client.post.mockReturnValue(pending.promise);
    const input = screen.getByRole('textbox'); fireEvent.change(input, { target: { value: 'Raw submitted draft' } });
    fireEvent.keyDown(input, { key: 'Enter' }); fireEvent.keyDown(input, { key: 'Enter' }); fireEvent.click(screen.getByRole('button', { name: 'Sending...' }));
    expect(client.post).toHaveBeenCalledTimes(1);
    expect(client.post).toHaveBeenCalledWith('/conversations/a/reply', { content: 'Raw submitted draft', role: kind === 'seller' ? 'seller' : 'buyer' });
    const server = message('m2', 'a', later, 'Server rewritten reply');
    client.get.mockImplementation((url: string) => Promise.resolve(url.endsWith('/poll') ? envelope([server]) : { data: { ...detail('a', [message(), server]), status: 'awaiting_buyer' } }));
    pending.resolve({ data: { success: true, message_id: 'm2', filtered: true } }); await settle(); await tick(1000);
    expect(screen.getAllByText('Server rewritten reply')).toHaveLength(1);
    expect(screen.queryByText('Raw submitted draft')).toBeNull();
    expect((input as HTMLInputElement).value).toBe('');
  });
  it('keeps accepted POST/read failure visible and recovers using GET without another POST', async () => {
    await mountPage(kind);
    client.post.mockResolvedValue({ data: { success: true, message_id: 'm2', filtered: false } });
    client.get.mockRejectedValue(new Error('read offline'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Accepted draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reply' })); await settle();
    expect(screen.getByRole('status').textContent).toContain('Reply accepted');
    expect(screen.getByRole('alert').textContent).toContain('refresh');
    expect(screen.queryByText(/Failed to send/)).toBeNull();
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(client.post).toHaveBeenCalledTimes(1);
    client.get.mockResolvedValue({ data: detail('a', [message(), message('m2', 'a', later, 'Recovered server reply')]) });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh conversation' })); await settle();
    expect(screen.getByText('Recovered server reply')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull(); expect(screen.queryByRole('alert')).toBeNull();
    expect(client.post).toHaveBeenCalledTimes(1);
  });
  it.each(['Message held for review. Please revise.', [{ loc: ['body', 'content'], msg: 'invalid' }]])('retains rejected draft and persistent safe error (%j)', async (detailValue) => {
    await mountPage(kind);
    client.post.mockRejectedValue(new AxiosError('held', '422', undefined, undefined, { data: { detail: detailValue }, status: 422 } as never));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Retained draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reply' })); await settle(); await tick(10000);
    expect(screen.getByRole('alert').textContent).toBe(typeof detailValue === 'string' ? detailValue : 'Failed to send reply. Please revise and try again.');
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('Retained draft');
    expect((screen.getByRole('button', { name: 'Reply' }) as HTMLButtonElement).disabled).toBe(false);
  });
  it('merges polling records received while the post-ack detail refresh is pending', async () => {
    await mountPage(kind);
    const pending = deferred<{ data: ConversationDetail }>();
    const server = message('m2', 'a', later, 'Concurrent server reply');
    client.post.mockResolvedValue({ data: { success: true, message_id: 'm2', filtered: true } });
    client.get.mockImplementation((url: string) => url.endsWith('/poll') ? Promise.resolve(envelope([server])) : pending.promise);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Unmediated draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reply' })); await settle(); await tick(1000);
    expect(screen.getAllByText('Concurrent server reply')).toHaveLength(1);
    pending.resolve({ data: detail('a', [message(), server]) }); await settle();
    expect(screen.getAllByText('Concurrent server reply')).toHaveLength(1);
    expect(screen.queryByText('Unmediated draft')).toBeNull();
  });
  it('preserves newer poll status when an older post-ack read completes', async () => {
    await mountPage(kind);
    const pending = deferred<{ data: ConversationDetail }>();
    const server = message('m2', 'a', later, 'Mediated reply');
    client.post.mockResolvedValue({ data: { success: true, message_id: 'm2', filtered: true } });
    client.get.mockImplementation((url: string) => url.endsWith('/poll') ? Promise.resolve(envelope([server], 'closed')) : pending.promise);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reply' })); await settle(); await tick(1000);
    pending.resolve({ data: detail('a', [message(), server]) }); await settle();
    if (kind === 'seller') expect(screen.getByText('Closed')).toBeTruthy();
    else if (kind === 'detail') expect(screen.getByText('Status: closed')).toBeTruthy();
    else expect(screen.queryByText(/Escalated to seller/)).toBeNull();
    expect(screen.getAllByText('Mediated reply')).toHaveLength(1);
  });
  it('recovers an accepted reply through polling when the immediate read fails', async () => {
    await mountPage(kind);
    client.post.mockResolvedValue({ data: { success: true, message_id: 'm2', filtered: true } });
    client.get.mockRejectedValueOnce(new Error('read offline')).mockResolvedValue(envelope([message('m2', 'a', later, 'Polled accepted reply')]));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reply' })); await settle();
    expect(screen.getByRole('status').textContent).toContain('Reply accepted');
    await tick(1000);
    expect(screen.getByText('Polled accepted reply')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull(); expect(screen.queryByRole('alert')).toBeNull();
    expect(client.post).toHaveBeenCalledTimes(1);
  });
  it('does not let a late refresh from the old thread alter the new thread', async () => {
    const view = await mountPage(kind);
    const pending = deferred<{ data: ConversationDetail }>();
    client.post.mockResolvedValue({ data: { success: true, message_id: 'm2', filtered: true } });
    client.get.mockReturnValueOnce(pending.promise);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Old reply' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reply' })); await settle();
    client.get.mockResolvedValue({ data: detail('b', [message('b1', 'b', first, 'New thread question')]) });
    if (kind === 'widget') {
      view.rerender(<InquiryWidget listingId="listing-b" listingSlug="b" listingTitle="Listing b" />);
      client.post.mockResolvedValueOnce({ data: detail('b', [message('b1', 'b', first, 'New thread question')]) });
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'New thread question' } });
      fireEvent.click(screen.getByRole('button', { name: 'Submit Question' }));
    } else if (kind === 'seller') fireEvent.click(screen.getByRole('button', { name: /Listing b/ }));
    else { const params = Promise.resolve({ id: 'b' }); await act(async () => { view.rerender(<Suspense fallback="Suspended"><DetailPage params={params} /></Suspense>); }); }
    await settle();
    pending.resolve({ data: detail('a', [message('old', 'a', later, 'Late old reply')]) }); await settle();
    expect(screen.getByText('New thread question')).toBeTruthy(); expect(screen.queryByText('Late old reply')).toBeNull();
  });
  if (kind !== 'widget') it('keeps a new thread clear of late initial detail', async () => {
    const pending = deferred<{ data: ConversationDetail }>(); const view = await mountPage(kind, pending.promise);
    client.get.mockResolvedValue({ data: detail('b', [message('b1', 'b', first, 'New thread question')]) });
    if (kind === 'seller') fireEvent.click(screen.getByRole('button', { name: /Listing b/ }));
    else { const params = Promise.resolve({ id: 'b' }); await act(async () => { view.rerender(<Suspense fallback="Suspended"><DetailPage params={params} /></Suspense>); }); }
    await settle(); pending.resolve({ data: detail() }); await settle();
    expect(screen.getByText('New thread question')).toBeTruthy(); expect(screen.queryByText('Initial server question')).toBeNull();
  });
  it('ignores an old in-flight poll after navigation', async () => {
    const view = await mountPage(kind); const pending = deferred<ReturnType<typeof envelope>>();
    client.get.mockReturnValueOnce(pending.promise); await tick(1000);
    client.get.mockResolvedValue({ data: detail('b', [message('b1', 'b', first, 'New thread question')]) });
    if (kind === 'widget') {
      view.rerender(<InquiryWidget listingId="listing-b" listingSlug="b" listingTitle="Listing b" />);
      client.post.mockResolvedValueOnce({ data: detail('b', [message('b1', 'b', first, 'New thread question')]) });
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'New thread question' } });
      fireEvent.click(screen.getByRole('button', { name: 'Submit Question' }));
    } else if (kind === 'seller') fireEvent.click(screen.getByRole('button', { name: /Listing b/ }));
    else { const params = Promise.resolve({ id: 'b' }); await act(async () => { view.rerender(<Suspense fallback="Suspended"><DetailPage params={params} /></Suspense>); }); }
    await settle(); pending.resolve(envelope([message('old', 'a', later, 'Late poll reply')], 'closed')); await settle();
    expect(screen.getByText('New thread question')).toBeTruthy(); expect(screen.queryByText('Late poll reply')).toBeNull();
  });
  it('does not refresh after a pending reply completes on an unmounted form', async () => {
    const view = await mountPage(kind);
    const pending = deferred<{ data: unknown }>(); client.post.mockReturnValueOnce(pending.promise);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Old draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
    view.unmount(); const reads = client.get.mock.calls.length;
    pending.resolve({ data: { success: true, message_id: 'old', filtered: false } }); await settle();
    expect(client.get).toHaveBeenCalledTimes(reads);
  });
  it('ignores pending reply completion after the thread is left', async () => {
    const view = await mountPage(kind); const pending = deferred<{ data: unknown }>(); client.post.mockReturnValue(pending.promise);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Old draft' } }); fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
    client.get.mockResolvedValue({ data: detail('b', [message('b1', 'b', first, 'New thread question')]) });
    if (kind === 'widget') {
      view.rerender(<InquiryWidget listingId="listing-b" listingSlug="b" listingTitle="Listing b" />);
      client.post.mockResolvedValueOnce({ data: detail('b', [message('b1', 'b', first, 'New thread question')]) });
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'New thread question' } });
      fireEvent.click(screen.getByRole('button', { name: 'Submit Question' }));
    } else if (kind === 'seller') fireEvent.click(screen.getByRole('button', { name: /Listing b/ }));
    else { const params = Promise.resolve({ id: 'b' }); await act(async () => { view.rerender(<Suspense fallback="Suspended"><DetailPage params={params} /></Suspense>); }); }
    await settle(); const reads = client.get.mock.calls.length;
    pending.resolve({ data: { success: true, message_id: 'old', filtered: false } }); await settle();
    expect(client.get).toHaveBeenCalledTimes(reads);
    expect(screen.getByText('New thread question')).toBeTruthy();
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('');
    expect(screen.queryByRole('status')).toBeNull();
  });
});

it('uses the full-detail server-masked seller relationship rather than a global account role', async () => {
  client.get.mockResolvedValue({ data: detail('a', [message()], true) });
  const params = Promise.resolve({ id: 'a' });
  await act(async () => { render(<Suspense fallback="Suspended"><DetailPage params={params} /></Suspense>); });
  expect(screen.getByPlaceholderText('Reply as seller...')).toBeTruthy();
  client.post.mockResolvedValue({ data: { success: true, message_id: 'm2', filtered: false } });
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Seller reply' } });
  fireEvent.click(screen.getByRole('button', { name: 'Reply' })); await settle();
  expect(client.post).toHaveBeenCalledWith('/conversations/a/reply', { content: 'Seller reply', role: 'seller' });
});

it('preserves the expanded reply feedback when the background seller list refresh fails', async () => {
  const view = await mountPage('seller');
  client.post.mockResolvedValue({ data: { success: true, message_id: 'm2', filtered: true } });
  client.get.mockRejectedValue(new Error('Read failed'));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Accepted reply' } });
  fireEvent.click(screen.getByRole('button', { name: 'Reply' })); await settle();
  client.listError = 'Failed to load inquiries.'; view.rerender(<SellerPage />);
  expect(screen.getByRole('status').textContent).toContain('Reply accepted');
  expect(screen.getByRole('textbox')).toBeTruthy();
});
