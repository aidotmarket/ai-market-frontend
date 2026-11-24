// @vitest-environment jsdom
import React, { Suspense } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import axios, { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import { markConversationRead } from '@/api/conversations';
import DetailPage from '@/app/dashboard/inquiries/[id]/page';
import SellerPage from '@/app/dashboard/seller/inquiries/page';
import InquiryWidget from '@/components/InquiryWidget';
import { useAuthStore } from '@/store/auth';
import type { ConversationDetail, ConversationMessage, User } from '@/types';

const list = vi.hoisted(() => ({
  inquiries: [{ id: 'thread', listing_title: 'Synthetic listing', status: 'awaiting_seller', last_message_at: '2026-10-18T00:00:00Z', unread_by_seller: 2 }],
  loading: false, error: '', refetch: vi.fn(), isCurrent: () => true, page: 1, changePage: vi.fn(), hasNext: false,
}));
vi.mock('@/hooks/useInquiryList', () => ({ useInquiryList: () => list }));

const messages: ConversationMessage[] = [
  { id: 'm1', inquiry_id: 'thread', role: 'buyer', content: 'Is the data updated daily?', created_at: '2026-10-18T00:00:00Z' },
  { id: 'm2', inquiry_id: 'thread', role: 'allai', content: 'Yes, every day.', created_at: '2026-10-18T00:01:00Z' },
];
const counterpart: ConversationMessage = {
  id: 'm3', inquiry_id: 'thread', role: 'seller', content: 'The updates run at midnight.', created_at: '2026-10-18T00:02:00Z',
};
const detail: ConversationDetail = {
  id: 'thread', listing_id: 'listing', listing_title: 'Synthetic listing', buyer_id: 'buyer', seller_id: 'seller',
  status: 'awaiting_seller', created_at: messages[0].created_at, last_message_at: messages[1].created_at,
  unread_by_buyer: 2, unread_by_seller: 0, messages,
};
const adapters = [api.defaults.adapter, axios.defaults.adapter] as const;
const fetchMarker = vi.fn<typeof fetch>();
const request = vi.fn<AxiosAdapter>();
let snapshot: ConversationDetail;
let polled: ConversationMessage[];

function unauthorized(config: InternalAxiosRequestConfig) {
  return new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, undefined,
    { config, status: 401, statusText: 'Unauthorized', data: {}, headers: {} });
}

function readCounts() {
  return fetchMarker.mock.calls.map(([, options]) => JSON.parse(String(options?.body)).seen_message_count);
}

function setVisibility(value: DocumentVisibilityState) {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(value);
  fireEvent(document, new Event('visibilitychange'));
}

beforeEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  const viewer = { id: 'buyer' } as User;
  useAuthStore.setState({ user: viewer, token: 'synthetic', isAuthenticated: true, hydrated: true, isLoading: false });
  snapshot = detail;
  polled = [];
  fetchMarker.mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetchMarker);
  vi.stubGlobal('XMLHttpRequest', class { constructor() { throw new Error('Network forbidden'); } });
  request.mockImplementation(async (config) => {
    const response = (data: unknown) => ({ config, data, status: 200, statusText: 'OK', headers: {} });
    switch (config.url) {
      case '/conversations/':
      case '/conversations/thread': return response(snapshot);
      case '/conversations/thread/reply': return response({ success: true, message_id: 'pending-reply' });
      case '/conversations/thread/poll': return response({ new_messages: polled, inquiry_status: detail.status, has_more: false });
      case '/conversations/thread/read': throw unauthorized(config);
      default: throw new Error(`Unexpected request ${config.url}`);
    }
  });
  api.defaults.adapter = request;
  axios.defaults.adapter = vi.fn(async config => { throw unauthorized(config); });
});
afterEach(() => {
  cleanup();
  [api.defaults.adapter, axios.defaults.adapter] = adapters;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('markConversationRead', () => {
  it('posts the seen message count and current token to the encoded read route', async () => {
    useAuthStore.setState({ token: 'rotated-token' });
    expect(await markConversationRead('a/b', 4)).toBe(true);
    expect(fetchMarker).toHaveBeenCalledExactlyOnceWith(`${api.defaults.baseURL}/conversations/a%2Fb/read`, {
      method: 'POST', credentials: 'include', redirect: 'error',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer rotated-token' },
      body: JSON.stringify({ seen_message_count: 4 }),
    });
    expect(request).not.toHaveBeenCalled();
  });

  it('resolves false when the network fails', async () => {
    fetchMarker.mockRejectedValueOnce(new Error('Synthetic network failure'));
    expect(await markConversationRead('thread', 2)).toBe(false);
  });
});

async function openDetail() {
  const params = Promise.resolve({ id: 'thread' });
  await act(async () => { render(<Suspense fallback="Loading"><DetailPage params={params} /></Suspense>); });
}

async function openSeller() {
  useAuthStore.setState({ user: { id: 'seller' } as User });
  render(<SellerPage />);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Synthetic listing/ })); });
}

