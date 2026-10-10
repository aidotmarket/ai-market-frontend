'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { getSellerActivity, getSellerCapability, retrySellerFailures, sellerAdmissionEnabled, type SellerActivity } from '@/api/pending-actions';
import { PENDING_ACTION_CONTINUATION } from '@/lib/redirect';
import SellerOperationReceipt from './SellerOperationReceipt';

export default function SellerOperationActivity({ operationId, pendingId, token }: { operationId: string; pendingId: string; token: string }) {
  const [page, setPage] = useState<SellerActivity | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [selection, setSelection] = useState<string[]>([]);
  const [admission, setAdmission] = useState<unknown>(null);
  const [tick, setTick] = useState(0);
  const enabled = sellerAdmissionEnabled(admission);
  void tick;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [activityError, setActivityError] = useState('');
  const retrying = useRef(false);
  const [continuation, setContinuation] = useState('');
  // An ambiguous POST must never silently become a second request with a new key.
  const [attempted, setAttempted] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const read = async () => {
      try {
        const next = await getSellerActivity(operationId, cursor);
        if (!active) return;
        setPage(next); setActivityError('');
        // Selection is explicit and must still be failed in the current receipt.
        setSelection(selected => selected.filter(target => !next.items.some(item => item.target_id === target && item.status !== 'failed')));
      } catch { if (active) { setPage(null); setSelection([]); setActivityError('Activity is unavailable. Retrying…'); } }
      if (active) timer = setTimeout(read, 5000);
    };
    setPage(null); void read();
    return () => { active = false; alive.current = false; clearTimeout(timer); };
  }, [operationId, cursor]);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const read = async () => {
      if (retrying.current) { if (active) timer = setTimeout(read, 5000); return; }
      setAdmission(null);
      try {
        const admission = await getSellerCapability(pendingId, token);
        if (active) setAdmission(admission);
      } catch { if (active) setAdmission(null); }
      if (active) timer = setTimeout(read, 5000);
    };
    void read();
    const freshness = setInterval(() => setTick(value => value + 1), 1000);
    return () => { active = false; clearTimeout(timer); clearInterval(freshness); };
  }, [pendingId, token]);
  const retry = async () => {
    if (retrying.current || busy || attempted || !enabled || !selection.length || selection.length > 50 || !page
      || selection.some(target => page.items.some(item => item.target_id === target && item.status !== 'failed'))) return;
    retrying.current = true; setBusy(true); setError('');
    try {
      setAdmission(null);
      const capability = await getSellerCapability(pendingId, token);
      if (!alive.current || !sellerAdmissionEnabled(capability)) return;
      setAdmission(capability); setAttempted(true);
      const result = await retrySellerFailures(pendingId, token, selection, crypto.randomUUID());
      if (!alive.current) return;
      const url = result.outcome.confirmation_url;
      // Accept only the existing native signed continuation and its returned ID.
      let path = '';
      if (typeof url === 'string') {
        const parsed = new URL(url, window.location.origin);
        if (parsed.origin === window.location.origin && !parsed.hash && !parsed.username && !parsed.password) path = parsed.pathname + parsed.search;
      }
      const match = PENDING_ACTION_CONTINUATION.exec(path);
      if (result.pending && match && match[1].toLowerCase() === result.pending.id.toLowerCase()) setContinuation(path);
      else setError('No new review is available. Ask your assistant for a fresh explicit request.');
    } catch (cause) {
      if (!alive.current) return;
      const code = (cause as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      const messages: Record<string, string> = {
        FAILED_TARGETS_ONLY: 'Selection changed. Only currently failed members can be retried.',
        RETRY_TARGET_CHANGED: 'The publication version changed. Ask your assistant for a fresh request.',
        RETRY_REQUIRES_NEW_REQUEST: 'A fresh explicit connector request is required for these targets.',
        NEW_IDEMPOTENCY_KEY_REQUIRED: 'This key was already used. Recover the pending receipt before making another request.',
        SSO_REQUIRED: 'Sign in through your company from the complete batch review, then refetch before retrying.',
      };
      setError(messages[code || ''] || 'Retry could not be verified. Check pending requests before creating another retry.');
    } finally { retrying.current = false; if (alive.current) setBusy(false); }
  };
  return <section aria-label="Seller operation activity" className="space-y-4">
    <h3 className="font-semibold">Individual activity</h3>
    {page && <>
      <SellerOperationReceipt result={page.operation} />
      <ol>{page.items.map(item => <li key={item.id} className="mb-3">
        <p>Target {item.target_id} · caller index {item.result_index} · {item.status}</p>
        <p>{item.summary}</p>
        {item.error_code && <p>{item.error_code}</p>}
        {item.revision != null && <p>Revision {item.revision}</p>}
        {item.listing_version_id && <p>Listing version {item.listing_version_id}</p>}
        {item.status === 'failed' && <label><input type="checkbox" disabled={!enabled || busy || attempted} checked={selection.includes(item.target_id)} onChange={event => setSelection(selected => event.target.checked ? [...selected, item.target_id] : selected.filter(target => target !== item.target_id))} /> Select failed target {item.target_id}</label>}
      </li>)}</ol>
      {page.has_more && <button disabled={busy} onClick={() => setCursor(page.next_cursor || undefined)}>Next activity page</button>}
      {cursor && <button disabled={busy} onClick={() => setCursor(undefined)}>First activity page</button>}
      {(selection.length > 0 || page.items.some(item => item.status === 'failed')) && <>
        <p>Select failed members across activity pages to prepare a fresh review. Successful, unchanged, blocked and cancelled members cannot be retried. At most 50 members; requests are never split.</p>
        <button disabled={!enabled || busy || attempted || !selection.length || selection.length > 50} onClick={retry}>Prepare failed-only retry</button>
      </>}
    </>}
    {activityError && <p role="alert">{activityError}</p>}
    {error && <p role="alert">{error}</p>}
    {continuation && <><p>Retry prepared. Review all terms and confirm explicitly with fresh authentication before any execution.</p><Link href={continuation} prefetch={false} rel="noreferrer">Review new retry batch</Link></>}
  </section>;
}
