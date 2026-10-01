'use client';
import {createContext, useContext, useEffect, useState, type ReactNode} from 'react';
import type {ListingDraftContent} from '@/api/sellerListingDraft';
import {readListingSource, readSellerCategories, type SourceRead, type SellerCategory} from '@/api/sellerListingSource';
import {listingReviewErrorReason,readListingReview, type ListingReview, type ApprovalReceipt} from '@/api/sellerListingReview';
import {readPublication, type PublicationState} from '@/api/sellerListingPublication';
import {SELLER_SETUP_STEPS} from '@/components/onboarding/SellerSetupProgressBar';
import {getCapabilities} from '@/api/capabilities';
import type {SellerWorkspaceCapabilities, SellerWorkspaceConnection} from '@/api/sellerWorkspace';
import {useSellerListingDraft} from './SellerListingDraftStore';
import {listingSteps, type ListingStep} from './listingSteps';
import type {WorkspaceView} from './WorkspaceOverview';

type Flow = {samplesBlocked:boolean; stepsForContent:(content:ListingDraftContent)=>ListingStep[]; sourceLoaded:boolean; sourceError:string; fileRevision:number; setFilesDirty:(dirty:boolean)=>void; setListingDirty:(dirty:boolean)=>void; setLicenceDirty:(dirty:boolean)=>void; source: SourceRead|null; categories: SellerCategory[]; steps: ListingStep[]; review: ListingReview|null;
  reviewError: string; reviewLoading: boolean; publication: PublicationState|null; publicationError: string;
  refreshReview: ()=>void; refreshPublication: ()=>void; sourceSaved: (source:SourceRead)=>void;
  approved: (approval:ApprovalReceipt)=>void; published: (state:PublicationState)=>void;
  navigate: (view:WorkspaceView)=>void; licensesEnabled: boolean};
const Context = createContext<Flow|null>(null);
export function useListingFlow(){return useContext(Context);}

