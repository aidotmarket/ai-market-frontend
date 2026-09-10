'use client';
import {useEffect,useRef,useState} from 'react';
import axios from 'axios';
import {readPublication,publishListing,type PublicationState} from '@/api/sellerListingPublication';
import type {ApprovalReceipt} from '@/api/sellerListingReview';
export default function SellerPublication({approval,active,rendered}:{approval:ApprovalReceipt;active:boolean;rendered:boolean}) {
  const [state,setState]=useState<PublicationState|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [stale,setStale]=useState(false);
  const [retry,setRetry]=useState(0);
  const identity=useRef<string|null>(null);
  const action=useRef<AbortController|null>(null);
  useEffect(()=>{
    if (!active) return;
    const request=new AbortController();setError('');setState(null);
    readPublication(approval,request.signal).then(value=>{if (!request.signal.aborted) setState(value);}).catch(()=>{
      if (!request.signal.aborted) setError('Publication status could not be checked. Refresh the status before publishing.');
    });
    return ()=>request.abort();
  },[active,approval,retry]);
  useEffect(()=>()=>{action.current?.abort();},[]);
  useEffect(()=>{if (!active) {action.current?.abort();action.current=null;setBusy(false);}},[active]);
  async function publish() {
    if (!active || !rendered || !state?.publication_available || state.publication || stale || action.current) return;
    const request=new AbortController();action.current=request;identity.current ??= crypto.randomUUID();
    setBusy(true);setError('');
    try {
      const publication=await publishListing(approval,identity.current,request.signal);
      if (!request.signal.aborted) setState({publication_available:state.publication_available,publication});
    } catch (failure) {
      if (request.signal.aborted) return;
      if (axios.isAxiosError(failure) && failure.response?.status===409) {
        setStale(true);setError('The listing or files changed. Refresh the saved review and approve it again.');
      } else setError('Publication could not be confirmed. Try again to check this same publication; a retry will not create a second listing.');
    } finally {if (action.current===request) {action.current=null;setBusy(false);}}
  }
  const publication=state?.publication;
  return <section aria-label="Publish approved listing" className="space-y-4 rounded-xl border border-indigo-200 bg-white p-5">
    <h3 className="text-lg font-semibold text-gray-900">Publish your listing</h3>
    {!state && !error && <p role="status" className="text-sm text-gray-600">Checking publication status…</p>}
    {publication ? <><p role="status" className="text-sm text-green-900">{publication.status==='published' && publication.is_listed?'Your listing is published and available in the marketplace.':'This review has been published. The listing is currently not available in marketplace discovery.'}</p>
      <a href={`/listings/${encodeURIComponent(publication.slug)}`} className="inline-block text-sm font-medium text-indigo-700 underline">View {publication.title}</a></> : state && <>
      <p className="text-sm leading-6 text-gray-700">Your approved listing is private. Publishing makes the approved description, tags, price and license public. The files stay in your storage.</p>
      {state.publication_available ? <button type="button" onClick={publish} disabled={busy || !active || !rendered || stale} className="rounded-lg bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy?'Publishing…':'Publish this listing'}</button>:
        <p className="text-sm text-gray-600">Publication is not available in this Workspace yet. Your approval is saved.</p>}
    </>}
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    {!busy && <button type="button" disabled={!active} onClick={()=>setRetry(value=>value+1)} className="text-sm text-indigo-700 underline">Refresh publication status</button>}
  </section>;
}
