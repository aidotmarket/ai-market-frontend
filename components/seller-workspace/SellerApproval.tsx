'use client';
import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import {useListingFlow} from './GuidedListingFlow';
import SellerPublication from './SellerPublication';
import { approveListingReview, CONFIRMATION_KEYS, LICENSE_CONFIRMATION_KEYS, type ConfirmationKey, type ListingReview } from '@/api/sellerListingReview';

export default function SellerApproval({review, active, rendered,disabled=false}: {review: ListingReview; active: boolean; rendered: boolean;disabled?:boolean}) {
  const flow=useListingFlow();
  const [confirmed, setConfirmed] = useState(false);
  const [receipt, setReceipt] = useState(review.approval ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const identity = useRef<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => {controller.current?.abort();controller.current = null;};
  }, []);
  useEffect(() => {
    if (!active) {controller.current?.abort();controller.current = null;setBusy(false);}
  }, [active]);
  const sampleDecision=review.sample_decision??'none';
  const confirmationKeys:ConfirmationKey[]=[...(review.license_selection?LICENSE_CONFIRMATION_KEYS:CONFIRMATION_KEYS),...(sampleDecision==='member_files'?['sample_files_confirmed' as const]:[])];
  const ready = active && rendered && !disabled && confirmed && !stale && !receipt;
  async function approve(event: React.FormEvent) {
    event.preventDefault();
    if (!ready || controller.current) return;
    const request = new AbortController();controller.current = request;
    identity.current ??= crypto.randomUUID();
    setBusy(true);setError(null);
    try {
      const saved = await approveListingReview(review, identity.current, request.signal);
      if (!request.signal.aborted) {setReceipt(saved);flow?.approved(saved);}
    } catch (failure) {
      if (request.signal.aborted) return;
      if (axios.isAxiosError(failure) && failure.response?.status === 409) {
        setStale(true);setError('The listing or files changed. Refresh the saved review and confirm it again.');
      } else setError('Approval saving could not be confirmed. Your choices are still here. Try approving again.');
    } finally {
      if (controller.current === request) {controller.current = null;setBusy(false);}
    }
  }
  const sampleFiles=typeof review.sample_status==='object'?review.sample_status.files:[];
  if (receipt) return <><p role="status" className="rounded-xl border border-green-200 bg-green-50 p-5 text-sm text-green-900">Review approved and saved.</p>{!flow&&<SellerPublication key={receipt.id} approval={receipt} active={active} rendered={rendered} sampleCount={sampleFiles.length} />}</>;
  return <form onSubmit={approve} className="space-y-5 rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
    <fieldset disabled={busy || !active || stale || disabled} className="space-y-4"><legend className="text-lg font-semibold text-gray-900">Confirm this review</legend>
      {review.source_page&&<p className="text-sm font-medium text-gray-900">Files included ({review.source_page.total_count.toLocaleString('en')})</p>}
      <p className="text-sm leading-6 text-gray-600">By ticking the box below you confirm that:</p>
      <ul aria-label="Review confirmations" className="ml-5 list-disc space-y-1 text-sm leading-6 text-gray-700">
        {sampleDecision==='none'&&<li>This listing has no public sample.</li>}
        {confirmationKeys.map(key => <li key={key}>{review.confirmation_statements[key]}{key==='sample_files_confirmed'&&<ul aria-label="Files covered by sample confirmation" className="mt-1 space-y-1 text-xs text-gray-600">{sampleFiles.map(file=><li key={file.index}>{file.key_basename} · {file.size.toLocaleString('en')} bytes · index {file.index}</li>)}</ul>}</li>)}
      </ul>
      <label className="flex items-start gap-3 text-sm font-medium leading-6 text-gray-900"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-indigo-700" /><span>I confirm all of the above.</span></label>
    </fieldset>
    <button type="submit" disabled={!ready || busy} className="rounded-lg bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Saving approval…' : 'Approve this review'}</button>
    {!ready&&!busy&&<p role="status" className="text-sm text-amber-900">{stale?'Refresh the saved review before approving.':disabled?'Finish saving your file or sample choice in Choose your files, then refresh this review.':!rendered?'Wait for the saved listing and file preview to finish loading.':'Tick the confirmation box to continue.'}</p>}
    <p className="text-sm text-gray-600">Approval saves this exact review. It does not publish your listing.</p>
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
  </form>;
}
