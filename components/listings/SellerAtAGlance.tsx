"use client";

import {useEffect, useRef, useState} from 'react';
import axios from 'axios';
import {approveSummary, fetchSummaryPreview, regenerateSummary, withdrawSummary, type SummaryPreview} from '@/lib/api';
import AtAGlance from './AtAGlance';

export default function SellerAtAGlance({listingId, active = true, revision = 0}: {listingId: string; active?: boolean; revision?: number}) {
  const [preview, setPreview] = useState<SummaryPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    setPreview(null); setError(''); setMessage('');
    if (!active) return;
    const controller = new AbortController(); request.current = controller; setBusy(true);
    fetchSummaryPreview(listingId, controller.signal).then(value => {
      if (!controller.signal.aborted) setPreview(value);
    }).catch(() => {
      if (!controller.signal.aborted) setError('The summary could not be loaded. Try again.');
    }).finally(() => {if (!controller.signal.aborted) {setBusy(false); request.current = null;}});
    return () => {controller.abort(); request.current?.abort(); request.current = null;};
  }, [listingId, active, revision, retry]);

  async function act(action: 'regenerate' | 'approve' | 'withdraw') {
    if (!preview || !active || request.current) return;
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(''); setMessage('');
    try {
      let next: SummaryPreview;
      if (action === 'regenerate') next = await regenerateSummary(listingId, preview.locale, controller.signal);
      else {
        const payload = {
          summary_id: preview.summary_id, source_revision: preview.source_revision,
          summary_hash: preview.summary_hash, render_hash: preview.render_hash,
          request_id: crypto.randomUUID(), sample_decision: 'none' as const,
        };
        await (action === 'approve' ? approveSummary : withdrawSummary)(listingId, payload, controller.signal);
        next = await fetchSummaryPreview(listingId, controller.signal);
      }
      if (!controller.signal.aborted) {
        setPreview(next);
        setMessage(action === 'withdraw' ? 'Summary withdrawn. Buyers will see this change within 30 seconds.' : '');
      }
    } catch (failure) {
      if (controller.signal.aborted) return;
      // Never leave actionable identifiers on screen after an uncertain decision.
      setPreview(null);
      if (axios.isAxiosError(failure) && failure.response?.status === 409) {
        try {
          const next = await fetchSummaryPreview(listingId, controller.signal);
          if (!controller.signal.aborted) {setPreview(next); setMessage('Summary changed, reloaded. Review it before approving.');}
        } catch {if (!controller.signal.aborted) setError('The changed summary could not be reloaded. Try again.');}
      } else setError('The summary action could not be confirmed. Reload the summary before trying again.');
    } finally {
      if (!controller.signal.aborted) {setBusy(false); request.current = null;}
    }
  }

  return <section aria-label="Review At a glance" aria-busy={busy} className="min-w-0 space-y-4 rounded-xl border border-gray-200 bg-white p-5">
    <h2 className="text-lg font-semibold text-gray-900">Review At a glance</h2>
    {busy && <p role="status">Loading summary…</p>}
    {message && <p role="status" className="text-sm text-gray-700">{message}</p>}
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    {preview && <>
      <p role="status" className="text-sm text-gray-700">{preview.state === 'approved' ? 'Approved. This summary is shown to buyers.' : 'Review the summary and approve it to show it to buyers'}</p>
      <AtAGlance summary={preview.at_a_glance} />
      <p className="text-sm text-gray-700">{preview.approval_text}</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={busy || !active} onClick={() => act('regenerate')} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm disabled:opacity-50">Regenerate</button>
        {preview.state === 'approved' ?
          <button type="button" disabled={busy || !active} onClick={() => act('withdraw')} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm disabled:opacity-50">Withdraw</button> :
          <button type="button" disabled={busy || !active} onClick={() => act('approve')} className="rounded-lg bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Approve At a glance</button>}
      </div>
    </>}
    {!preview && !busy && active && <button type="button" onClick={() => setRetry(value => value + 1)} className="text-sm text-indigo-700 underline">Reload summary</button>}
  </section>;
}