async function openWidget() {
  render(<InquiryWidget listingId="listing" listingSlug="listing" listingTitle="Synthetic listing" />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: messages[0].content } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Submit Question' })); });
}

async function reply() {
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Thanks for the details' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Reply' })); });
}

async function refresh() {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Refresh conversation' })); });
}

describe.each([['detail', openDetail], ['seller', openSeller], ['widget', openWidget]] as const)('%s thread view', (view, open) => {
  const newMessage = { ...counterpart, role: view === 'seller' ? 'buyer' : 'seller' } as const;

  it('marks the initial display and marks again only when a refresh adds a message', async () => {
    let renderedAtRequest = false;
    fetchMarker.mockImplementationOnce(async () => {
      renderedAtRequest = screen.queryByText(messages[1].content) !== null;
      return new Response(null, { status: 204 });
    });
    await open();
    expect(renderedAtRequest).toBe(true);
    expect(readCounts()).toEqual([2]);

    await reply(); // The reply triggers a GET, which still returns the same two messages.
    expect(request).toHaveBeenLastCalledWith(expect.objectContaining({ url: '/conversations/thread', method: 'get' }));
    expect(readCounts()).toEqual([2]);
    snapshot = { ...detail, messages: [...messages, newMessage] };
    await refresh();
    expect(screen.getByText(newMessage.content)).toBeTruthy();
    expect(readCounts()).toEqual([2, 3]);
  });

  it('waits for visibility and marks the displayed count once', async () => {
    setVisibility('hidden');
    await open();
    expect(screen.getByText(messages[1].content)).toBeTruthy();
    expect(readCounts()).toEqual([]);
    await act(async () => { setVisibility('visible'); });
    await act(async () => { setVisibility('visible'); });
    expect(readCounts()).toEqual([2]);

    setVisibility('hidden');
    snapshot = { ...detail, messages: [...messages, newMessage] };
    await reply();
    expect(screen.getByText(newMessage.content)).toBeTruthy();
    expect(readCounts()).toEqual([2]);
    await act(async () => { setVisibility('visible'); });
    expect(readCounts()).toEqual([2, 3]);
  });

  it('marks new messages when a poll adds them to the displayed thread', async () => {
    vi.useFakeTimers();
    await open();
    expect(readCounts()).toEqual([2]);
    polled = [newMessage];
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(screen.getByText(newMessage.content)).toBeTruthy();
    expect(readCounts()).toEqual([2, 3]);
  });
});

it('keeps the detail page usable after a marker 401 and retries on the next display', async () => {
  fetchMarker.mockResolvedValueOnce(new Response(null, { status: 401 }));
  const auth = useAuthStore.getState();
  const url = window.location.href;
  const consoleError = vi.spyOn(console, 'error');
  await openDetail();

  expect(readCounts()).toEqual([2]);
  expect(axios.defaults.adapter).not.toHaveBeenCalled();
  expect(window.location.href).toBe(url);
  // jsdom reports attempted navigation through its virtual console.
  expect(consoleError.mock.calls.flat().map(String).join('\n')).not.toMatch(/navigation/i);
  expect(useAuthStore.getState()).toBe(auth);
  expect(screen.getByText(messages[1].content)).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByRole<HTMLInputElement>('textbox').disabled).toBe(false);

  await reply();
  expect(request).toHaveBeenCalledWith(expect.objectContaining({ url: '/conversations/thread/reply' }));
  expect(readCounts()).toEqual([2, 2]);
  await refresh();
  expect(readCounts()).toEqual([2, 2]);
});
