'use client';

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useAuthStore } from '@/store/auth';
import { authSessionOwner, isAuthSessionOwner, subscribeAuthSessionOwner } from '@/lib/auth-session-owner';
import { getRequestThreadSelector, getRequestThreadMessages, sendRequestThreadMessage, reconcileRequestThreadMessage } from '@/api/data-requests';
import type { RequestThreadSelector, RequestThreadHistory, RequestMessageCommand, RequestCommandResult } from '@/api/data-requests';

const button = 'rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-[#3F51B5] disabled:opacity-50';
const resultText = {
  sent: 'Message sent. The conversation shows the approved text.',
  processing: 'Your message is still being checked. Delivery is not confirmed.',
  processing_failed: 'The message check is unavailable. Your message was not sent. You can retry this same message.',
  held: 'Message not sent. It has been held for review.',
  clarification_requested: 'Message not sent. Please write a clearer message.',
  refused: 'Message not sent. Please revise your message.',
  unusable: 'Message not sent. A safe message could not be prepared.',
  unknown: 'We could not confirm whether your message was sent. Check the result before writing another message.',
};
type Attempt = { command: RequestMessageCommand; digest?: string; state: RequestCommandResult['state']; busy: boolean; flight?: symbol };

export default function RequestConversation({ requestId, requestStatus, quoteRevision = 0 }: { requestId: string; requestStatus: string; quoteRevision?: number }) {
  const { user, token, isAuthenticated } = useAuthStore();
  const owner = useSyncExternalStore(subscribeAuthSessionOwner, authSessionOwner, authSessionOwner);
  if (!user || !token || !isAuthenticated) return null;
  return <OwnedConversation key={`${requestId}:${user.id}:${owner}`} requestId={requestId} requestStatus={requestStatus} quoteRevision={quoteRevision} principal={user.id} owner={owner} />;
}

