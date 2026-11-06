'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { PENDING_ACTION_CONTINUATION } from '@/lib/redirect';
import { hasRequiredReviewContent, safeLicenseUrl } from '@/lib/pending-action-review';
import { decidePendingAction, getPendingAction, getSellerCapability, sellerAdmissionEnabled, pendingActionError, type PendingAction } from '@/api/pending-actions';
import { checkoutBlock, checkoutContinuation, checkoutDomainEnabled, checkoutErrorCode } from '@/lib/checkout-domain';
import Link from 'next/link';
import SellerBatchReview from '@/components/SellerBatchReview';
import SellerOperationReceipt from '@/components/SellerOperationReceipt';
import { isSellerBatchSummary, isSellerSingleSummary } from '@/lib/seller-batch';
import { useSessionGeneration } from '@/hooks/useSessionGeneration';

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
  const sessionGeneration = useSessionGeneration(accessToken);
  const identity = `${user?.id || ''}:${sessionGeneration}:${path}`;
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const [review, setReview] = useState<{ identity: string; data: PendingAction } | null>(null);
  const [error, setError] = useState<{ identity: string; kind: ErrorKind } | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkoutFailure, setCheckoutFailure] = useState<{ identity: string; block: NonNullable<ReturnType<typeof checkoutBlock>> } | null>(null);
  const submitting = useRef(false);
  const capabilityRequest = useRef(0);
  const data = review?.identity === identity ? review.data : null;
  const batch = data && (isSellerBatchSummary(data.summary) || isSellerSingleSummary(data.summary)) ? data.summary : null;
  const [capability, setCapability] = useState<{ identity: string; admission: unknown } | null>(null);
  const [capabilityTick, setCapabilityTick] = useState(0);
  const seller = data?.summary.summary_type === 'seller_batch_v1';
  const admitted = !seller || (capability?.identity === identity && sellerAdmissionEnabled(capability.admission));
  const kind = error?.identity === identity ? error.kind : '';
  const continuation = checkoutDomainEnabled() && data?.status === 'confirmed' && !data.error_code
    && data.summary.action === 'aim.checkout.handoff.create' ? checkoutContinuation(data.result?.checkout_url) : null;
  const checkoutRefusal = checkoutDomainEnabled() ? (checkoutFailure?.identity === identity ? checkoutFailure.block
    : checkoutBlock(data?.error_code, data?.result?.web_path)) : null;

  useEffect(() => {
    if (!hydrated || isLoading || !valid) return;
    let active = true;
    setReview(null);
    setError(null);
    setCheckoutFailure(null);
    // Probe the API even without a session: flag-off 404 must stay inert.
    getPendingAction(id, token).then((data) => {
      if (active) { setReview({ identity, data }); setCapability({ identity, admission: data.admission }); }
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

  useEffect(() => {
    if (!batch || batch.summary_type !== 'seller_batch_v1' || data?.status !== 'confirmed' || !['queued', 'running'].includes(String(data.result?.execution_status))) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await getPendingAction(id, token);
        if (!active) return;
        if (next.summary_hash !== data.summary_hash) { setError({ identity, kind: 'changed' }); return; }
        setReview({ identity, data: next }); setError(null);
      } catch (cause) { if (active) setError({ identity, kind: pendingActionError(cause) }); }
      if (active) timer = setTimeout(poll, 5000);
    };
    timer = setTimeout(poll, 5000);
    return () => { active = false; clearTimeout(timer); };
  }, [batch, data, id, token, identity]);

  useEffect(() => {
    if (!seller || data?.status !== 'pending_review') return;
    let active = true;
    const refresh = async () => {
      if (submitting.current) return;
      const request = ++capabilityRequest.current;
      setCapability({ identity, admission: null });
      try {
        const admission = await getSellerCapability(id, token);
        if (active && request === capabilityRequest.current) setCapability({ identity, admission });
      } catch (cause) {
        if (active && request === capabilityRequest.current) {
          setCapability({ identity, admission: null });
          const refusal = pendingActionError(cause);
          if (refusal === 'company_login' || refusal === 'login') setError({ identity, kind: refusal });
        }
      }
      if (active) setCapabilityTick(value => value + 1);
    };
    const timer = setInterval(() => { setCapabilityTick(value => value + 1); void refresh(); }, 5000);
    const focus = () => { setCapability({ identity, admission: null }); void refresh(); };
    window.addEventListener('focus', focus);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', focus); };
  }, [seller, data?.status, id, token, identity]);
  // Re-render at each freshness boundary even when a status request stalls.
  void capabilityTick;

  const decide = async (decision: 'confirm' | 'decline') => {
    if (!data || data.status !== 'pending_review' || submitting.current || Date.parse(data.expires_at) <= Date.now()) return;
    if (decision === 'confirm' && (!admitted || kind || !hasRequiredReviewContent(data.summary))) return;
    submitting.current = true;
    setBusy(true);
    try {
      if (decision === 'confirm' && seller) {
        ++capabilityRequest.current;
        setCapability({ identity, admission: null });
        let admission;
        try { admission = await getSellerCapability(id, token); } catch (cause) {
          if (currentIdentity.current === identity) {
            const refusal = pendingActionError(cause);
            if (refusal === 'company_login' || refusal === 'login') setError({ identity, kind: refusal });
          }
          return;
        }
        if (currentIdentity.current !== identity) return;
        setCapability({ identity, admission });
        if (!sellerAdmissionEnabled(admission)) return;
      }
      const result = await decidePendingAction(id, token, decision, data.summary_hash);
      if (currentIdentity.current === identity) {
        setReview({ identity, data: result }); setError(null);
        const next = checkoutDomainEnabled() && decision === 'confirm' && result.status === 'confirmed' && !result.error_code
          && result.summary.action === 'aim.checkout.handoff.create' ? checkoutContinuation(result.result?.checkout_url) : null;
        if (next) router.replace(next);
      }

    } catch (cause) {
      if (currentIdentity.current === identity) {
        const detail = (cause as { response?: { data?: { detail?: { web_path?: unknown } } } })?.response?.data?.detail;
        const block = checkoutDomainEnabled() ? checkoutBlock(checkoutErrorCode(cause), detail?.web_path) : null;
        if (block) setCheckoutFailure({ identity, block });
        else setError({ identity, kind: pendingActionError(cause) });
      }
    } finally { submitting.current = false; setBusy(false); }
  };

  const notFound = !valid || kind === 'not_found';
  const expired = kind === 'changed' || data?.status === 'expired' || (data?.status === 'pending_review' && Date.parse(data.expires_at) <= Date.now());
  const contentUnavailable = kind === 'summary_unavailable' || data?.error_code === 'SUMMARY_CONTENT_UNAVAILABLE' || (!!data && !hasRequiredReviewContent(data.summary));
  const actionable = data?.status === 'pending_review' && !expired && !notFound && kind !== 'unavailable' && !checkoutRefusal;

  return <main className="mx-auto max-w-xl space-y-6 px-6 py-16">
    {notFound ? <><h1 className="text-2xl font-bold">Confirmation not found</h1><p>This confirmation is unavailable.</p></>
      : !hydrated || isLoading || (!data && !kind) ? <p role="status">Loading confirmation…</p>
      : <>
        <h1 className="text-2xl font-bold">{data ? 'Your assistant asks to…' : 'Review assistant request'}</h1>
        {batch && <SellerBatchReview key={data!.summary_hash} summary={batch} expiresAt={data!.expires_at} reviewHash={data!.summary_hash} />}
        {data && !batch && data.summary.summary_type !== 'seller_batch_v1' && <section aria-label="Requested action and exact terms" className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
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
        {data?.status === 'confirmed' && <p role="status">{batch?.summary_type === 'seller_batch_v1' ? 'Authorized. Execution is queued separately; this decision does not mean all members completed.' : 'Confirmed. This request has been completed.'}</p>}
        {batch && <SellerOperationReceipt result={data!.result} />}
        {batch && data?.result?.operation_id != null && <Link href={`/dashboard/settings?redirect=${encodeURIComponent(path)}#seller-operation`} prefetch={false} rel="noreferrer">View seller operation in settings</Link>}
        {continuation && !checkoutRefusal && <><p>Review the licence and confirm your authority at checkout.</p>
          <Link href={continuation} replace prefetch={false} rel="noreferrer">Continue to checkout</Link></>}
        {checkoutRefusal && <div role="alert"><p>{checkoutRefusal.message}</p>
          {checkoutRefusal.webPath && <Link href={checkoutRefusal.webPath}>Review listing</Link>}</div>}
        {data?.status === 'denied' && <p role="status">Declined. This request will not be carried out.</p>}
        {data?.status === 'failed' && !checkoutRefusal && <p role="alert">This request could not be completed. Ask your assistant for a new request.</p>}
        {expired && <p role="alert">This request expired or its terms changed. Ask your assistant for a new request.</p>}
        {kind === 'unavailable' && <p role="alert">This request is temporarily unavailable. Please reload to check its status.</p>}
        {contentUnavailable && <p role="alert">Required request details are missing. Confirmation is disabled. Ask your assistant for a new request with complete app, time, effect and terms.</p>}
        {seller && data?.status === 'pending_review' && !admitted && <p role="alert">Seller confirmation is disabled while current capability is off or unavailable.</p>}
        {['company_login', 'login', 'second_factor', 'enrollment'].includes(kind) && <p role="alert">Please refresh the page and try again.</p>}
        {actionable && <>
          <p className="font-medium">Only confirm if you asked for this.</p>
          <div className="flex gap-3">
            <button type="button" disabled={busy || !!kind || contentUnavailable || !admitted} onClick={() => decide('confirm')} className="rounded-lg bg-[#3F51B5] px-5 py-2.5 text-white font-medium disabled:opacity-50">Confirm</button>
            <button type="button" disabled={busy} onClick={() => decide('decline')} className="rounded-lg border border-gray-300 px-5 py-2.5 font-medium disabled:opacity-50">Decline</button>
          </div>
          {busy && <p role="status">Saving your decision…</p>}
        </>}
      </>}
  </main>;
}
