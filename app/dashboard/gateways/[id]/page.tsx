'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { getCapabilities } from '@/api/capabilities';
import { gatewayErrorCode } from '@/api/gatewayDelivery';
import { acknowledgeGatewayIdentity, describeGatewayFile, gatewayErrorDetails, getGatewayFile, getSellerGateway, listGatewayFiles, listReceivedMessages, listSellerGateways, patchSellerGateway, revokeSellerGateway, startDoorCheck } from '@/api/sellerGateways';
import { blockerMessage, dateLabel, DESCRIPTION_CONFIRMATION, descriptionFailure, doorFailure, gatewaySummary } from '@/components/gateways/presentation';
import type { GatewayFile, GatewayMessageType, ReceivedMessage, SellerGateway } from '@/types/sellerGateway';

const MESSAGE_TYPES: GatewayMessageType[] = ['hello', 'inventory', 'description', 'receipt', 'canary_result', 'offer_ack', 'prepare_ack', 'revocation_ack', 'error'];
const revokeEffect = 'Revoking stops new permissions and offers and unlists this gateway’s listings. Orders with undelivered files become blocked and a delivery problem freezes payout until support resolves or refunds them. Already bound permissions may finish before their deadline.';
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export default function GatewayPage() {
  const { id } = useParams<{ id: string }>();
  const { hydrated, isAuthenticated } = useAuthStore();
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [gateway, setGateway] = useState<SellerGateway | null>(null);
  const [files, setFiles] = useState<GatewayFile[]>([]);
  const [fileCursor, setFileCursor] = useState<string | null>(null);
  const [messages, setMessages] = useState<ReceivedMessage[]>([]);
  const [messageCursor, setMessageCursor] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<GatewayMessageType | ''>('');
  const [name, setName] = useState('');
  const [doorUrl, setDoorUrl] = useState('');
  const [ackChecked, setAckChecked] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [openOrders, setOpenOrders] = useState<number | null>(null);
  const [confirmFile, setConfirmFile] = useState<GatewayFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doorError, setDoorError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const alive = useRef(true);
  const currentId = useRef(id);
  const doorRun = useRef(0);
  const doorWaitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRuns = useRef(new Map<string, number>());
  const fileRetryDelay = useRef(new Map<string, number>());
  const isCurrent = useCallback((requestId: string) => alive.current && currentId.current === requestId, []);

  const updateFile = useCallback((file: GatewayFile) => {
    setFiles(current => current.map(item => item.file_id === file.file_id ? file : item));
  }, []);

  const loadMessages = useCallback(async (cursor?: string, type: GatewayMessageType | '' = '') => {
    const page = await listReceivedMessages(id, cursor, 100, type || undefined);
    if (isCurrent(id)) {
      setMessages(current => cursor ? [...current, ...page.messages] : page.messages);
      setMessageCursor(page.next_cursor);
    }
  }, [id, isCurrent]);

  const pollDoor = useCallback((delay = 2) => {
    if (!alive.current || currentId.current !== id) return;
    if (doorWaitTimer.current) clearTimeout(doorWaitTimer.current);
    const run = ++doorRun.current;
    const deadline = Date.now() + 30_000;
    async function poll() {
      let refreshFailed = false;
      while (alive.current && currentId.current === id && doorRun.current === run) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) break;
        const refreshDue = delay * 1000 <= remaining;
        await new Promise<void>(resolve => { doorWaitTimer.current = setTimeout(resolve, Math.min(delay * 1000, remaining)); });
        doorWaitTimer.current = null;
        if (!alive.current || currentId.current !== id || doorRun.current !== run) return;
        if (!refreshDue) break;
        try {
          const result = await getSellerGateway(id);
          if (!alive.current || currentId.current !== id || doorRun.current !== run) return;
          setGateway(result);
          if (result.door_check.state !== 'pending') { setDoorError(null); return; }
          refreshFailed = false;
        } catch {
          refreshFailed = true;
        }
        delay = 2;
      }
      if (alive.current && currentId.current === id && doorRun.current === run) setDoorError(refreshFailed ? 'The door check could not be refreshed. Try again.' : 'The check is still pending. Refresh to see its result.');
    }
    void poll();
  }, [id]);

  useEffect(() => {
    currentId.current = id;
    alive.current = true;
    let cancelled = false;
    setState('loading'); setGateway(null); setFiles([]); setFileCursor(null); setMessages([]); setMessageCursor(null);
    setName(''); setDoorUrl(''); setMessageType(''); setError(null); setDoorError(null); setFileError(null);
    setAckChecked(false); setConfirmRevoke(false); setOpenOrders(null); setConfirmFile(null);
    fileRetryDelay.current.clear();
    if (!hydrated || !isAuthenticated) return;
    async function load() {
      try {
        const capabilities = await getCapabilities();
        if (capabilities.seller.effective_status !== 'active') throw new Error('seller inactive');
        // A list failure, including gateway_disabled, hides this page's gateway content.
        await listSellerGateways();
        const [item, filePage] = await Promise.all([getSellerGateway(id), listGatewayFiles(id)]);
        if (cancelled || !isCurrent(id)) return;
        setGateway(item); setName(item.name); setDoorUrl(item.door_url ?? '');
        setFiles(filePage.files); setFileCursor(filePage.next_cursor); setState('ready');
        if (item.door_check.state === 'pending') pollDoor();
        await loadMessages();
      } catch { if (!cancelled && isCurrent(id)) setState('unavailable'); }
    }
    void load();
    return () => { cancelled = true; alive.current = false; doorRun.current++; if (doorWaitTimer.current) clearTimeout(doorWaitTimer.current); doorWaitTimer.current = null; fileRuns.current.clear(); };
  }, [hydrated, isAuthenticated, id, isCurrent, loadMessages, pollDoor]);

  useEffect(() => {
    if (state !== 'ready') return;
    for (const file of files) {
      if (file.description.state !== 'requested' || fileRuns.current.has(file.file_id)) continue;
      const run = Date.now() + Math.random();
      fileRuns.current.set(file.file_id, run);
      async function poll() {
        let delay = fileRetryDelay.current.get(file.file_id) ?? 10;
        while (alive.current && fileRuns.current.get(file.file_id) === run) {
          await wait(delay * 1000);
          if (!alive.current || fileRuns.current.get(file.file_id) !== run) break;
          try {
            const response = await getGatewayFile(id, file.file_id);
            if (!alive.current || currentId.current !== id || fileRuns.current.get(file.file_id) !== run) break;
            updateFile(response.data);
            if (response.data.description.state !== 'requested') break;
            delay = response.retryAfter ?? 10;
          } catch { if (isCurrent(id) && fileRuns.current.get(file.file_id) === run) setFileError('We could not refresh the file. Try again.'); break; }
        }
        if (fileRuns.current.get(file.file_id) === run) fileRuns.current.delete(file.file_id);
      }
      void poll();
    }
  }, [files, id, isCurrent, state, updateFile]);

  async function saveName() {
    const requestId = id;
    setError(null);
    if (!name.trim() || name.length > 80) { setError('Enter a name of 1 to 80 characters.'); return; }
    try { const result = await patchSellerGateway(requestId, { name: name.trim() }); if (isCurrent(requestId)) setGateway(result); }
    catch { if (isCurrent(requestId)) setError('We could not save the name. Try again.'); }
  }
  async function saveDoor() {
    const requestId = id;
    setDoorError(null);
    if (doorUrl && !doorUrl.startsWith('https://')) { setDoorError('Use an https URL.'); return; }
    try {
      const result = await patchSellerGateway(requestId, { door_url: doorUrl || null });
      if (!isCurrent(requestId)) return;
      setGateway(result); setDoorUrl(result.door_url ?? '');
      if (result.door_check.state === 'pending') pollDoor();
      else { doorRun.current++; if (doorWaitTimer.current) clearTimeout(doorWaitTimer.current); doorWaitTimer.current = null; }
    } catch (cause) {
      if (!isCurrent(requestId)) return;
      setDoorError(({
        door_url_not_https: 'Use an https URL.',
        door_url_invalid: 'Enter a valid public door URL.',
      } as Record<string, string>)[gatewayErrorCode(cause) ?? ''] ?? 'We could not save the door URL. Try again.');
    }
  }
  async function checkDoor() {
    const requestId = id;
    setDoorError(null);
    try {
      const started = await startDoorCheck(requestId);
      if (!isCurrent(requestId)) return;
      setGateway(current => current ? { ...current, door_check: started.data.door_check } : current);
      if (started.data.door_check.state === 'pending') pollDoor(started.retryAfter ?? 2);
      else { doorRun.current++; if (doorWaitTimer.current) clearTimeout(doorWaitTimer.current); doorWaitTimer.current = null; }
    } catch (cause) {
      if (!isCurrent(requestId)) return;
      setDoorError(({
        door_check_rate_limited: 'A door check was run recently. Wait a minute and try again.',
        door_url_missing: 'Add a door URL before running a check.',
      } as Record<string, string>)[gatewayErrorCode(cause) ?? ''] ?? 'The door check could not start. Try again.');
    }
  }
  async function acknowledge() {
    if (!ackChecked) return;
    const requestId = id;
    setError(null);
    try { const result = await acknowledgeGatewayIdentity(requestId); if (isCurrent(requestId)) setGateway(result); }
    catch { if (isCurrent(requestId)) setError('We could not save your acknowledgement. Try again.'); }
  }
  async function revoke(confirmed = false) {
    const requestId = id;
    setError(null);
    try {
      await revokeSellerGateway(requestId, confirmed);
      if (!isCurrent(requestId)) return;
      doorRun.current++;
      if (doorWaitTimer.current) clearTimeout(doorWaitTimer.current);
      doorWaitTimer.current = null;
      try { const result = await getSellerGateway(requestId); if (!isCurrent(requestId)) return; setGateway(result); }
      catch { if (!isCurrent(requestId)) return; setGateway(current => current ? { ...current, status: 'revoked', status_reason: null, blockers: [{ code: 'gateway_revoked' }], can_publish: false } : current); }
      setConfirmRevoke(false); setOpenOrders(null);
    } catch (cause) {
      if (!isCurrent(requestId)) return;
      if (gatewayErrorCode(cause) === 'gateway_has_open_orders') {
        setOpenOrders(gatewayErrorDetails(cause)?.open_order_count ?? gateway?.open_order_count ?? 0);
      } else setError('We could not revoke this gateway. Try again.');
    }
  }
  async function describe() {
    if (!confirmFile) return;
    const requestId = id;
    setFileError(null);
    try {
      const response = await describeGatewayFile(requestId, confirmFile.file_id);
      if (!isCurrent(requestId)) return;
      fileRetryDelay.current.set(confirmFile.file_id, response.retryAfter ?? 10);
      updateFile(response.data);
      setConfirmFile(null);
    }
    catch (cause) {
      if (!isCurrent(requestId)) return;
      setFileError(({
        gateway_offline: 'The gateway is offline. Reconnect it and try again.',
        already_described: 'This file is already described. Refresh to see it.',
        confirmation_required: 'Confirm the description before requesting it.',
      } as Record<string, string>)[gatewayErrorCode(cause) ?? ''] ?? 'We could not request the description. Try again.');
    }
  }

  if (state === 'loading') return <p>Loading…</p>;
  if (state === 'unavailable' || !gateway) return <p>Gateways are not available.</p>;
  const sortedMessages = [...messages].sort((a, b) => a.seq - b.seq);
  return <div className="space-y-8">
    <Link href="/dashboard/gateways" className="text-indigo-700 underline">Back to gateways</Link>
    <header><h1 className="text-2xl font-semibold">{gateway.name}</h1><p>Status: {gatewaySummary(gateway)}</p><p>Version: {gateway.version ?? 'Unknown'} / minimum {gateway.minimum_version}</p><p>Last seen: {dateLabel(gateway.last_seen_at)}</p><p>Listings: {gateway.listing_count} · Open orders: {gateway.open_order_count} · Can publish: {gateway.can_publish ? 'Yes' : 'No'}</p></header>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <section><h2 className="text-xl font-semibold">What needs attention</h2>{gateway.blockers.length ? <ul className="list-disc pl-6">{gateway.blockers.map((blocker, index) => <li key={`${blocker.code}-${blocker.file_id ?? index}`}>{blockerMessage(blocker, files)}</li>)}</ul> : <p>No blockers.</p>}</section>
    {gateway.status !== 'revoked' && <>
      <section className="space-y-3"><h2 className="text-xl font-semibold">Settings</h2>
        <label className="block">Gateway name <input className="block w-full rounded border p-2" maxLength={80} value={name} onChange={event => setName(event.target.value)} /></label>
        <button type="button" className="rounded border px-3 py-2" onClick={saveName}>Save name</button>
        <label className="block">Door URL <input className="block w-full rounded border p-2" type="url" value={doorUrl} onChange={event => setDoorUrl(event.target.value)} placeholder="https://door.example.com" /></label>
        <p>Changing the door URL resets its door check. Run a new check before publishing.</p>
        <button type="button" className="rounded border px-3 py-2" onClick={saveDoor}>Save door URL</button>
        {doorError && <p role="alert" className="text-red-700">{doorError}</p>}
      </section>
      <section className="space-y-2"><h2 className="text-xl font-semibold">Door check</h2>
        <p>State: {gateway.door_check.state} · Checked: {dateLabel(gateway.door_check.checked_at)}</p>
        {doorFailure(gateway.door_check.failure_code) && <p role="alert">{doorFailure(gateway.door_check.failure_code)}</p>}
        <button type="button" onClick={checkDoor} className="rounded border px-3 py-2">Run door check</button>
      </section>
      <section className="space-y-2"><h2 className="text-xl font-semibold">Identity notice</h2>
        <p>After purchase, the buyer learns your door hostname and its certificate. Your door sees the buyer’s network address. Use a neutral hostname and a domain-validated certificate that names nothing else.</p>
        {gateway.door_check.certificate_flags.includes('organization_in_subject') && <p role="status">Certificate warning: the subject names an organization. This does not block publishing.</p>}
        {gateway.door_check.certificate_flags.includes('extra_subject_alt_names') && <p role="status">Certificate warning: the certificate names hosts besides this door. This does not block publishing.</p>}
        {gateway.door_check.certificate_flags.filter(flag => !['organization_in_subject', 'extra_subject_alt_names'].includes(flag)).map(flag => <p role="status" key={flag}>Certificate warning: review the door certificate.</p>)}
        {gateway.identity_ack_at ? <p>Acknowledged: {dateLabel(gateway.identity_ack_at)}</p> : <><label className="block"><input type="checkbox" checked={ackChecked} onChange={event => setAckChecked(event.target.checked)} /> I have read the identity notice.</label><button type="button" disabled={!ackChecked} className="rounded border px-3 py-2 disabled:opacity-50" onClick={acknowledge}>Acknowledge notice</button></>}
      </section>
      <section className="space-y-2"><h2 className="text-xl font-semibold">Revoke gateway</h2>
        <button type="button" className="rounded border border-red-700 px-3 py-2 text-red-700" onClick={() => setConfirmRevoke(true)}>Revoke gateway</button>
        {confirmRevoke && <div role="dialog" aria-label="Confirm revocation" className="rounded border p-4"><p>{revokeEffect}</p>{openOrders !== null && <p role="alert">{openOrders} open orders have undelivered files. Confirm to revoke anyway.</p>}<button type="button" className="rounded bg-red-700 px-3 py-2 text-white" onClick={() => revoke(openOrders !== null)}>Confirm revoke</button><button type="button" className="ml-2 rounded border px-3 py-2" onClick={() => { setConfirmRevoke(false); setOpenOrders(null); }}>Cancel</button></div>}
      </section>
    </>}
    <section className="space-y-3"><h2 className="text-xl font-semibold">Files</h2>
      {fileError && <p role="alert" className="text-red-700">{fileError}</p>}
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Name', 'Size', 'Media type', 'Present', 'Changed', 'Description', 'Offerable', 'Action'].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead><tbody>{files.map(file => <tr key={file.file_id} className="border-t align-top">
        <td className="p-2">{file.display_name}</td><td className="p-2">{file.size_bytes.toLocaleString()} bytes</td><td className="p-2">{file.media_type}</td><td className="p-2">{file.present ? 'Yes' : 'No'}</td><td className="p-2">{dateLabel(file.changed_at)}</td><td className="p-2">{file.description.state}{file.description.state === 'stale' && '. Describe again.'}{file.description.state === 'failed' && `: ${descriptionFailure(file.description.failure_code)}`}</td><td className="p-2">{file.offerable ? 'Yes' : 'No'}</td><td className="p-2">{file.description.state !== 'described' && file.description.state !== 'requested' && gateway.status !== 'revoked' && <button type="button" onClick={() => setConfirmFile(file)} className="text-indigo-700 underline">{file.description.state === 'stale' ? 'Describe again' : 'Describe'}</button>}</td>
      </tr>)}</tbody></table></div>
      {files.map(file => file.description.state === 'described' && <div key={`${file.file_id}-description`} className="rounded border p-3"><h3 className="font-semibold">{file.display_name} description</h3><p>Rows: {file.description.row_count} · SHA-256: <code>{file.description.sha256}</code></p><table className="text-left text-sm"><thead><tr><th className="p-2">Column</th><th className="p-2">Type</th><th className="p-2">Null rate</th><th className="p-2">Distinct count</th></tr></thead><tbody>{file.description.columns.map((column, index) => <tr key={`${column.name}-${index}`}><td className="p-2">{column.name}</td><td className="p-2">{column.type}</td><td className="p-2">{column.null_rate_pct === null ? 'Unknown' : `${column.null_rate_pct}%`}</td><td className="p-2">{column.distinct_bucket}</td></tr>)}</tbody></table></div>)}
      {fileCursor && <button type="button" className="rounded border px-3 py-2" onClick={async () => { const requestId = id; try { const page = await listGatewayFiles(requestId, fileCursor); if (!isCurrent(requestId)) return; setFiles(current => [...current, ...page.files]); setFileCursor(page.next_cursor); } catch { if (isCurrent(requestId)) setFileError('We could not load more files. Try again.'); } }}>Load more files</button>}
      {confirmFile && <div role="dialog" aria-label="Confirm description" className="space-y-3 rounded border p-4"><p>{DESCRIPTION_CONFIRMATION}</p><p>Preview locally: <code>aim-gateway preview {confirmFile.file_id}</code></p><button type="button" className="rounded bg-indigo-700 px-3 py-2 text-white" onClick={describe}>Confirm describe</button><button type="button" className="ml-2 rounded border px-3 py-2" onClick={() => setConfirmFile(null)}>Cancel</button></div>}
    </section>
    <section className="space-y-3"><h2 className="text-xl font-semibold">What we receive</h2>
      <label>Message type <select value={messageType} onChange={event => { const type = event.target.value as GatewayMessageType | ''; setMessageType(type); setMessages([]); setMessageCursor(null); void loadMessages(undefined, type).catch(() => { if (isCurrent(id)) setError('We could not load messages. Try again.'); }); }} className="ml-2 rounded border p-2"><option value="">All types</option>{MESSAGE_TYPES.map(type => <option key={type} value={type}>{type}</option>)}</select></label>
      <ol className="space-y-3">{sortedMessages.map((message, index) => <li key={message.seq}>{index > 0 && message.seq > sortedMessages[index - 1].seq + 1 && <p className="rounded bg-amber-50 p-2">Messages {sortedMessages[index - 1].seq + 1} to {message.seq - 1} {messageType ? 'not shown by this filter or missing' : 'missing'}</p>}<article className="rounded border bg-white p-3"><p>Seq {message.seq} · {message.message_type} · {dateLabel(message.received_at)}</p><pre className="overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(message.body, null, 2)}</pre></article></li>)}</ol>
      {messageCursor && <button type="button" className="rounded border px-3 py-2" onClick={() => void loadMessages(messageCursor, messageType).catch(() => { if (isCurrent(id)) setError('We could not load more messages. Try again.'); })}>Load more messages</button>}
    </section>
  </div>;
}