export function GuidedListingFlow({connections, capabilities, view, navigate, children}: {connections:SellerWorkspaceConnection[]; capabilities:SellerWorkspaceCapabilities|null; view:WorkspaceView; navigate:(view:WorkspaceView)=>void; children:ReactNode}) {
  const {draft, requestLoad, selectionSavePending, selectionSaveFailed} = useSellerListingDraft();
  const [filesDirty,setFilesDirty]=useState(false);
  const [listingDirty,setListingDirty]=useState(false);
  const [licenceDirty,setLicenceDirty]=useState(false);
  const [fileRevision,setFileRevision]=useState(0);
  const [sourceLoaded,setSourceLoaded]=useState(false);
  const [source,setSource] = useState<SourceRead|null>(null);
  const [categories,setCategories] = useState<SellerCategory[]>([]);
  const [readError,setReadError] = useState('');
  const [readRetry,setReadRetry] = useState(0);
  const [review,setReview] = useState<ListingReview|null>(null);
  const [reviewError,setReviewError] = useState('');
  const [reviewLoading,setReviewLoading] = useState(false);
  const [reviewRetry,setReviewRetry] = useState(0);
  const [publication,setPublication] = useState<PublicationState|null>(null);
  const [publicationError,setPublicationError] = useState('');
  const [publicationRetry,setPublicationRetry] = useState(0);
  const [accountNext,setAccountNext] = useState<string|null>(null);
  const [expanded,setExpanded] = useState(false);
  const licensesEnabled = capabilities?.listing_licenses === true;
  const sourcesEnabled = capabilities?.master.enabled && capabilities.sources?.enabled && capabilities.sources.status === 'available';
  const reviewEnabled = capabilities?.master.enabled && capabilities.review?.enabled && capabilities.review.status === 'available';
  useEffect(()=>{requestLoad();},[requestLoad]);
  useEffect(()=>{
    const controller=new AbortController();
    getCapabilities().then(c=>{if(!controller.signal.aborted)setAccountNext(c.seller?.effective_status==='provisioning' ? c.next_action?.step??'profile_name' : null);}).catch(()=>{});
    const changed=()=>getCapabilities().then(c=>setAccountNext(c.seller?.effective_status==='provisioning'?c.next_action?.step??'profile_name':null)).catch(()=>{});
    window.addEventListener('capabilities:changed',changed);
    return()=>{controller.abort();window.removeEventListener('capabilities:changed',changed);};
  },[]);
  useEffect(()=>{
    if(!sourcesEnabled)return;
    let alive=true;setReadError('');setSourceLoaded(false);
    Promise.all([readListingSource(),readSellerCategories()]).then(([s,c])=>{if(alive){setSource(s);setCategories(c);setSourceLoaded(true);}}).catch(()=>{if(alive)setReadError('Your saved files and category list could not be loaded. Retry before continuing.');});
    return()=>{alive=false;};
  },[sourcesEnabled,readRetry]);
  const pending=selectionSavePending||selectionSaveFailed||filesDirty;
  useEffect(()=>{
    setReview(null);setReviewError('');setReviewLoading(false);setPublication(null);
    if(!reviewEnabled||!source||!draft||pending)return;
    const controller=new AbortController();setReviewLoading(true);
    readListingReview(controller.signal).then(r=>{if(!controller.signal.aborted)setReview(r);}).catch(error=>{
      if(controller.signal.aborted)return;
      setReviewError(listingReviewErrorReason(error));
    }).finally(()=>{if(!controller.signal.aborted)setReviewLoading(false);});
    return()=>controller.abort();
  },[reviewEnabled,source,draft,pending,reviewRetry]);
  const approval=review?.approval;
  useEffect(()=>{
    setPublication(null);setPublicationError('');
    if(!approval)return;
    const controller=new AbortController();
    readPublication(approval,controller.signal).then(p=>{if(!controller.signal.aborted)setPublication(p);}).catch(()=>{if(!controller.signal.aborted)setPublicationError('Publication status could not be checked. Refresh the status before publishing.');});
    return()=>controller.abort();
  },[approval,publicationRetry]);
  const steps=listingSteps({connections,source,draft,categories,licensesEnabled,review,publication:publication?.publication??null,pending,licenceDirty,reviewReason:listingDirty?'Save your changes in Describe and price before continuing.':reviewError});
  const next=steps.find(s=>s.next);
  const flow:Flow={samplesBlocked:selectionSavePending||selectionSaveFailed,stepsForContent:content=>listingSteps({connections,source,draft:{version:draft?.version??0,updated_at:draft?.updated_at??'',content:{...draft?.content,...content}},categories,licensesEnabled,review:null,publication:null,pending,licenceDirty}),sourceLoaded,sourceError:readError,fileRevision,setFilesDirty:dirty=>{setFilesDirty(dirty);if(dirty)setFileRevision(n=>n+1);},setListingDirty,setLicenceDirty,source,categories,steps,review,reviewError,reviewLoading,publication,publicationError,licensesEnabled,navigate,
    refreshReview:()=>setReviewRetry(n=>n+1),refreshPublication:()=>setPublicationRetry(n=>n+1),sourceSaved:value=>{setSource(value);setFilesDirty(false);},
    approved:a=>setReview(r=>r?{...r,approval:a}:r),published:setPublication};
  const published=steps[5].state==='done' ? publication?.publication : null;
  return <Context.Provider value={flow}><div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_290px]">
    <aside aria-label="Listing checklist" className="rounded-xl border border-gray-200 bg-white p-4 xl:sticky xl:top-5 xl:col-start-2 xl:row-start-1">
      <button type="button" aria-expanded={expanded} aria-controls="listing-checklist-steps" onClick={()=>setExpanded(v=>!v)} className="w-full text-left font-semibold xl:hidden">Listing checklist · {published?'Published':`Next: ${next?.name??'Check publication'}`} {expanded?'−':'+'}</button>
      <h2 className="hidden font-semibold xl:block">Listing checklist</h2>
      <div id="listing-checklist-steps" className={`${expanded?'block':'hidden'} mt-4 space-y-4 xl:block`}>
        {accountNext&&<a href="#seller-setup-next" onClick={()=>window.dispatchEvent(new Event('seller-setup:next'))} className="block text-sm text-indigo-700 underline">Finish account setup: {SELLER_SETUP_STEPS.find(s=>s.id===accountNext)?.label??'Next account step'}</a>}
        <ol className="space-y-4">{steps.map((s,i)=><li key={s.view}><button type="button" aria-current={view===s.view?'step':undefined} onClick={()=>navigate(s.view)} className="text-left text-sm font-medium"><span aria-hidden="true">{s.state==='done'?'✓':s.state==='blocked'?'🔒':'○'}</span> {i+1}. {s.name} <span className="text-xs">· {s.state}{s.next?' · Next':''}</span></button>{s.reason&&<p className="mt-1 text-xs leading-5 text-gray-600">{s.reason}</p>}</li>)}</ol>
        {published?<><a href={`/listings/${encodeURIComponent(published.slug)}`} className="block text-sm text-indigo-700 underline">Published: view your listing</a><button type="button" onClick={()=>navigate('data')} className="text-sm text-indigo-700 underline">Start another listing</button><p className="text-xs text-gray-600">Choose new files and update your draft. Your published listing stays saved.</p></>:next&&<button type="button" onClick={()=>navigate(next.view)} className="w-full rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white">Next: {next.name} →</button>}
        {readError&&<p role="alert" className="text-sm text-red-800">{readError} <button onClick={()=>setReadRetry(n=>n+1)} className="underline">Retry</button></p>}
      </div>
    </aside><div className="min-w-0 space-y-6 xl:col-start-1 xl:row-start-1">{children}</div>
  </div></Context.Provider>;
}
export function StepNext({from}:{from:WorkspaceView}) {
  const flow=useListingFlow();if(!flow)return null;
  const index=flow.steps.findIndex(s=>s.view===from);
  const next=flow.steps.slice(index+1).find(s=>s.view!=='license'||flow.licensesEnabled);
  return next&&flow.steps[index]?.state==='done'?<button type="button" onClick={()=>flow.navigate(next.view)} className="rounded-lg bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white">Next: {next.name} →</button>:null;
}
