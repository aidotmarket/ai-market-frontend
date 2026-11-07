'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ISSUE_CATEGORIES, type IssueDraft, type CustomerConversation } from '@/api/support';
import type { OrderIssueSession } from '@/lib/order-issue-report';
import { CustomerTicketStatus } from './TicketStatusCard';
import { CustomerSupportMessage } from './AllAIMessage';

const fieldClass = 'block w-full rounded-lg border border-white/20 bg-slate-950 px-3 py-2 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300';
const buttonClass = 'rounded-lg border border-white/30 px-3 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-blue-300';
const categoryLabel = (value: string) => value.replaceAll('_', ' ');

export function SupportEmailStatus({ state }: { state: string }) {
  const labels: Record<string, string> = {
    confirmation_needed: 'Email confirmation needed; your report is saved and work continues. Important email is pending. Use the separate mailbox confirmation flow when available.',
    pending: 'Important email is pending.',
    accepted: 'Email was accepted for sending. Customer receipt is not established by email acceptance.',
    failed: 'Email delivery failed; in-app support remains available.',
    unknown: 'Email delivery is unknown; in-app support remains available.',
  };
  return <p role="status" className="text-sm text-amber-100">{labels[state] ?? labels.unknown}</p>;
}

function SupportConversation({ session }: { session: OrderIssueSession }) {
  const confirmation = session.getSnapshot().proposal!.confirmation!;
  const [conversation, setConversation] = useState<CustomerConversation | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unknown, setUnknown] = useState(false);
  const pending = useRef<{ body: string; nonce: string } | null>(null);
  const alive = useRef(true);
  const current = () => alive.current && session.current();
  const accept = (value: CustomerConversation) => {
    if (!current()) return;
    if (value.public_ref !== confirmation.public_ref || value.conversation_id !== confirmation.conversation_id)
      throw new Error('SUPPORT_WIRE_INVALID');
    setConversation(value);
  };
  async function load(cursor?: string) {
    if (!current() || busy) return;
    setBusy(true); setError(null);
    try {
      const value = await session.port.conversation(confirmation.public_ref, cursor);
      if (!current()) return;
      if (cursor && conversation) {
        const versions = new Map(conversation.messages.map(m => [m.id + ':' + m.version, m]));
        value.messages.forEach(m => versions.set(m.id + ':' + m.version, m));
        accept({ ...value, messages: [...versions.values()] });
      } else accept(value);
      setUnknown(false);
    } catch { if (current()) setError('Conversation could not be loaded. Your ticket is retained.'); }
    finally { if (current()) setBusy(false); }
  }
  useEffect(() => {
    alive.current = true; void load();
    return () => { alive.current = false; pending.current = null; };
    // A new original ticket remounts this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, confirmation.public_ref]);
  async function send() {
    if (!current() || busy || unknown || !body.trim() || body.length > 4000) return;
    if (!pending.current || pending.current.body !== body) pending.current = { body, nonce: crypto.randomUUID() };
    const command = pending.current;
    setBusy(true); setError(null);
    try {
      const value = await session.port.reply(confirmation.public_ref, command.nonce, command.body);
      if (!current()) return;
      accept(value); setBody(''); pending.current = null;
    } catch {
      if (current()) { setUnknown(true); setError('Reply result is unknown. Read the original conversation before retrying the same reply.'); }
    } finally { if (current()) setBusy(false); }
  }
  if (!session.current()) return null;
  return <section aria-label="Original private support conversation" className="space-y-3">
    <CustomerTicketStatus publicRef={confirmation.public_ref} status={conversation?.status ?? confirmation.status}
      nextAction={conversation?.next_action ?? confirmation.next_action} />
    <SupportEmailStatus state={conversation?.email_state ?? confirmation.email_state} />
    {error && <p role="alert">{error}</p>}
    <button className={buttonClass} disabled={busy} onClick={() => void load()}>Refresh conversation</button>
    <div role="log" aria-label="Private support messages" className="space-y-3">
      {(conversation?.messages ?? [confirmation.acknowledgement]).map(message =>
        <CustomerSupportMessage key={message.id + ':' + message.version} message={message}
          current={current} onRendered={() => session.port.receipt(confirmation.public_ref, message.id, message.version)} />)}
    </div>
    {conversation?.next_cursor && <button className={buttonClass} disabled={busy}
      onClick={() => void load(conversation.next_cursor!)}>Load more messages</button>}
    <label className="block">Reply or report that the fix still fails
      <textarea className={fieldClass} value={body} maxLength={4000} disabled={busy || unknown}
        onChange={e => setBody(e.target.value)} />
    </label>
    <button className={buttonClass} disabled={busy || unknown || !body.trim()} onClick={() => void send()}>Send reply</button>
    {unknown && <p>Read the conversation to reconcile the reply. A retry retains the same reply nonce; it never closes or claims a fix.</p>}
  </section>;
}

export default function OrderIssueReport({ session, onLeave }: { session: OrderIssueSession; onLeave: () => void }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const [turn, setTurn] = useState('');
  const [copyReviewed, setCopyReviewed] = useState(false);
  const descriptionInput = useRef<HTMLTextAreaElement>(null);
  const focused = useRef(false);
  const [, tick] = useState(0);
  useEffect(() => { const timer = setInterval(() => tick(n => n + 1), 30000); return () => clearInterval(timer); }, []);
  const { proposal, draft, busy, saved, reviewed, reconcile, error, surface } = state;
  useEffect(() => {
    if (proposal && !busy && !focused.current) {
      descriptionInput.current?.focus(); focused.current = true;
    }
  }, [proposal, busy]);
  if (state.retired || !session.current()) return null;
  const expired = !!proposal && !proposal.confirmation && Date.parse(proposal.expires_at) <= Date.now();
  const disabled = busy || reconcile || expired;
  const guidanceAvailable = proposal?.guidance_state === 'available' && proposal.guidance_turns < 20 && proposal.guidance_bytes < 65536;
  function edit(patch: Partial<IssueDraft>) { session.edit({ ...draft, ...patch }); }
  return <div className="flex-1 overflow-y-auto space-y-4 p-5 text-sm text-white/90" aria-label="Private order issue report">
    <h3 className="font-semibold">Report an order issue</h3>
    <button className={buttonClass} onClick={onLeave}>Return to general allAI</button>
    {error && <p role="alert">{error}</p>}
    <p role="status">{busy ? 'Saving or recovering…' : proposal?.confirmation ? 'Report confirmed' : saved ? 'Draft saved; not reported' : 'Unsaved draft; not reported'}</p>
    {reconcile && <p>Recover the server version before making another change. No action will be replayed automatically.</p>}
    <button className={buttonClass} disabled={busy} onClick={() => void session.recover()}>Recover saved proposal</button>
    {!proposal && <p>Private order context loads only after the authenticated proposal is authorized. Order reporting may be unavailable. Existing support: support@ai.market.</p>}
    {proposal?.confirmation ? <>
      <h4>Original confirmed report</h4>
      <a className="text-blue-300 underline" href={'/dashboard/orders/' + encodeURIComponent(session.orderId) + '?issue_report=' + encodeURIComponent(proposal.proposal_id)}>Link to this original report and conversation</a>
      <p className="capitalize">{categoryLabel(proposal.confirmation.original.category)}</p>
      <p className="whitespace-pre-wrap break-words">{proposal.confirmation.original.description}</p>
      {proposal.confirmation.original.browser && <p>{proposal.confirmation.original.browser}</p>}
      {proposal.confirmation.original.error && <p>{proposal.confirmation.original.error}</p>}
      <SupportConversation key={proposal.confirmation.public_ref} session={session} />
      <button className={buttonClass} disabled={busy} onClick={() => void session.newReport()}>Start a distinct new report</button>
    </> : <>
      {proposal && <details><summary>Order context supplied by the server</summary><dl>
        {Object.entries(proposal.context).map(([key, value]) => <div key={key}>
          <dt>{categoryLabel(key)}</dt><dd className="break-words">{value === null ? 'Not available' : String(value)}</dd>
        </div>)}
      </dl></details>}
      {proposal && proposal.enrollment !== 'enabled' && <p role="status">New order reporting is unavailable or not confirmed available. Your draft can be retained. Existing support: support@ai.market.</p>}
      {surface === 'allai' && proposal && <section aria-label="Private allAI guidance" className="space-y-2">
        <p>Describe the symptom, what you expected, and what happened. You can edit and send the report anyway.</p>
        {proposal.guidance.map(g => <p key={g.id} className="whitespace-pre-wrap break-words">{g.body}</p>)}
        {!guidanceAvailable && <p>Guidance is unavailable or has reached its limit. Continue with the editable form using the same report command.</p>}
        <label>Ask allAI about this report<textarea className={fieldClass} value={turn} maxLength={4000}
          disabled={disabled || !guidanceAvailable} onChange={e => setTurn(e.target.value)} /></label>
        <button className={buttonClass} disabled={disabled || !guidanceAvailable || !saved || !turn.trim()}
          onClick={() => { void session.guide(turn); setTurn(''); }}>Send to private guidance</button>
      </section>}
      {state.guidanceRetry && <button className={buttonClass} disabled={busy || reconcile}
        onClick={() => void session.retryGuidance()}>Retry prior guidance turn</button>}
      <button className={buttonClass} disabled={disabled || surface === 'web'} onClick={session.plain}>Use plain form / send report anyway</button>
      <fieldset disabled={disabled} className="space-y-3">
        <legend className="sr-only">Editable report</legend>
        <label className="block">Category<select className={fieldClass} value={draft.category}
          onChange={e => edit({ category: e.target.value as IssueDraft['category'] })}>
          {ISSUE_CATEGORIES.map(c => <option key={c} value={c}>{categoryLabel(c)}</option>)}
        </select></label>
        <label className="block">Description<textarea ref={descriptionInput} data-allai-autofocus="true" className={fieldClass} maxLength={4000}
          value={draft.description} onChange={e => edit({ description: e.target.value })} /></label>
        {draft.category === 'download_delivery' && <>
          <label className="block">Browser<input className={fieldClass} maxLength={100} value={draft.browser ?? ''}
            onChange={e => edit({ browser: e.target.value })} /></label>
          <label className="block">Error shown<textarea className={fieldClass} maxLength={1000} value={draft.error ?? ''}
            onChange={e => edit({ error: e.target.value })} /></label>
        </>}
        <button className={buttonClass} disabled={!proposal || !draft.description.trim() || saved} onClick={() => void session.save()}>Save draft</button>
        <label className="flex gap-2"><input type="checkbox" checked={reviewed} disabled={!saved}
          onChange={e => session.review(e.target.checked)} />I have reviewed this exact saved report and want to file it.</label>
        <button className={buttonClass} disabled={!proposal || !saved || !reviewed || proposal.enrollment !== 'enabled'}
          onClick={() => void session.confirm()}>Confirm and file report</button>
      </fieldset>
      {expired && <section className="space-y-2">
        <p>Filing expired after 24 hours. Your draft remains saved. Copy it to a new authorized proposal, save, and review again.</p>
        <label><input type="checkbox" checked={copyReviewed} onChange={e => setCopyReviewed(e.target.checked)} /> Copy this draft to a new proposal</label>
        <button className={buttonClass} disabled={!copyReviewed || busy || reconcile}
          onClick={() => { setCopyReviewed(false); void session.copyExpired(); }}>Create authorized copy</button>
      </section>}
    </>}
  </div>;
}
