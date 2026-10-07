'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { PENDING_ACTION_CONTINUATION } from '@/lib/redirect';
import { decidePendingAction, getPendingAction, pendingActionError, type PendingAction } from '@/api/pending-actions';

function Terms({ value }: { value: unknown }) {
  if (Array.isArray(value)) return <ol className="space-y-2">{value.map((item, index) => <li key={index}><Terms value={item} /></li>)}</ol>;
  if (value !== null && typeof value === 'object') return <dl className="space-y-3">{Object.entries(value).map(([key, item]) => <div key={key}>
    <dt className="text-sm font-medium text-gray-600">{key.replaceAll('_', ' ')}</dt>
    <dd className="mt-1 break-words whitespace-pre-wrap"><Terms value={item} /></dd>
  </div>)}</dl>;
  return <>{value === null ? 'null' : String(value)}</>;
}

type ErrorKind = ReturnType<typeof pendingActionError> | '';
export default function PendingActionReview() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const query = useSearchParams();
  const { hydrated, isLoading, user, token: accessToken } = useAuthStore();
  const path = `/confirm/${id}?${query.toString()}`;
  const valid = PENDING_ACTION_CONTINUATION.test(path);
  const token = query.get('t') || '';
  const identity = `${user?.id || ''}:${accessToken || ''}:${path}`;
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const [review, setReview] = useState<{ identity: string; data: PendingAction } | null>(null);
  const [error, setError] = useState<{ identity: string; kind: ErrorKind } | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const data = review?.identity === identity ? review.data : null;
  const kind = error?.identity === identity ? error.kind : '';

  useEffect(() => {
    if (!hydrated || isLoading || !valid) return;
    let active = true;
    setReview(null);
    setError(null);
    // Probe the API even without a session: flag-off 404 must stay inert.
    getPendingAction(id, token).then((data) => {
      if (active) setReview({ identity, data });
    }).catch((cause) => { if (active) setError({ identity, kind: pendingActionError(cause) }); });
    return () => { active = false; };
  }, [hydrated, isLoading, valid, id, token, identity]);

  useEffect(() => {
    if (!data || data.status !== 'pending_review') return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const remaining = Date.parse(data.expires_at) - Date.now();
      if (remaining <= 0) { setError({ identity, kind: 'changed' }); return; }
      timer = setTimeout(schedule, Math.min(remaining, 2_147_483_647));
    };
    schedule();
    return () => clearTimeout(timer);
  }, [data, identity]);

  const decide = async (decision: 'confirm' | 'decline') => {
    if (!data || data.status !== 'pending_review' || submitting.current || Date.parse(data.expires_at) <= Date.now()) return;
    submitting.current = true;
    setBusy(true);
    try {
      const result = await decidePendingAction(id, token, decision, data.summary_hash);
      if (currentIdentity.current === identity) { setReview({ identity, data: result }); setError(null); }
    } catch (cause) {
      if (currentIdentity.current === identity) setError({ identity, kind: pendingActionError(cause) });
    } finally { submitting.current = false; setBusy(false); }
  };

  const login = () => router.push(`/login?reauth=pending-action&redirect=${encodeURIComponent(path)}`);
  const notFound = !valid || kind === 'not_found';
  const expired = kind === 'changed' || data?.status === 'expired' || (data?.status === 'pending_review' && Date.parse(data.expires_at) <= Date.now());
  const actionable = data?.status === 'pending_review' && !expired && !notFound && kind !== 'unavailable';

  return <main className="mx-auto max-w-xl space-y-6 px-6 py-16">
    {notFound ? <><h1 className="text-2xl font-bold">Confirmation not found</h1><p>This confirmation is unavailable.</p></>
      : !hydrated || isLoading || (!data && !kind) ? <p role="status">Loading confirmation…</p>
      : <>
        <h1 className="text-2xl font-bold">{data ? 'Your assistant asks to…' : 'Review assistant request'}</h1>
        {data && <section aria-label="Requested action and exact terms" className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <Terms value={data.summary} />
          <p className="text-sm text-gray-600">Expires: <time dateTime={data.expires_at}>{data.expires_at}</time></p>
        </section>}
        {data?.status === 'confirmed' && <p role="status">Confirmed. This request has been completed.</p>}
        {data?.status === 'denied' && <p role="status">Declined. This request will not be carried out.</p>}
        {data?.status === 'failed' && <p role="alert">This request could not be completed. Ask your assistant for a new request.</p>}
        {expired && <p role="alert">This request expired or its terms changed. Ask your assistant for a new request.</p>}
        {kind === 'unavailable' && <p role="alert">This request is temporarily unavailable. Please reload to check its status.</p>}
        {(kind === 'login' || kind === 'second_factor') && <div className="space-y-3" role="alert">
          <p>{kind === 'login' ? 'Sign in again to confirm. Login must be within the last 15 minutes.' : 'Verify your second factor again before confirming this binding action.'}</p>
          <button type="button" onClick={login} className="text-[#3F51B5] font-medium underline">{kind === 'login' ? 'Sign in again' : 'Sign in and verify second factor'}</button>
        </div>}
        {actionable && <>
          <p className="font-medium">Only confirm if you asked for this.</p>
          <div className="flex gap-3">
            <button type="button" disabled={busy || kind === 'login' || kind === 'second_factor'} onClick={() => decide('confirm')} className="rounded-lg bg-[#3F51B5] px-5 py-2.5 text-white font-medium disabled:opacity-50">Confirm</button>
            <button type="button" disabled={busy} onClick={() => decide('decline')} className="rounded-lg border border-gray-300 px-5 py-2.5 font-medium disabled:opacity-50">Decline</button>
          </div>
          {busy && <p role="status">Saving your decision…</p>}
        </>}
      </>}
  </main>;
}
