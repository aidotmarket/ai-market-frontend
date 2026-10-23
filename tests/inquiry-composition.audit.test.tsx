// @vitest-environment jsdom
import React, { Suspense } from 'react';
import { act, cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DetailPage from '@/app/dashboard/inquiries/[id]/page';
import SellerPage from '@/app/dashboard/seller/inquiries/page';
import InquiryWidget from '@/components/InquiryWidget';

const api = vi.hoisted(() => ({
  getConversation: vi.fn(), createInquiry: vi.fn(), replyToConversation: vi.fn(),
  updateSince: vi.fn(), refetch: vi.fn(), toast: vi.fn(), isCurrent: () => true,
}));
vi.mock('@/api/conversations', () => api);
vi.mock('@/api/anonymousChat', () => ({ createAnonymousSession: vi.fn(() => { throw new Error('No anonymous session'); }), sendAnonymousMessage: vi.fn(() => { throw new Error('No messages'); }), readAnonymousMessageStream: vi.fn() }));
vi.mock('@/store/auth', async (importOriginal) => {
  const state = { user: { id: 'viewer' }, token: 'synthetic', isAuthenticated: true };
  return { ...await importOriginal<typeof import('@/store/auth')>(), useAuthStore: Object.assign((select?: (value: typeof state) => unknown) => select ? select(state) : state, { getState: () => state, subscribe: () => () => {} }) };
});
vi.mock('@/components/Toast', () => ({ useToast: () => ({ toast: api.toast }) }));
vi.mock('@/hooks/useConversationPoll', () => ({ useConversationPoll: () => ({ updateSince: api.updateSince }) }));
vi.mock('@/hooks/useInquiryList', () => ({ useInquiryList: () => ({ inquiries: [{ id: 'thread', listing_title: 'Synthetic listing', status: 'awaiting_seller', last_message_at: '2026-10-18T00:00:00Z', unread_by_seller: 0 }], loading: false, error: '', refetch: api.refetch, isCurrent: api.isCurrent, page: 1, changePage: vi.fn(), hasNext: false }) }));
vi.mock('@/components/ConversationThread', () => ({ default: () => null }));
const detail = { id: 'thread', listing_id: 'listing', listing_title: 'Synthetic listing', buyer_id: 'viewer', seller_id: 'seller', status: 'awaiting_seller', created_at: '2026-10-18T00:00:00Z', messages: [] };
const draft = '  candidate reply  ';
const networkDenied = vi.fn(() => { throw new Error('Network forbidden'); });
beforeEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();
  vi.stubGlobal('fetch', networkDenied);
  vi.stubGlobal('XMLHttpRequest', networkDenied);
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000000');
  api.getConversation.mockResolvedValue(detail);
  api.createInquiry.mockResolvedValue(detail);
  api.replyToConversation.mockResolvedValue({ success: true, message_id: 'reply' });
});
afterEach(() => {
  cleanup();
  expect(networkDenied).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
type Surface = 'widget' | 'seller' | 'detail';
async function mount(kind: Surface, text = draft) {
  if (kind === 'widget') {
    render(<InquiryWidget listingId="listing" listingSlug="listing" listingTitle="Synthetic listing"/>);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Initial question' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Submit Question' })); });
    expect(api.createInquiry).toHaveBeenCalledExactlyOnceWith('listing', 'Initial question');
  }
  else if (kind === 'seller') {
    render(<SellerPage />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Synthetic listing/ })); });
  }
  else {
    const params = Promise.resolve({ id: 'thread' });
    await act(async () => { render(<Suspense fallback="Loading"><DetailPage params={params}/></Suspense>); });
  }
  const box = await screen.findByRole<HTMLInputElement>('textbox');
  fireEvent.change(box, { target: { value: text } });
  return box;
}
function enter(box: HTMLInputElement, flags: KeyboardEventInit = {}) {
  const event = createEvent.keyDown(box, {
    key: 'Enter', code: 'Enter', bubbles: true, cancelable: true, ...flags,
  }) as KeyboardEvent;
  fireEvent(box, event);
  return event;
}
const compositionFlags = [
  { name: 'native composing', isComposing: true, keyCode: 13 },
  { name: 'legacy229', keyCode: 229, isComposing: false },
];
// Mounted React with synthetic English text/flags; not native OS/IME/device acceptance.
describe.each<Surface>(['detail', 'seller', 'widget'])('%s actual reply composition', kind => {
  it.each(compositionFlags)('preserves browser confirmation and sends once after $name ends', async (flags) => {
    const box = await mount(kind);
    fireEvent.compositionStart(box);
    let event!: KeyboardEvent;
    await act(async () => { event = enter(box, flags); });
    expect(event.isComposing).toBe(flags.isComposing);
    expect(event.keyCode).toBe(flags.keyCode);
    expect(event.defaultPrevented).toBe(false);
    expect(api.replyToConversation).not.toHaveBeenCalled();
    expect(box.value).toBe(draft);
    fireEvent.compositionEnd(box);
    expect(api.replyToConversation).not.toHaveBeenCalled();
    expect(box.value).toBe(draft);
    await act(async () => { enter(box, { keyCode: 13, isComposing: false }); });
    expect(api.replyToConversation).toHaveBeenCalledExactlyOnceWith('thread', 'candidate reply', kind === 'seller' ? 'seller' : 'buyer');
    expect(box.value).toBe('');
  });
  it.each(['Enter', 'Reply'])('%s sends one trimmed reply', async (action) => {
    const box = await mount(kind);
    await act(async () => {
      if (action === 'Enter')
        enter(box, { keyCode: 13, isComposing: false });
      else
        fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
    });
    expect(api.replyToConversation).toHaveBeenCalledExactlyOnceWith('thread', 'candidate reply', kind === 'seller' ? 'seller' : 'buyer');
    expect(box.value).toBe('');
  });
  it('Shift Enter preserves the draft and browser default', async () => {
    const box = await mount(kind);
    expect(enter(box, { shiftKey: true }).defaultPrevented).toBe(false);
    expect(api.replyToConversation).not.toHaveBeenCalled();
    expect(box.value).toBe(draft);
  });
  it.each(['', '   '])('blocks empty reply %j', async (text) => {
    const box = await mount(kind, text);
    const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Reply' });
    expect(button.disabled).toBe(true);
    enter(box);
    fireEvent.click(button);
    expect(api.replyToConversation).not.toHaveBeenCalled();
    expect(box.value).toBe(text);
  });
  it('blocks repeated Enter and button while in flight and accepted but unrefreshed', async () => {
    const box = await mount(kind);
    let resolve!: (ack: {
      success: boolean;
      message_id: string;
    }) => void;
    api.replyToConversation.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    // Two synchronous events also exercise the sending ref before an async acknowledgement.
    act(() => { enter(box); enter(box); });
    expect(api.replyToConversation).toHaveBeenCalledExactlyOnceWith('thread', 'candidate reply', kind === 'seller' ? 'seller' : 'buyer');
    expect(box.disabled).toBe(true);
    expect(box.value).toBe(draft);
    const sending = screen.getByRole<HTMLButtonElement>('button', { name: 'Sending...' });
    expect(sending.disabled).toBe(true);
    fireEvent.click(sending);
    // Simulate a failed read after a successful write: acceptance must still prevent resends.
    api.getConversation.mockRejectedValueOnce(new Error('Synthetic refresh failure'));
    await act(async () => { resolve({ success: true, message_id: 'reply' }); });
    expect(screen.getByText('Reply accepted. Waiting to refresh the server thread.')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe('Failed to refresh conversation.');
    expect(box.disabled).toBe(true);
    expect(box.value).toBe('');
    const reply = screen.getByRole<HTMLButtonElement>('button', { name: 'Reply' });
    expect(reply.disabled).toBe(true);
    // Programmatic change/key events exercise the accepted guard even on a disabled input.
    fireEvent.change(box, { target: { value: 'Another draft' } });
    enter(box);
    fireEvent.click(reply);
    expect(api.replyToConversation).toHaveBeenCalledTimes(1);
  });
});