function OwnedConversation({ requestId, requestStatus, quoteRevision, principal, owner }: { requestId: string; requestStatus: string; quoteRevision: number; principal: string; owner: number }) {
  const [selector, setSelector] = useState<RequestThreadSelector | null>(null);
  const [selection, setSelection] = useState('');
  const [selectorError, setSelectorError] = useState(false);
  const [reload, setReload] = useState(0);
  const [history, setHistory] = useState<RequestThreadHistory | null>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState(false);
  const [draft, setDraft] = useState('');
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [notice, setNotice] = useState('');
  // Only unresolved commands are retained across thread switches, in this owner’s memory.
  const pending = useRef(new Map<string, Attempt>());
  const active = useRef(false);
  const epoch = useRef(0);
  const current = useRef(selection);
  const currentStatus = useRef(requestStatus);
  currentStatus.current = requestStatus;
  const resultFocus = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    if (attempt || notice) resultFocus.current?.focus();
  }, [attempt?.state, attempt?.busy, notice]);
  const alive = () => active.current && isAuthSessionOwner(owner) && useAuthStore.getState().user?.id === principal && !!useAuthStore.getState().token && useAuthStore.getState().isAuthenticated;
  useLayoutEffect(() => { active.current = true; return () => { active.current = false; epoch.current++; pending.current.clear(); }; }, []);
  useLayoutEffect(() => {
    current.current = selection;
    epoch.current++;
    setHistory(null); setReadError(false); setNotice('');
    const saved = pending.current.get(selection);
    if (saved) { saved.busy = false; if (saved.state === 'processing') saved.state = 'unknown'; }
    setAttempt(saved ?? null); setDraft(saved?.command.content ?? '');
  }, [selection]);
  useEffect(() => {
    let live = true;
    setSelector(null); setSelectorError(false);
    const links = new URLSearchParams(window.location.search).getAll('response_id');
    if (links.length > 1 || (links.length === 1 && (!links[0] || links[0].length > 128))) {
      setSelectorError(true); setSelection(''); return;
    }
    const linked = links[0];
    getRequestThreadSelector(requestId, linked).then(value => {
      if (!live || !alive()) return;
      setSelector(value);
      // A deep link never falls back to another response.
      setSelection(linked ?? (value.side === 'seller' ? value.threads[0]?.response_id ?? '' : ''));
    }).catch(() => { if (live && alive()) { setSelectorError(true); setSelection(''); } });
    return () => { live = false; };
  }, [requestId, quoteRevision, reload]);
  useEffect(() => {
    if (!selection || !selector?.threads.some(t => t.response_id === selection)) return;
    let live = true;
    const admitted = epoch.current;
    setReading(true); setHistory(null); setReadError(false);
    getRequestThreadMessages(requestId, selection).then(value => {
      if (live && alive() && admitted === epoch.current) setHistory(value);
    }).catch(() => { if (live && alive() && admitted === epoch.current) setReadError(true); })
      .finally(() => { if (live && alive() && admitted === epoch.current) setReading(false); });
    return () => { live = false; };
  }, [selection, selector, reload]);
  const closed = ['closed', 'expired', 'fulfilled'].includes(requestStatus);
  const allowed = !closed && selector?.availability === 'enabled' && selector.threads.some(t => t.response_id === selection && t.can_send) && history?.can_send === true && !readError;
  function changeThread(value: string) {
    // Departure hides history immediately; pending commands retain their original target.
    epoch.current++; current.current = value; setHistory(null); setDraft(''); setAttempt(null); setSelection(value);
  }
  async function execute(mode: 'send' | 'retry' | 'check') {
    if (!alive() || !selection || attempt?.busy || !history || (mode !== 'check' && !allowed)) return;
    const saved = pending.current.get(selection);
    if (saved?.busy || (mode === 'send' && saved)) return;
    const next: Attempt = saved ?? { command: { response_id: selection, client_message_nonce: crypto.randomUUID(), content: draft }, state: 'unknown', busy: false };
    if (mode !== 'send' && !saved) return;
    if (mode === 'send' && (!draft.trim() || draft.length > 5000)) return;
    const flight = Symbol(); next.flight = flight;
    next.busy = true; pending.current.set(selection, next); setAttempt({ ...next }); setNotice('');
    const admitted = epoch.current;
    const matches = () => next.flight === flight && alive() && admitted === epoch.current && current.current === next.command.response_id;
    try {
      const result = await (mode === 'check' ? reconcileRequestThreadMessage(requestId, next.command) : sendRequestThreadMessage(requestId, next.command, () => {
        if (!matches() || ['closed', 'expired', 'fulfilled'].includes(currentStatus.current)) throw new Error('Conversation changed');
      }));
      if (!matches()) return;
      // Defense in depth for mocked/alternative transports as well as the API parser.
      if (result.request_id !== requestId || result.response_id !== next.command.response_id || result.client_message_nonce !== next.command.client_message_nonce || (next.digest && next.digest !== result.command_digest)) throw new Error('Unmatched result');
      next.digest = result.command_digest; next.state = result.state;
      if (['sent', 'held', 'clarification_requested', 'refused', 'unusable'].includes(result.state)) {
        pending.current.delete(selection); setDraft('');
        if (result.state === 'sent' && result.message) setHistory(old => old ? { ...old, items: [...old.items.filter(m => m.id !== result.message!.id), result.message!] } : old);
        // Completed attempts retain no original content.
        setAttempt(null); setNotice(resultText[result.state]);
      } else { next.busy = false; setAttempt({ ...next }); }
    } catch (error) {
      if (!matches()) return;
      next.state = 'unknown'; next.busy = false; setAttempt({ ...next });
      const response = (error as { response?: { status?: number } }).response;
      if (response?.status === 409) setNotice('This message differs from the saved attempt. Sending is not confirmed. Check the result before trying again.');
      else if ([401, 403, 404, 410].includes(response?.status ?? 0)) {
        setHistory(null); setReadError(true); setNotice('This conversation is unavailable. Delivery is not confirmed.');
      } else if (response?.status === 429) setNotice('Too many attempts. Wait before checking the result. Delivery is not confirmed.');
    } finally {
      if (next.flight === flight) next.busy = false;
      // A late result cannot change another thread, including a later visit to the same one.
    }
  }
  async function loadMore() {
    if (!history?.next_cursor || reading || !alive()) return;
    const admitted = epoch.current; setReading(true);
    try {
      const page = await getRequestThreadMessages(requestId, selection, history.next_cursor);
      if (alive() && admitted === epoch.current) setHistory(old => old ? { ...page, items: [...old.items, ...page.items.filter(m => !old.items.some(x => x.id === m.id))] } : page);
    } catch { if (alive() && admitted === epoch.current) setReadError(true); }
    finally { if (alive() && admitted === epoch.current) setReading(false); }
  }
  return <section aria-labelledby="private-conversation-heading" className="mb-6 rounded-xl border border-gray-200 p-6 space-y-4">
    <h2 id="private-conversation-heading" className="text-lg font-semibold text-gray-900">Private conversation</h2>
    <p className="text-sm text-gray-600">Messages are checked before sending. Only approved text appears in this conversation. Email availability does not affect in-app access.</p>
    {selectorError ? <><p role="alert">Private conversations are currently unavailable.</p><button className={button} onClick={() => setReload(x => x + 1)}>Reload conversations</button></> : !selector ? <p role="status">Loading conversations…</p> : <>
      {selector.side === 'buyer' ? <label className="block text-sm font-medium">Response for private conversation<select aria-label="Response for private conversation" className="block w-full rounded-lg border border-gray-300 p-2 mt-1" value={selection} onChange={e => changeThread(e.target.value)}><option value="">Choose a response</option>{selector.threads.map((t, i) => <option key={t.response_id} value={t.response_id}>Response {i + 1} · {t.response_id}</option>)}</select></label> : <p className="text-sm">Your response conversation</p>}
      {!selector.threads.length && <p>No response conversation is available yet.</p>}
      {selector.availability !== 'enabled' && <p role="status">Sending private messages is currently unavailable.</p>}
      {selection && <>
        {reading && <p role="status">Loading messages…</p>}
        {readError && <p role="alert">Messages could not be loaded. This does not confirm whether your last message was sent.</p>}
        <button type="button" className={button} onClick={() => setReload(x => x + 1)}>Refresh conversation</button>
        {history && <><ol aria-label="Private messages" className="space-y-3">{history.items.map(m => <li key={m.id} className="rounded-lg bg-gray-50 p-3"><span className="text-xs font-medium text-gray-500">{m.role === 'system' ? 'Update' : m.role === selector.side ? 'You' : 'Other participant'}</span><p className="whitespace-pre-wrap text-sm text-gray-800">{m.content}</p></li>)}</ol>{!history.items.length && <p>No messages in this conversation.</p>}{history.next_cursor && <button className={button} disabled={reading} onClick={loadMore}>Load more messages</button>}</>}
        {closed && <p>This request is {requestStatus}. New messages cannot be sent.</p>}
        {history && !closed && !history.can_send && <p>New messages are not available for this conversation.</p>}
        <form aria-label="Private message" onSubmit={e => { e.preventDefault(); void execute('send'); }} className="space-y-3">
          <label htmlFor="private-request-message" className="block text-sm font-medium">Private message for selected response</label>
          <textarea id="private-request-message" rows={4} maxLength={5000} value={draft} readOnly={!!attempt} onChange={e => setDraft(e.target.value)} className="w-full rounded-lg border border-gray-300 p-3 focus:ring-2 focus:ring-[#3F51B5]" />
          {!attempt && <button type="submit" className={`${button} bg-[#3F51B5] text-white`} disabled={!allowed || !draft.trim()}>Send private message</button>}
        </form>
        {attempt && <><p role="status" tabIndex={-1} ref={resultFocus}>{attempt.busy ? 'Checking message… Delivery is not confirmed.' : resultText[attempt.state]}</p><button type="button" className={button} disabled={attempt.busy || !history} onClick={() => void execute('check')}>Check message result</button>{['unknown', 'processing_failed'].includes(attempt.state) && <button type="button" className={button} disabled={attempt.busy || !allowed} onClick={() => void execute('retry')}>Retry same message</button>}</>}
        {notice && <p role="status" tabIndex={-1} ref={resultFocus}>{notice}</p>}
      </>}
    </>}
  </section>;
}
