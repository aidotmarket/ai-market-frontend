// @vitest-environment jsdom
import React, { Suspense } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { markConversationRead } from '@/api/conversations';
import DetailPage from '@/app/dashboard/inquiries/[id]/page';
import SellerPage from '@/app/dashboard/seller/inquiries/page';
import InquiryWidget from '@/components/InquiryWidget';

// The real API module runs against a stubbed HTTP client, so these tests see
// exactly which requests a thread view makes.
const client = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), updateSince: vi.fn() }));
vi.mock('@/api/client', () => ({ api: client }));
vi.mock('@/api/anonymousChat', () => ({ createAnonymousSession: vi.fn(() => { throw new Error('No anonymous session'); }), sendAnonymousMessage: vi.fn(() => { throw new Error('No messages'); }), readAnonymousMessageStream: vi.fn() }));
vi.mock('@/store/auth', async (importOriginal) => {
  const state = { user: { id: 'viewer' }, token: 'synthetic', isAuthenticated: true };
  return { ...await importOriginal<typeof import('@/store/auth')>(), useAuthStore: Object.assign((select?: (value: typeof state) => unknown) => select ? select(state) : state, { getState: () => state, subscribe: () => () => {} }) };
});
vi.mock('@/components/Toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
// A stable stub: the views reload whenever this callback's identity changes.
vi.mock('@/hooks/useConversationPoll', () => ({ useConversationPoll: () => ({ updateSince: client.updateSince }) }));
vi.mock('@/components/ConversationThread', () => ({ default: () => null }));
vi.mock('@/hooks/useInquiryList', () => ({ useInquiryList: () => ({ inquiries: [{ id: 'thread', listing_title: 'Synthetic listing', status: 'awaiting_seller', last_message_at: '2026-10-18T00:00:00Z', unread_by_seller: 2 }], loading: false, error: '', refetch: vi.fn(), isCurrent: () => true, page: 1, changePage: vi.fn(), hasNext: false }) }));

const messages = [
  { id: 'm1', inquiry_id: 'thread', role: 'buyer', content: 'Is the data updated daily?', created_at: '2026-10-18T00:00:00Z' },
  { id: 'm2', inquiry_id: 'thread', role: 'allai', content: 'Yes, every day.', created_at: '2026-10-18T00:01:00Z' },
];
const detail = { id: 'thread', listing_id: 'listing', listing_title: 'Synthetic listing', buyer_id: 'viewer', seller_id: null, status: 'awaiting_seller', created_at: '2026-10-18T00:00:00Z', unread_by_buyer: 2, unread_by_seller: 0, messages };
const readCalls = () => client.post.mock.calls.filter(([path]) => String(path).endsWith('/read'));

beforeEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('fetch', () => { throw new Error('Network forbidden'); });
  vi.stubGlobal('XMLHttpRequest', class { constructor() { throw new Error('Network forbidden'); } });
  client.get.mockImplementation(async (path: string) => {
    if (path === '/conversations/thread') return { data: detail };
    throw new Error(`unexpected GET ${path}`);
  });
  client.post.mockImplementation(async (path: string) => {
    if (path === '/conversations/thread/read') return { data: '' };
    if (path === '/conversations/') return { data: { ...detail, messages: messages.slice(0, 1) } };
    if (path === '/conversations/thread/reply') return { data: { success: true, message_id: 'm3' } };
    throw new Error(`unexpected POST ${path}`);
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('markConversationRead', () => {
  it('posts the seen message count to the encoded read route', async () => {
    client.post.mockResolvedValueOnce({ data: '' });
    expect(await markConversationRead('a/b', 4)).toBe(true);
    expect(client.post).toHaveBeenCalledExactlyOnceWith('/conversations/a%2Fb/read', { seen_message_count: 4 });
  });
  it('resolves false instead of throwing when the request fails', async () => {
    client.post.mockRejectedValueOnce(new Error('Synthetic network failure'));
    expect(await markConversationRead('thread', 2)).toBe(false);
  });
});

async function openDetail() {
  const params = Promise.resolve({ id: 'thread' });
  await act(async () => { render(<Suspense fallback="Loading"><DetailPage params={params} /></Suspense>); });
  await screen.findByRole('heading', { name: 'Synthetic listing' });
}
async function openSeller() {
  render(<SellerPage />);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Synthetic listing/ })); });
  await screen.findByRole('textbox');
}

describe.each([['detail', openDetail], ['seller', openSeller]] as const)('%s thread view', (_, open) => {
  it('marks the shown thread read exactly once', async () => {
    await open();
    expect(client.get).toHaveBeenCalledWith('/conversations/thread');
    expect(readCalls()).toEqual([['/conversations/thread/read', { seen_message_count: messages.length }]]);
  });
  it('stays usable when mark-read fails', async () => {
    client.post.mockImplementation(async (path: string) => {
      if (path === '/conversations/thread/read') throw new Error('Synthetic mark-read failure');
      if (path === '/conversations/thread/reply') return { data: { success: true, message_id: 'm3' } };
      throw new Error(`unexpected POST ${path}`);
    });
    await open();
    expect(readCalls()).toHaveLength(1);
    expect(screen.queryByRole('alert')).toBeNull();
    const box = screen.getByRole<HTMLInputElement>('textbox');
    expect(box.disabled).toBe(false);
    fireEvent.change(box, { target: { value: 'Thanks for the details' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Reply' })); });
    expect(client.post).toHaveBeenCalledWith('/conversations/thread/reply', expect.objectContaining({ content: 'Thanks for the details' }));
  });
});

describe('listing inquiry widget', () => {
  it('marks the thread read when it refreshes the shown thread, and tolerates failure', async () => {
    render(<InquiryWidget listingId="listing" listingSlug="listing" listingTitle="Synthetic listing" />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Is the data updated daily?' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Submit Question' })); });
    // Creating the thread is not a read of the other side's messages.
    expect(readCalls()).toHaveLength(0);
    client.post.mockImplementation(async (path: string) => {
      if (path === '/conversations/thread/reply') return { data: { success: true, message_id: 'm3' } };
      if (path === '/conversations/thread/read') throw new Error('Synthetic mark-read failure');
      throw new Error(`unexpected POST ${path}`);
    });
    const box = await screen.findByRole<HTMLInputElement>('textbox');
    fireEvent.change(box, { target: { value: 'And the history?' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Reply' })); });
    expect(client.get).toHaveBeenCalledWith('/conversations/thread');
    expect(readCalls()).toEqual([['/conversations/thread/read', { seen_message_count: messages.length }]]);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
