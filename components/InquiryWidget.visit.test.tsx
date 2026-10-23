// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/store/auth';
import InquiryWidget from './InquiryWidget';
import type { ConversationDetail, User } from '@/types';
const anonymous = vi.hoisted(() => ({ createAnonymousSession: vi.fn(), readAnonymousMessageStream: vi.fn(), sendAnonymousMessage: vi.fn() }));
const mock = vi.hoisted(() => ({ createInquiry: vi.fn(), getConversation: vi.fn(), replyToConversation: vi.fn(), pollConversation: vi.fn() }));
vi.mock('@/api/conversations', () => mock);
vi.mock('@/api/auth', () => ({}));
vi.mock('@/api/anonymousChat', () => anonymous);
vi.mock('@/components/Toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('next/link', () => ({ default: ({ children, ...p }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...p}>{children}</a> }));
const first = '2026-10-23T00:00:00Z';
const detail = (id = 'a'): ConversationDetail => ({ id, listing_id: `listing-${id}`, listing_title: `Listing ${id}`, buyer_id: 'buyer-a', seller_id: 'seller', status: 'awaiting_seller', last_message_at: first, unread_by_buyer: 0, unread_by_seller: 0, created_at: first, messages: [{ id: `m-${id}`, inquiry_id: id, role: 'buyer', content: `Private thread ${id}`, created_at: first }] });
function deferred<T>() { let resolve!: (v: T) => void; let reject!: (e: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function auth(id: string | null, token = id ? `synthetic-${id}` : null) { useAuthStore.setState({ user: id ? { id } as User : null, token, isAuthenticated: !!id, hydrated: true, isLoading: false }); }
const widget = (id = 'a') => <InquiryWidget listingId={`listing-${id}`} listingSlug={id} listingTitle={`Listing ${id}`}/>;
function submit() { fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Synthetic initial question' } }); fireEvent.click(screen.getByRole('button', { name: 'Submit Question' })); }
beforeEach(() => { vi.resetAllMocks(); mock.pollConversation.mockResolvedValue({ new_messages: [], inquiry_status: 'awaiting_seller', has_more: false }); auth('buyer-a'); Element.prototype.scrollIntoView = vi.fn(); sessionStorage.clear(); vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network forbidden'); })); vi.stubGlobal('XMLHttpRequest', class {
    constructor() { throw new Error('Network forbidden'); }
}); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it('retires private thread and reply controls when the account logs out', async () => {
    mock.createInquiry.mockResolvedValue(detail());
    render(widget());
    submit();
    await screen.findByText('Private thread a');
    await act(async () => auth(null));
    expect(screen.queryByText('Private thread a')).toBeNull();
    expect(screen.queryByPlaceholderText('Follow up...')).toBeNull();
});
it('does not show or poll a late create result from listing A in listing B', async () => {
    const pending = deferred<ConversationDetail>();
    mock.createInquiry.mockReturnValue(pending.promise);
    const view = render(widget());
    submit();
    view.rerender(widget('b'));
    await act(async () => pending.resolve(detail()));
    expect(screen.queryByText('Private thread a')).toBeNull();
    expect(mock.pollConversation).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Submit Question' })).toBeTruthy();
});
it('does not install a late old-account thread after another account arrives', async () => {
    const pending = deferred<ConversationDetail>();
    mock.createInquiry.mockReturnValue(pending.promise);
    render(widget());
    submit();
    await act(async () => auth('buyer-b'));
    await act(async () => pending.resolve(detail()));
    expect(screen.queryByText('Private thread a')).toBeNull();
    expect(screen.queryByPlaceholderText('Follow up...')).toBeNull();
});
it('preserves an ordinary same-account token refresh and does not repeat creation', async () => {
    mock.createInquiry.mockResolvedValue(detail());
    render(widget());
    submit();
    await screen.findByText('Private thread a');
    await act(async () => auth('buyer-a', 'synthetic-refreshed-token'));
    expect(screen.getByText('Private thread a')).toBeTruthy();
    expect(mock.createInquiry).toHaveBeenCalledTimes(1);
    expect(mock.createInquiry).toHaveBeenCalledWith('listing-a', 'Synthetic initial question');
});
const changeDraft = (value: string) => fireEvent.change(screen.getByRole('textbox'), { target: { value } });
const settle = async () => { await act(async () => { }); };
const tick = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
async function thread() {
    mock.createInquiry.mockResolvedValue(detail());
    const view = render(widget());
    submit();
    await settle();
    return view;
}
function reply() { changeDraft('Raw private draft'); fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' }); }
it.each(['logout', 'switch', 'ABA'] as const)('retires settled content and drafts on %s', async (kind) => {
    await thread();
    changeDraft('Private followup');
    act(() => { auth(kind === 'logout' ? null : 'buyer-b'); if (kind === 'ABA')
        auth('buyer-a'); });
    expect(screen.queryByText('Private thread a')).toBeNull();
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('');
});
it.each([true, false])('rejects late create success/failure after listing A-B-A (success %s)', async (success) => {
    const pending = deferred<ConversationDetail>();
    mock.createInquiry.mockReturnValueOnce(pending.promise);
    const view = render(widget());
    submit();
    view.rerender(widget('b'));
    view.rerender(widget());
    const fresh = deferred<ConversationDetail>();
    mock.createInquiry.mockReturnValueOnce(fresh.promise);
    submit();
    await act(async () => { if (success)
        pending.resolve(detail());
    else
        pending.reject(new Error('Old failure')); });
    expect(screen.queryByText('Private thread a')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Submitting...' })).toBeTruthy();
    await act(async () => fresh.resolve(detail('new')));
    expect(screen.getByText('Private thread new')).toBeTruthy();
});
it.each([true, false])('rejects old account create callbacks without clearing a new draft (success %s)', async (success) => {
    const pending = deferred<ConversationDetail>();
    mock.createInquiry.mockReturnValueOnce(pending.promise);
    render(widget());
    submit();
    act(() => { auth('buyer-b'); auth('buyer-a'); });
    changeDraft('New visit draft');
    await act(async () => { if (success)
        pending.resolve(detail());
    else
        pending.reject(new Error('Old failure')); });
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('New visit draft');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('Private thread a')).toBeNull();
});
it('allows one initial dispatch, keeps pending work through token refresh and retries a refusal deliberately', async () => {
    const pending = deferred<ConversationDetail>();
    mock.createInquiry.mockReturnValueOnce(pending.promise);
    render(widget());
    submit();
    fireEvent.click(screen.getByRole('button', { name: 'Submitting...' }));
    act(() => auth('buyer-a', 'rotated'));
    expect(mock.createInquiry).toHaveBeenCalledTimes(1);
    await act(async () => pending.reject(new Error('Refused')));
    expect(screen.getByRole('alert')).toBeTruthy();
    mock.createInquiry.mockResolvedValueOnce(detail());
    fireEvent.click(screen.getByRole('button', { name: 'Submit Question' }));
    await settle();
    expect(mock.createInquiry).toHaveBeenCalledTimes(2);
    changeDraft('Retained draft');
    act(() => auth('buyer-a', 'rotated-again'));
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('Retained draft');
});
it.each([true, false])('retires pending reply acknowledgement/refusal before it can refetch (success %s)', async (success) => {
    await thread();
    const pending = deferred<{
        success: boolean;
        message_id: string;
    }>();
    mock.replyToConversation.mockReturnValueOnce(pending.promise);
    reply();
    act(() => { auth('buyer-b'); auth('buyer-a'); });
    changeDraft('New draft');
    await act(async () => { if (success)
        pending.resolve({ success: true, message_id: 'ack' });
    else
        pending.reject(new Error('Old refusal')); });
    expect(mock.getConversation).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('New draft');
});
it.each([true, false])('retires a pending accepted reply read (success %s)', async (success) => {
    await thread();
    const pending = deferred<ConversationDetail>();
    mock.replyToConversation.mockResolvedValue({ success: true, message_id: 'ack' });
    mock.getConversation.mockReturnValueOnce(pending.promise);
    reply();
    await settle();
    expect(mock.getConversation).toHaveBeenCalledTimes(1);
    act(() => auth('buyer-b'));
    changeDraft('Replacement draft');
    await act(async () => { if (success)
        pending.resolve(detail('old-read'));
    else
        pending.reject(new Error('Old read failure')); });
    expect(screen.queryByText('Private thread old-read')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Replacement draft');
});
it('checks the store before old reply or poll UI can dispatch in the same turn', async () => {
    vi.useFakeTimers();
    await thread();
    changeDraft('Private draft');
    const input = screen.getByRole('textbox');
    act(() => { auth('buyer-b'); fireEvent.keyDown(input, { key: 'Enter' }); });
    await tick(5000);
    expect(mock.replyToConversation).not.toHaveBeenCalled();
    expect(mock.pollConversation).not.toHaveBeenCalled();
});
it.each([true, false])('retires pending polls and stops further reads after account change (success %s)', async (success) => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    await thread();
    const pending = deferred<unknown>();
    mock.pollConversation.mockReturnValueOnce(pending.promise);
    await tick(1000);
    expect(mock.pollConversation).toHaveBeenCalledTimes(1);
    act(() => { auth('buyer-b'); auth('buyer-a'); });
    changeDraft('New poll visit');
    await act(async () => { if (success)
        pending.resolve({ new_messages: detail('poll').messages, inquiry_status: 'closed', has_more: true });
    else
        pending.reject(new Error('Old poll failure')); });
    await tick(10000);
    expect(mock.pollConversation).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Private thread poll')).toBeNull();
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('New poll visit');
});
it('keeps accepted replies accepted after read failure and recovers by read only', async () => {
    await thread();
    mock.replyToConversation.mockResolvedValue({ success: true, message_id: 'ack' });
    mock.getConversation.mockRejectedValueOnce(new Error('Read unavailable'));
    reply();
    await settle();
    expect(screen.getByText('Reply accepted. Waiting to refresh the server thread.')).toBeTruthy();
    mock.getConversation.mockResolvedValueOnce({ ...detail(), messages: [...detail().messages, { ...detail().messages[0], id: 'ack', content: 'Server masked reply' }] });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh conversation' }));
    await settle();
    expect(screen.getByText('Server masked reply')).toBeTruthy();
    expect(mock.replyToConversation).toHaveBeenCalledTimes(1);
});
it('retires pending initial writes on unmount without replaying them', async () => {
    const pending = deferred<ConversationDetail>();
    mock.createInquiry.mockReturnValueOnce(pending.promise);
    const view = render(widget());
    submit();
    view.unmount();
    render(widget());
    changeDraft('New mount draft');
    await act(async () => pending.resolve(detail()));
    expect(screen.queryByText('Private thread a')).toBeNull();
    expect(mock.createInquiry).toHaveBeenCalledTimes(1);
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('New mount draft');
});
it('retires anonymous session creation and restores only the destination listing draft', async () => {
    auth(null);
    const pending = deferred<string>();
    anonymous.createAnonymousSession.mockReturnValueOnce(pending.promise);
    const view = render(widget());
    submit();
    sessionStorage.setItem('inquiry_draft_listing-b', 'Recovered listing B draft');
    view.rerender(widget('b'));
    await act(async () => pending.resolve('obsolete-session'));
    expect(anonymous.sendAnonymousMessage).not.toHaveBeenCalled();
    expect(screen.queryByText('Synthetic initial question', { selector: 'p' })).toBeNull();
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Recovered listing B draft');
});
it('starts a fresh anonymous session after completed public answers and listing A-B-A', async () => {
    auth(null);
    anonymous.createAnonymousSession.mockResolvedValueOnce('session-a').mockResolvedValueOnce('session-b').mockResolvedValueOnce('new-session-a');
    anonymous.sendAnonymousMessage.mockResolvedValue({ ok: true, status: 200, body: {} });
    anonymous.readAnonymousMessageStream.mockImplementation(async (_body, receive) => receive({ text: 'Public answer for this visit' }));
    const view = render(widget());
    submit();
    await settle();
    expect(screen.getByText('Public answer for this visit')).toBeTruthy();
    view.rerender(widget('b'));
    expect(screen.queryByText('Public answer for this visit')).toBeNull();
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('');
    submit();
    await settle();
    view.rerender(widget());
    submit();
    await settle();
    expect(anonymous.sendAnonymousMessage.mock.calls.map(([payload]) => payload.session_id)).toEqual(['session-a', 'session-b', 'new-session-a']);
});

it.each(['reply', 'read', 'poll'] as const)('keeps pending %s through same-account token refresh', async (kind) => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    await thread();
    const pending = deferred<unknown>();
    const server = { ...detail(), messages: [...detail().messages, { ...detail().messages[0], id: 'ack', content: 'Masked server continuation' }] };
    if (kind === 'reply') {
        mock.replyToConversation.mockReturnValueOnce(pending.promise);
        mock.getConversation.mockResolvedValueOnce(server);
        reply();
    } else if (kind === 'read') {
        mock.replyToConversation.mockResolvedValueOnce({ success: true, message_id: 'ack' });
        mock.getConversation.mockReturnValueOnce(pending.promise);
        reply();
        await settle();
    } else {
        mock.pollConversation.mockReturnValueOnce(pending.promise);
        await tick(1000);
        changeDraft('Poll retains my draft');
    }
    act(() => auth('buyer-a', 'rotated-while-pending'));
    await act(async () => pending.resolve(kind === 'reply' ? { success: true, message_id: 'ack' } : kind === 'read' ? server : { new_messages: server.messages, inquiry_status: 'closed', has_more: false }));
    expect(screen.getByText('Masked server continuation')).toBeTruthy();
    expect(mock.createInquiry).toHaveBeenCalledTimes(1);
    if (kind === 'poll') expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('Poll retains my draft');
    else expect(mock.replyToConversation).toHaveBeenCalledTimes(1);
});

it('blocks duplicate initial dispatches inside a single React turn', async () => {
    const pending = deferred<ConversationDetail>();
    mock.createInquiry.mockReturnValueOnce(pending.promise);
    render(widget());
    changeDraft('One initial question');
    const button = screen.getByRole('button', { name: 'Submit Question' });
    act(() => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(mock.createInquiry).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(detail()));
});
