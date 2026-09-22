'use client';
import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import SellerApproval from './SellerApproval';
import { readListingReview, readReviewSourcePage, type ListingReview, type ReviewSourcePage } from '@/api/sellerListingReview';
import {useSellerListingDraftStatus} from './SellerListingDraftStore';
import {CUSTOM_NOTICE,STANDARD_SELLER_SUMMARY} from './SellerLicenseSelection';

export default function SellerReview({active, enabled}: {active: boolean; enabled: boolean}) {
  const draftStatus=useSellerListingDraftStatus();
  const [review, setReview] = useState<ListingReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const [filesReady, setFilesReady] = useState(true);
  const [loadedRender, setLoadedRender] = useState<string | null>(null);
  const selectionBlocked=draftStatus.selectionSavePending||draftStatus.selectionSaveFailed;
  useEffect(() => {
    if (!active || !enabled) return;
    if(selectionBlocked){setReview(null);setLoading(false);return;}
    const request = new AbortController();
    setLoading(true); setError(null); setReview(null); setLoadedRender(null); setFilesReady(true);
    readListingReview(request.signal).then(result => { if (!request.signal.aborted) setReview(result); }).catch(error => {
      if (request.signal.aborted) return;
      const code = axios.isAxiosError(error) ? error.response?.data?.detail : null;
      setError(code === 'source_required' ? 'Choose and save your files before reviewing the listing.' : code === 'draft_required' ? 'Save your listing in Prepare with Allai before reviewing it.' : code === 'source_connection_changed' ? 'Your storage connection has changed. Choose and save the current files before reviewing.' : 'Your saved listing could not be loaded. Try again.');
    }).finally(() => { if (!request.signal.aborted) setLoading(false); });
    return () => request.abort();
  }, [active, enabled, retry,selectionBlocked]);
  if (!enabled) return <p className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600">Saved listing review is not available yet. You can continue preparing your listing with Allai.</p>;
  return <section aria-label="Review saved listing" className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold text-gray-900">Review your saved listing</h2><p className="mt-2 text-sm text-gray-600">Save your file choices and listing edits before reviewing. Publication status appears below your approved review.</p></div><button type="button" disabled={loading||selectionBlocked} onClick={() => setRetry(value => value + 1)} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm disabled:opacity-50">Refresh saved review</button></div>
    {selectionBlocked&&<p role="alert" className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">{draftStatus.selectionSavePending?'Review is disabled while your file choice is being saved.':'Review is disabled because your last file choice was not saved. Retry that choice before reviewing.'}</p>}
    {loading && <p role="status" className="text-sm text-gray-600">Loading your saved listing and file selection…</p>}
    {error && <p role="alert" className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">{error}</p>}
    {review && <>{review.source_page && <ReviewFiles key={review.review_hash} review={review} active={active} onReady={setFilesReady} />}{review.sample_decision==='member_files'&&<SampleReview review={review}/>}<LicenseReview review={review}/><section aria-label="Saved listing preview" className="space-y-4 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 sm:p-6"><p className="text-sm text-gray-600">This review uses your saved listing fields. Your brief, conversation and unaccepted suggestions are private.</p><iframe key={review.render_hash} onLoad={() => setLoadedRender(review.render_hash)} title="Saved listing buyers would see" sandbox="" referrerPolicy="no-referrer" srcDoc={review.rendered_html} className="h-[min(640px,75vh)] min-h-80 w-full rounded-xl border border-gray-200 bg-white" /></section>{review.missing_fields.length > 0 && <p role="status" className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">Complete and save these listing fields: {review.missing_fields.join(', ')}.{review.missing_fields.includes('price') && ' Enter $0 for a free listing or $25 to $999,999.99 for a paid listing, with no more than two decimal places.'}</p>}<p className="text-sm text-gray-600">Publishing uses the exact saved review shown above.</p>{review.approval_available && review.missing_fields.length === 0 && <SellerApproval key={review.review_hash} review={review} active={active} rendered={filesReady && loadedRender === review.render_hash} disabled={selectionBlocked||(draftStatus.available&&JSON.stringify(review.sample_object_indices??[])!==JSON.stringify(draftStatus.sampleIndices))} />}</>}
  </section>;
}

function LicenseReview({review}:{review:ListingReview}) {
  const selection=review.license_selection;
  if(!selection)return null;
  return <section aria-label="Licence selection in this review" className="rounded-xl border border-gray-200 bg-white p-5"><h3 className="font-semibold text-gray-900">Licence choice</h3><p className="mt-2 text-sm text-gray-700">{selection.kind==='standard'?'Standard (recommended)':'My own licence'} · AI/ML training {selection.ai_training?'allowed':'not allowed'}</p>{selection.kind==='custom'&&<p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{CUSTOM_NOTICE}</p>}<details className="mt-3"><summary className="cursor-pointer text-sm text-indigo-700">Review licence summary</summary><p className="mt-2 whitespace-pre-line text-sm text-gray-700">{selection.kind==='standard'?STANDARD_SELLER_SUMMARY:CUSTOM_NOTICE}</p></details><p className="mt-3 break-all text-xs text-gray-500">Licence hash: {selection.license_sha256}</p></section>;
}

function SampleReview({review}:{review:ListingReview}) {
  const files=typeof review.sample_status==='object'?review.sample_status.files:[];
  return <section aria-label="Free sample confirmation" className="rounded-xl border border-indigo-200 bg-white p-5"><h3 className="font-semibold text-gray-900">Free sample files</h3><p className="mt-2 text-sm text-gray-700">{review.confirmation_statements.sample_files_confirmed}</p><ul className="mt-3 divide-y divide-gray-100">{files.map(file=><li key={file.index} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><span>{file.key_basename}</span><span>{file.size.toLocaleString('en')} bytes · index {file.index}</span></li>)}</ul></section>;
}

function ReviewFiles({review, active, onReady}:{review:ListingReview; active:boolean; onReady:(ready:boolean)=>void}) {
  const [page,setPage]=useState<ReviewSourcePage>(review.source_page!);
  const [history,setHistory]=useState<Array<{cursor:string|null;offset:number}>>([{cursor:null,offset:0}]);
  const [index,setIndex]=useState(0);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const controller=useRef<AbortController|null>(null);
  useEffect(()=>()=>{controller.current?.abort();},[]);
  useEffect(()=>{if(!active) {controller.current?.abort();controller.current=null;setBusy(false);}},[active]);
  async function load(target:number) {
    if(!active || controller.current || error) return;
    const next=history[target] ?? {cursor:page.next_cursor,offset:page.offset+page.files.length};
    if(!next.cursor && target!==0) return;
    const request=new AbortController();controller.current=request;setBusy(true);onReady(false);
    try {
      // Returning to the first page also revalidates the entire saved review.
      const result=next.cursor ? await readReviewSourcePage(review,next.cursor,next.offset,request.signal) :
        (await readListingReview(request.signal)).source_page;
      if(request.signal.aborted) return;
      if(!result || result.review_hash!==review.review_hash || result.source_hash!==review.source_hash ||
        result.source_version!==review.source_version || result.total_count!==review.source_page!.total_count ||
        result.total_size_bytes!==review.source_page!.total_size_bytes) throw new Error('Review changed');
      setPage(result);setIndex(target);setHistory(values=>values[target] ? values : [...values,next]);onReady(true);
    } catch(failure) {
      if(request.signal.aborted) return;
      const stale=axios.isAxiosError(failure) && failure.response?.status===409;
      setError(stale ? 'The listing or files changed. Refresh the saved review before continuing.' :
        'This file page could not be verified. Refresh the saved review before continuing.');
      onReady(false);
    } finally {if(controller.current===request) {controller.current=null;setBusy(false);}}
  }
  return <section aria-label="Files included in this review" className="rounded-xl border border-gray-200 bg-white p-5">
    <h3 className="font-semibold text-gray-900">Files included</h3>
    <p className="mt-2 text-sm text-gray-900">{page.total_count.toLocaleString('en')} files · {page.total_size_bytes.toLocaleString('en')} bytes</p>
    <p className="mt-2 text-sm text-gray-600">These filenames are private and do not appear in your public listing. The files stay in your cloud account. Approval includes all files across every preview page.</p>
    {!error && <ul className="mt-3 max-h-96 overflow-y-auto divide-y divide-gray-100">{page.files.map(file=><li key={JSON.stringify([file.key,file.version_id])} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><span className="min-w-0 break-all text-gray-900">{file.key}</span><span className="text-gray-500">{file.size.toLocaleString('en')} bytes</span></li>)}</ul>}
    {(page.next_cursor || index>0) && <div className="mt-3 flex items-center gap-3 text-sm"><button type="button" disabled={!active || busy || !!error || index===0} onClick={()=>void load(index-1)}>Previous review files</button><span>Showing {page.offset+1}–{page.offset+page.files.length} of {page.total_count.toLocaleString('en')}</span><button type="button" disabled={!active || busy || !!error || !page.next_cursor} onClick={()=>void load(index+1)}>Next review files</button></div>}
    {busy && <p role="status" className="mt-3 text-sm">Loading review files…</p>}
    {error && <p role="alert" className="mt-3 text-sm text-amber-900">{error}</p>}
  </section>;
}
