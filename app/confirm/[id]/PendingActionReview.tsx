'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { PENDING_ACTION_CONTINUATION } from '@/lib/redirect';
import { hasRequiredReviewContent, safeLicenseUrl } from '@/lib/pending-action-review';
import { startProviderOAuth } from '@/components/OAuthButtons';
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
  const [reauthError, setReauthError] = useState('');
  const submitting = useRef(false);
  const data = review?.identity === identity ? review.data : null;
  const kind = error?.identity === identity ? error.kind : '';

  useEffect(() => {
    if (!hydrated || isLoading || !valid) return;
    let active = true;
    setReview(null);
    setError(null);
    setReauthError('');
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
    if (decision === 'confirm' && (kind || !hasRequiredReviewContent(data.summary))) return;
    submitting.current = true;
    setBusy(true);
    try {
      const result = await decidePendingAction(id, token, decision, data.summary_hash);
      if (currentIdentity.current === identity) { setReview({ identity, data: result }); setError(null); }
    } catch (cause) {
      if (currentIdentity.current === identity) setError({ identity, kind: pendingActionError(cause) });
    } finally { submitting.current = false; setBusy(false); }
  };

  // /auth/me reports the actual provider session. Linked account methods and
  // primary_auth are not evidence of how this session signed in.
  const provider = user?.two_factor_provider;
  const enroll = kind === 'enrollment' || (kind === 'second_factor' && !provider && !user?.totp_enabled);
  const login = async () => {
    if (!valid) return;
    if (enroll) {
      router.push(`/dashboard/settings?redirect=${encodeURIComponent(path)}#security`);
    } else if (provider === 'google' || provider === 'github') {
      setReauthError('');
      try { await startProviderOAuth(provider, path); }
      catch { setReauthError('Could not start provider sign-in. Please try again.'); }
    } else {
      router.push(`/login?reauth=pending-action&redirect=${encodeURIComponent(path)}`);
    }
  };
  const notFound = !valid || kind === 'not_found';
  const expired = kind === 'changed' || data?.status === 'expired' || (data?.status === 'pending_review' && Date.parse(data.expires_at) <= Date.now());
  const contentUnavailable = kind === 'summary_unavailable' || data?.error_code === 'SUMMARY_CONTENT_UNAVAILABLE' || (!!data && !hasRequiredReviewContent(data.summary));
  const actionable = data?.status === 'pending_review' && !expired && !notFound && kind !== 'unavailable';

  return <main className="mx-auto max-w-xl space-y-6 px-6 py-16">
    {notFound ? <><h1 className="text-2xl font-bold">Confirmation not found</h1><p>This confirmation is unavailable.</p></>
      : !hydrated || isLoading || (!data && !kind) ? <p role="status">Loading confirmation…</p>
      : <>
        <h1 className="text-2xl font-bold">{data ? 'Your assistant asks to…' : 'Review assistant request'}</h1>
        {data && <section aria-label="Requested action and exact terms" className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <dl className="space-y-4">
            <div><dt className="font-medium">App asking</dt><dd className="text-xl font-semibold">{typeof data.summary.client_display_name === 'string' ? data.summary.client_display_name : 'Unavailable'}</dd></div>
            <div><dt className="font-medium">Requested at</dt><dd>{typeof data.summary.requested_at === 'string' && Number.isFinite(Date.parse(data.summary.requested_at))
              ? <time dateTime={data.summary.requested_at}>{new Date(data.summary.requested_at).toLocaleString()}</time> : 'Unavailable'}</dd></div>
            <div><dt className="font-medium">What confirming will do</dt><dd className="whitespace-pre-wrap">{typeof data.summary.effect === 'string' ? data.summary.effect : 'Unavailable'}</dd></div>
          </dl>
          <h2 className="text-lg font-semibold">Binding terms</h2>
          <Terms value={data.summary.binding_terms ?? 'Unavailable'} />
          {safeLicenseUrl(data.summary.license_url) && <p><a href={data.summary.license_url} target="_blank" rel="noopener noreferrer" className="font-medium text-[#3F51B5] underline">
            {typeof data.summary.license_name === 'string' ? data.summary.license_name : 'Licence'}{typeof data.summary.license_version === 'string' ? ` (version ${data.summary.license_version})` : ''} — Read licence terms
          </a></p>}
          <details><summary className="cursor-pointer text-sm text-gray-600">Request details</summary>
            <Terms value={Object.fromEntries(Object.entries(data.summary).filter(([key]) => !['client_display_name', 'requested_at', 'effect', 'binding_terms', 'license_name', 'license_version', 'license_url'].includes(key)))} />
          </details>
          <p className="text-sm text-gray-600">Expires: <time dateTime={data.expires_at}>{data.expires_at}</time></p>
        </section>}
        {data?.status === 'confirmed' && <p role="status">Confirmed. This request has been completed.</p>}
        {data?.status === 'denied' && <p role="status">Declined. This request will not be carried out.</p>}
        {data?.status === 'failed' && <p role="alert">This request could not be completed. Ask your assistant for a new request.</p>}
        {expired && <p role="alert">This request expired or its terms changed. Ask your assistant for a new request.</p>}
        {kind === 'unavailable' && <p role="alert">This request is temporarily unavailable. Please reload to check its status.</p>}
        {contentUnavailable && <p role="alert">Required request details are missing. Confirmation is disabled. Ask your assistant for a new request with complete app, time, effect and terms.</p>}
        {(kind === 'login' || kind === 'second_factor' || kind === 'enrollment') && <div className="space-y-3" role="alert">
          <p>{enroll ? 'Set up two-factor authentication before confirming this binding action. After setup, return here to review and click Confirm.' : provider
            ? 'Sign in again with your provider, then return here to review and click Confirm.' : kind === 'login' ? 'Sign in again to confirm. Login must be within the last 15 minutes.' : 'Verify your second factor again before confirming this binding action.'}</p>
          <button type="button" onClick={login} className="text-[#3F51B5] font-medium underline">{enroll ? 'Set up two-factor authentication' : provider ? `Sign in again with ${provider === 'google' ? 'Google' : 'GitHub'}` : kind === 'login' ? 'Sign in again' : 'Sign in and verify second factor'}</button>
          {reauthError && <p>{reauthError}</p>}
        </div>}
        {actionable && <>
          <p className="font-medium">Only confirm if you asked for this.</p>
          <div className="flex gap-3">
            <button type="button" disabled={busy || !!kind || contentUnavailable} onClick={() => decide('confirm')} className="rounded-lg bg-[#3F51B5] px-5 py-2.5 text-white font-medium disabled:opacity-50">Confirm</button>
            <button type="button" disabled={busy} onClick={() => decide('decline')} className="rounded-lg border border-gray-300 px-5 py-2.5 font-medium disabled:opacity-50">Decline</button>
          </div>
          {busy && <p role="status">Saving your decision…</p>}
        </>}
      </>}
  </main>;
}
