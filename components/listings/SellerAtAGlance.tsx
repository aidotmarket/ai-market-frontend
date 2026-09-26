"use client";

import {useCallback, useEffect, useRef, useState} from 'react';
import axios from 'axios';
import {approveSummary, fetchSummaryPreview, regenerateSummary, withdrawSummary, type ListingSummary, type SummaryPreview} from '@/lib/api';
import type {Manifest} from '@/lib/listing-preview/types';
import {hasSupportedSummaryFields, provenanceLabels, summaryFields} from './AtAGlance';
import {BuyerPreviewContent} from './BuyerAtAGlance';
import SellerEnrichmentControls from './SellerEnrichmentControls';

function requestId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // getRandomValues is also available on non-HTTPS staging hosts.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function refusal(failure: unknown): string | null {
  if (!axios.isAxiosError(failure)) return null;
  const detail = typeof failure.response?.data?.detail === 'string' ? failure.response.data.detail : undefined;
  if (detail === 'verified_sample_unavailable_above_25_column_cap') return 'A verified sample is not available for a dataset above the approved 25-column cap. This is a product limit, not an error in your dataset.';
  if (detail === 'dictionary_must_match_committed_dataset_schema_republish_through_aim_data') return 'The dictionary must match the committed dataset schema. Update the source file and publish a new listing version to restore agreement.';
  return null;
}

function SellerPreviewChrome({summary, selectedFields, manifestReceived}: {
  summary: ListingSummary; selectedFields: string[]; manifestReceived: boolean;
}) {
  const present = summaryFields.filter(([key]) => summary[key] && summary[key]?.provenance !== 'absent');
  const omitted = summaryFields.filter(([key]) => !summary[key] || summary[key]?.provenance === 'absent');
  const attribution = (Object.keys(provenanceLabels) as (keyof typeof provenanceLabels)[])
    .filter(key => key !== 'absent').map(key => ({key, labels: present.filter(([field]) => summary[field]?.provenance === key).map(([, label]) => label)}))
    .filter(group => group.labels.length > 0);
  return <aside aria-label="Seller-only preview information" className="space-y-4 rounded-lg border border-indigo-100 bg-indigo-50/40 p-4">
    <h3 className="text-sm font-semibold text-indigo-950">Seller-only preview information</h3>
    <div><h4 className="text-sm font-medium text-gray-900">Omitted from the buyer view</h4>
      <p className="text-xs text-gray-600">An omitted field is simply not stated and is not an assurance about the data.</p>
      {omitted.length > 0 ? <ul className="mt-1 list-inside list-disc text-sm text-gray-700">{omitted.map(([, label]) => <li key={label}>{label}</li>)}</ul>
        : <p className="mt-1 text-sm text-gray-700">No At-a-glance fields are omitted.</p>}
    </div>
    <div><h4 className="text-sm font-medium text-gray-900">Attribution summary</h4>
      <ul className="mt-1 space-y-1 text-sm text-gray-700">{attribution.map(group => <li key={group.key}>{provenanceLabels[group.key]}: {group.labels.join(', ')}</li>)}</ul>
    </div>
    <div><h4 className="text-sm font-medium text-gray-900">Selected sample fields</h4>
      <p className="text-xs text-gray-600">Read-only here. Field selection belongs to this listing&apos;s signed sample.</p>
      {manifestReceived && selectedFields.length > 0 ? <ul className="mt-1 list-inside list-disc text-sm text-gray-700">{selectedFields.map(field => <li key={field} className="font-mono">{field}</li>)}</ul>
        : manifestReceived ? <p className="mt-1 text-sm text-gray-700">No fields are selected for a sample.</p>
          : <p className="mt-1 text-sm text-gray-700">The current selection is not shown here. Field selection belongs to this listing&apos;s signed sample.</p>}
    </div>
  </aside>;
}

