'use client';
import {useEffect,useRef,useState} from 'react';
import {useListingFlow} from './GuidedListingFlow';
import SellerAtAGlance from '@/components/listings/SellerAtAGlance';
import axios from 'axios';
import {readPublication,publishListing,type PublicationState} from '@/api/sellerListingPublication';
import type {ApprovalReceipt} from '@/api/sellerListingReview';
import {isCompleteLicenseSelection} from '@/api/listingLicenses';
import {legalIdentityFailure,LEGAL_IDENTITY_SUPPORT_PATH} from '@/api/sellerLegalIdentity';
export default function SellerPublication({approval,active,rendered,sampleCount=0}:{approval:ApprovalReceipt;active:boolean;rendered:boolean;sampleCount?:number}) {
  const flow=useListingFlow();
  const [localState,setState]=useState<PublicationState|null>(null);
  const [busy,setBusy]=useState(false);
  const [localError,setError]=useState('');
  const [stale,setStale]=useState(false);
  const [retry,setRetry]=useState(0);
  const identity=useRef<string|null>(null);
  const action=useRef<AbortController|null>(null);
  const state=flow?flow.publication:localState;
  const error=localError||(flow?.publicationError??'');
  useEffect(()=>{
    if (flow || !active) return;
    const request=new AbortController();setError('');setState(null);
    readPublication(approval,request.signal).then(value=>{if (!request.signal.aborted) setState(value);}).catch(()=>{
      if (!request.signal.aborted) setError('Publication status could not be checked. Refresh the status before publishing.');
    });
    return ()=>request.abort();
  },[active,approval,retry]);
  useEffect(()=>()=>{action.current?.abort();},[]);
  useEffect(()=>{if (!active) {action.current?.abort();action.current=null;setBusy(false);}},[active]);
  async function publish() {
    if (!active || !rendered || !state?.publication_available || state.publication || stale || action.current ||
      (approval.license_selection && (!isCompleteLicenseSelection(approval.license_selection)||!Number.isSafeInteger(approval.license_selection.identity_version)))) return;
    const request=new AbortController();action.current=request;identity.current ??= crypto.randomUUID();
    setBusy(true);setError('');
    try {
      const publication=await publishListing(approval,identity.current,request.signal);
      if (!request.signal.aborted) {const saved={publication_available:state.publication_available,publication};setState(saved);flow?.published(saved);}
    } catch (failure) {
      if (request.signal.aborted) return;
      const identityFailure=legalIdentityFailure(failure);
      if(identityFailure==='required') setError('Your legal name and country are not saved; return to Choose a licence. Publishing is not done.');
      else if(identityFailure==='conflict') setError('Your legal details need a quick check by our support team before you can publish.');
      else if(identityFailure==='unavailable') setError('We could not check your legal details right now. Retry publishing.');
      else if (axios.isAxiosError(failure) && failure.response?.status===409) {
        setStale(true);setError('The listing or files changed. Refresh the saved review and approve it again.');
      } else setError('Publication could not be confirmed. Try again to check this same publication; a retry will not create a second listing.');
    } finally {if (action.current===request) {action.current=null;setBusy(false);}}
  }
  const publication=state?.publication;
  const licenseReady=!approval.license_selection||isCompleteLicenseSelection(approval.license_selection)&&Number.isSafeInteger(approval.license_selection.identity_version);
  return <section aria-label="Publish approved listing" className="space-y-4 rounded-xl border border-indigo-200 bg-white p-5">
    <h3 className="text-lg font-semibold text-gray-900">Publish your listing</h3>
    {!state && !error && <p role="status" className="text-sm text-gray-600">Checking publication status…</p>}
    {publication ? <><p role="status" className="text-sm text-green-900">{publication.status==='published' && publication.is_listed?'Your listing is published and available in the marketplace.':'This review has been published. The listing is currently not available in marketplace discovery.'}</p>
      {approval.sample_decision==='member_files'&&<p className="text-sm text-gray-700">{sampleCount===0?'No free sample files':`${sampleCount} free sample ${sampleCount===1?'file is':'files are'} part of the purchased set.`}</p>}
      <a href={`/listings/${encodeURIComponent(publication.slug)}`} className="inline-block text-sm font-medium text-indigo-700 underline">View {publication.title}</a>
      {approval.license_selection?.kind==='custom'&&<a href={`/listings/${encodeURIComponent(publication.slug)}`} className="text-sm text-indigo-700 underline">Open verified custom licence on listing</a>}
      {publication.listing_id && <SellerAtAGlance listingId={publication.listing_id} slug={publication.slug} active={active} />}</> : state && <>
      <p className="text-sm leading-6 text-gray-700">Your approved listing is private. Publishing makes the approved description, tags, price and licence public. The files stay in your storage.</p>
      {approval.license_selection&&<p className="text-sm text-gray-700">{approval.license_selection.kind==='standard'?'Standard (recommended)':'My own licence'} · AI/ML training {approval.license_selection.ai_training?'allowed':'not allowed'} · covenant and authority {approval.license_selection.seller_acceptance.authority_confirmed?'confirmed':'not confirmed'}</p>}
      {state.publication_available ? <button type="button" onClick={publish} disabled={busy || !active || !rendered || stale || !licenseReady} className="rounded-lg bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy?'Publishing…':'Publish this listing'}</button>:
        <p className="text-sm text-gray-600">Publication is not available in this Workspace yet. Your approval is saved.</p>}
      {state.publication_available&&!busy&&(!rendered||stale||!licenseReady)&&<p role="status" className="text-sm text-amber-900">{stale?'Refresh the saved review and approve it again before publishing.':!licenseReady?(approval.license_selection&&!isCompleteLicenseSelection(approval.license_selection)?'Complete and save the licence choice in Choose a licence before publishing.':'Your legal identity and licence choice are not yet saved together. Return to Choose a licence before publishing.'):'Wait for the saved review to finish loading before publishing.'}</p>}
    </>}
    {error && <p role="alert" className="text-sm text-red-800">{error}{error.startsWith('Your legal details need')&&<> <a className="underline" href={LEGAL_IDENTITY_SUPPORT_PATH}>Contact support</a></>}</p>}
    {!busy && <button type="button" disabled={!active} onClick={()=>flow?flow.refreshPublication():setRetry(value=>value+1)} className="block w-fit pt-2 text-sm text-indigo-700 underline">Refresh publication status</button>}
  </section>;
}
