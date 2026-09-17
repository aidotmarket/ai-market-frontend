"use client";

import {useEffect, useRef, useState, type ComponentType} from 'react';
import {fetchPreviewKeys, fetchPreviewManifest, type ListingSummary} from '@/lib/api';
import type {ApprovedColumn} from '@/lib/listing-preview/columns';
import type {Manifest, TrustedCheckpoint, TrustedKeys, VerifiedSample} from '@/lib/listing-preview/types';

type TableProps = {sample: VerifiedSample; columns: readonly ApprovedColumn[]};
type Ready = {manifest: Manifest; keys: TrustedKeys};
type State = {kind: 'absent'} | {kind: 'ready'; value: Ready} | {kind: 'loading'} | {kind: 'unavailable'} |
  {kind: 'verified'; sample: VerifiedSample; columns: ApprovedColumn[]; Table: ComponentType<TableProps>};

export default function ListingSamplePreview({slug, listingId, approvedSummary, approvedSummaryHash}: {
  slug?: string; listingId: string; approvedSummary?: ListingSummary | null; approvedSummaryHash?: string;
}) {
  const [state, setState] = useState<State>({kind: 'absent'});
  const generation = useRef(0), request = useRef<AbortController | null>(null), requested = useRef(false);
  const previous = useRef<TrustedCheckpoint | undefined>(undefined);
  const startRef = useRef<(view: boolean) => void>(() => undefined);
  useEffect(() => {
    let disposed = false, timer: ReturnType<typeof setTimeout> | undefined;
    requested.current = false; previous.current = undefined;
    function clear() {generation.current++; request.current?.abort(); request.current = null; clearTimeout(timer); setState({kind: 'absent'});}
    async function start(view: boolean) {
      if (disposed || !slug || document.visibilityState === 'hidden') return;
      clear(); const token = generation.current, controller = new AbortController(); request.current = controller;
      const valid = () => !disposed && token === generation.current && !controller.signal.aborted && document.visibilityState !== 'hidden';
      const started = Date.now(), monotonic = performance.now();
      const clock = () => {
        const now = Date.now();
        if (Math.abs(now - started - (performance.now() - monotonic)) > 1000) throw new Error('clock_uncertain');
        return now;
      };
      if (view) {requested.current = true; setState({kind: 'loading'});}
      // One bounded action, including final current-manifest read; no polling or
      // expiry timer on an untouched tab. Abort and generation guard late replies.
      timer = setTimeout(() => {controller.abort(); if (!disposed && token === generation.current) {generation.current++; setState(requested.current ? {kind: 'unavailable'} : {kind: 'absent'});}}, 5000);
      try {
        const manifest = await fetchPreviewManifest(slug, controller.signal);
        if (!valid()) return;
        if (!manifest || manifest.listing_id !== listingId) {setState(requested.current ? {kind: 'unavailable'} : {kind: 'absent'}); return;}
        const keys = await fetchPreviewKeys(controller.signal);
        if (!valid()) return;
        // Missing trust distribution (including the current production 503) is
        // no preview, with no error page and no seller-origin request.
        if (!keys) {setState({kind: 'absent'}); return;}
        if (!view) {setState({kind: 'ready', value: {manifest, keys}}); return;}
        const [{verifyManifest, verifySample}, {fetchPackage}, {scanLocalPreview}, {tableRenderer}, {default: Table}, {joinApprovedColumns}, primitives] = await Promise.all([
          import('@/lib/listing-preview/verifier'), import('@/lib/listing-preview/transport'), import('@/lib/listing-preview/policy'),
          import('@/lib/listing-preview/registry'), import('./SampleTable'), import('@/lib/listing-preview/columns'), import('@/lib/listing-preview/primitives'),
        ]);
        if (!valid()) return;
        const checked = await verifyManifest(manifest, keys, listingId, clock(), previous.current);
        if (!valid()) return;
        const raw = await fetchPackage(checked.package.url, checked.package.byte_ceiling, controller.signal);
        const sample = await verifySample(checked, raw, {listingId, keys, now: clock, previous: previous.current, scan: scanLocalPreview,
          readCurrent: () => fetchPreviewManifest(slug, controller.signal), signal: controller.signal});
        if (!valid()) return;
        // Optional labels require an exact approved payload hash. A transformed
        // public summary is not silently treated as the original signed payload.
        let descriptions: NonNullable<ListingSummary['field_descriptions']>['value'] = [];
        if (approvedSummary && approvedSummaryHash === sample.manifest.summary_hash && primitives.hex(await primitives.sha(primitives.jcs(approvedSummary))) === sample.manifest.summary_hash) {
          descriptions = approvedSummary.field_descriptions?.value ?? [];
          const names = approvedSummary.key_fields?.value.map(c => c.name) ?? [];
          if (!sample.manifest.selected_fields.every(n => names.includes(n))) throw new Error('approved_column_mismatch');
        }
        const columns = joinApprovedColumns(sample.manifest.columns, descriptions);
        if (!valid()) return;
        previous.current = sample.manifest.checkpoint;
        const renderer = tableRenderer(value => {if (valid() && value) setState({kind: 'verified', sample: value, columns, Table});});
        renderer.mount(sample.manifest as Manifest, sample);
      } catch {
        if (valid()) setState(requested.current ? {kind: 'unavailable'} : {kind: 'absent'});
      } finally {if (token === generation.current) {clearTimeout(timer); request.current = null;}}
    }
    startRef.current = view => {void start(view);};
    function visibility() {clear(); if (document.visibilityState === 'visible') void start(requested.current);}
    function restore(event: PageTransitionEvent) {if (event.persisted) {clear(); void start(requested.current);}}
    function hide() {clear();}
    function focus() {if (document.visibilityState === 'visible' && !request.current) void start(requested.current);}
    void start(false);
    document.addEventListener('visibilitychange', visibility); window.addEventListener('pageshow', restore);
    window.addEventListener('pagehide', hide); window.addEventListener('focus', focus);
    return () => {disposed = true; clear(); startRef.current = () => undefined;
      document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pageshow', restore);
      window.removeEventListener('pagehide', hide); window.removeEventListener('focus', focus);};
  }, [slug, listingId, approvedSummary, approvedSummaryHash]);
  if (state.kind === 'absent') return null;
  return <section data-listing-sample="" aria-label="Seller-selected sample" className="min-w-0 max-w-full space-y-3 rounded-xl border border-gray-200 bg-white p-4">
    {state.kind === 'ready' && <button type="button" onClick={() => startRef.current(true)} className="rounded border border-indigo-700 px-3 py-2 text-indigo-700 focus-visible:outline-2 focus-visible:outline-indigo-700">View sample</button>}
    {state.kind === 'loading' && <p role="status" aria-live="polite">Verifying sample…</p>}
    {state.kind === 'unavailable' && <p role="status" aria-live="polite">Sample unavailable</p>}
    {state.kind === 'verified' && <state.Table sample={state.sample} columns={state.columns} />}
  </section>;
}