export default function SellerAtAGlance({listingId, slug, active = true, revision = 0}: {listingId: string; slug?: string; active?: boolean; revision?: number}) {
  const [preview, setPreview] = useState<SummaryPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [manifestReceived, setManifestReceived] = useState(false);
  const request = useRef<AbortController | null>(null);
  // Keep decision IDs across an uncertain outcome and preview reload. Approve
  // and withdraw are separate operations, each bound to the exact identifiers.
  const decisions = useRef<{key: string; approve?: string; withdraw?: string}>({key: ''});
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
        const key = JSON.stringify([listingId, preview.summary_id, preview.source_revision, preview.summary_hash, preview.render_hash]);
        if (decisions.current.key !== key) decisions.current = {key};
        const decisionId = decisions.current[action] ?? requestId();
        decisions.current[action] = decisionId;
        const payload = {
          summary_id: preview.summary_id, source_revision: preview.source_revision,
          summary_hash: preview.summary_hash, render_hash: preview.render_hash,
          request_id: decisionId, sample_decision: 'none' as const,
        };
        await (action === 'approve' ? approveSummary : withdrawSummary)(listingId, payload, controller.signal);
        next = await fetchSummaryPreview(listingId, controller.signal);
      }
      if (!controller.signal.aborted) {
        setPreview(next);
        setMessage(action === 'withdraw' ? 'Summary withdrawn. Fresh page loads will reflect this change. Open tabs refresh when buyers return to them.' : '');
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
      } else setError(refusal(failure) ?? `The summary action could not be confirmed. ${failure instanceof Error ? failure.message : 'Unknown error.'} Reload the summary before trying again.`);
    } finally {
      if (!controller.signal.aborted) {setBusy(false); request.current = null;}
    }
  }

  const hasBuyerFields = hasSupportedSummaryFields(preview?.at_a_glance);
  const receiveManifest = useCallback((manifest: Manifest | null) => {
    setManifestReceived(manifest !== null);
    setSelectedFields(manifest?.selected_fields ?? []);
  }, []);

  return <section aria-label="Review At a glance" aria-busy={busy} className="min-w-0 space-y-4 rounded-xl border border-gray-200 bg-white p-5">
    <h2 className="text-lg font-semibold text-gray-900">Review At a glance</h2>
    {busy && <p role="status">Loading summary…</p>}
    {message && <p role="status" className="text-sm text-gray-700">{message}</p>}
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    {preview && <>
      <p role="status" className="text-sm text-gray-700">{preview.state === 'approved' ? 'Approved. This summary is shown to buyers.' : 'Review the summary and approve it to show it to buyers'}</p>
      {preview.state !== 'approved' && !hasBuyerFields && <p className="text-sm text-gray-700">Nothing to show buyers yet. Add more listing details or regenerate.</p>}
      <SellerPreviewChrome summary={preview.at_a_glance} selectedFields={selectedFields} manifestReceived={manifestReceived} />
      <SellerEnrichmentControls listingId={listingId} active={active} onSaved={() => setRetry(value => value + 1)} />
      <p className="text-sm text-gray-700">The block below shows exactly what buyers see; on the listing page, the sample appears after the schema.</p>
      <div data-testid="buyer-preview" className="space-y-4">
        <BuyerPreviewContent summary={preview.at_a_glance} slug={slug}
          listingId={active && preview.state === 'approved' ? listingId : undefined} onManifest={receiveManifest} />
      </div>
      <p className="text-sm text-gray-700">{preview.approval_text}</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={busy || !active} onClick={() => act('regenerate')} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm disabled:opacity-50">Regenerate</button>
        {preview.state === 'approved' ?
          <button type="button" disabled={busy || !active} onClick={() => act('withdraw')} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm disabled:opacity-50">Withdraw</button> :
          <button type="button" disabled={busy || !active || !hasBuyerFields} onClick={() => act('approve')} className="rounded-lg bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Approve At a glance</button>}
      </div>
    </>}
    {!preview && !busy && active && <button type="button" onClick={() => setRetry(value => value + 1)} className="text-sm text-indigo-700 underline">Reload summary</button>}
  </section>;
}
