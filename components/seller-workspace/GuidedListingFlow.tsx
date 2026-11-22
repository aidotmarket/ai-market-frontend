'use client';
import {Fragment, createContext, useContext, useEffect, useState, useRef, type ReactNode} from 'react';
import axios from 'axios';
import {listingDraftError} from '@/lib/listing-action-error';
import type {ListingDraftContent} from '@/api/sellerListingDraft';
import {readListingSource, readSellerCategories, type SourceRead, type SourceSaveResponse, type SellerCategory} from '@/api/sellerListingSource';
import {readListingReview, listingReviewErrorReason, type ListingReview, type ApprovalReceipt} from '@/api/sellerListingReview';
import {readPublication, type PublicationState, type PublicationReceipt} from '@/api/sellerListingPublication';
import {SELLER_SETUP_STEPS} from '@/components/onboarding/SellerSetupProgressBar';
import {getCapabilities} from '@/api/capabilities';
import type {SellerWorkspaceCapabilities, SellerWorkspaceConnection} from '@/api/sellerWorkspace';
import {useSellerListingDraft} from './SellerListingDraftStore';
import {listingSteps, type ListingStep} from './listingSteps';
import type {WorkspaceView} from './WorkspaceOverview';
import {listingPolishEnabled} from '@/api/listingPolish';
import {listingPolish as polishCopy} from '@/lib/i18n/listing-polish';
import {pendingPolishAccept, usePendingPolishAccept} from './pendingPolishAccept';

type PublicationPolish = {
  item: PublicationReceipt;
  workspaceDraftId?: string | null;
  successorId?: string;
};

type Flow = {samplesBlocked:boolean; stepsForContent:(content:ListingDraftContent)=>ListingStep[]; sourceCurrentDraftId:string|null; sourceLoaded:boolean; sourceDraftChanged:boolean; reloadSource:()=>Promise<void>; sourceError:string; fileRevision:number; setFilesDirty:(dirty:boolean)=>void; setListingDirty:(dirty:boolean)=>void; setLicenceDirty:(dirty:boolean)=>void; source: SourceRead|null; categories: SellerCategory[]; steps: ListingStep[]; review: ListingReview|null;
  reviewError: string; reviewLoading: boolean; publication: PublicationState|null; publicationError: string;
  refreshReview: ()=>void; refreshPublication: ()=>void; sourceSaved: (response:SourceSaveResponse)=>void; sourceSaveRefused:(message:string)=>void;
  approved: (approval:ApprovalReceipt)=>void; published: (state:PublicationState)=>void;
  startAnotherListing:(recovery?:'published-refusal')=>void; startingListing:boolean; navigate: (view:WorkspaceView)=>void; licensesEnabled: boolean;
  polishLock: React.RefObject<boolean>; polishBusy: boolean; setPolishBusy:(busy:boolean)=>void;
  polishNotice: string; setPolishNotice:(notice:string)=>void; listingDirty:boolean;
  polishPublication: PublicationPolish | null; openPublicationPolish:(publication:PublicationReceipt)=>void;
  setPolishSuccessor:(draftId:string)=>void; closePublicationPolish:()=>void};
const Context = createContext<Flow|null>(null);
export function useListingFlow(){return useContext(Context);}

export function GuidedListingFlow({connections, capabilities, view, navigate, children}: {connections:SellerWorkspaceConnection[]; capabilities:SellerWorkspaceCapabilities|null; view:WorkspaceView; navigate:(view:WorkspaceView)=>void; children:ReactNode}) {
  const {draft, available, loaded, requestLoad, reload, selectionSavePending, selectionSaveFailed, startNewDraft} = useSellerListingDraft();
  const [startingListing,setStartingListing]=useState(false);
  const [startError,setStartError]=useState('');
  const [sourceSaveNotice,setSourceSaveNotice]=useState('');
  const polishLock = useRef(false);
  const [polishActionBusy, setPolishBusy] = useState(false);
  const polishEnabled = listingPolishEnabled();
  const pendingAccept = usePendingPolishAccept(polishEnabled);
  const polishBusy = polishActionBusy || !!pendingAccept;
  const [polishNotice, setPolishNotice] = useState('');
  const [polishPublication, setPolishPublication] = useState<PublicationPolish | null>(null);
  const [draftEditNotice, setDraftEditNotice] = useState('');
  const startAttempt=useRef<string|null>(null);
  const startPending=useRef(false);
  const startAnotherListing=async(recovery?:'published-refusal')=>{
    if(startPending.current||polishLock.current||polishEnabled&&pendingPolishAccept())return;
    if(polishEnabled&&listingDirty){
      if(recovery!=='published-refusal'){setDraftEditNotice(polishCopy.dirtyStartAnother);return;}
      if(!window.confirm(polishCopy.discardPublishedEdits))return;
    }
    startPending.current=true;setStartingListing(true);setStartError('');
    startAttempt.current??=crypto.randomUUID();
    try {
      await startNewDraft(startAttempt.current);
      startAttempt.current=null;
      setSource(null);setSourceLoaded(false);setFilesDirty(false);setListingDirty(false);setLicenceDirty(false);
      setFileRevision(n=>n+1);setReview(null);setReviewError('');setReviewLoading(false);
      setPublication(null);setPublicationError('');reconciled.current='';
      setPolishPublication(null);
      setPolishNotice('');
      navigate('data');
    } catch(error){
      const detail=axios.isAxiosError(error)?error.response?.data?.detail:undefined;
      if(axios.isAxiosError(error)&&error.response?.status===404&&(detail==='UNAVAILABLE'||detail?.code==='UNAVAILABLE')){
        startAttempt.current=null;
        navigate('data');
      }else setStartError(listingDraftError(error)?.message??"We couldn't start a new listing. Refresh and try again.");
    }
    finally{startPending.current=false;setStartingListing(false);}
  };
  const [filesDirty,setFilesDirty]=useState(false);
  const [listingDirty,setListingDirty]=useState(false);
  useEffect(() => {
    if (view !== 'listing' && !listingDirty && !pendingAccept) setPolishPublication(null);
  }, [view, listingDirty, pendingAccept]);
  useEffect(() => {
    if (!listingDirty) setDraftEditNotice('');
    if (!polishEnabled || !listingDirty) return;
    const confirmLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', confirmLeaving);
    return () => window.removeEventListener('beforeunload', confirmLeaving);
  }, [polishEnabled, listingDirty]);
  const [licenceDirty,setLicenceDirty]=useState(false);
  const [fileRevision,setFileRevision]=useState(0);
  const [sourceLoaded,setSourceLoaded]=useState(false);
  const [sourceCurrentDraftId,setSourceCurrentDraftId]=useState<string|null>(null);
  const [sourceDraftId,setSourceDraftId]=useState<string|null>(null);
  const [source,setSource] = useState<SourceRead|null>(null);
  const [categories,setCategories] = useState<SellerCategory[]>([]);
  const [readError,setReadError] = useState('');
  const [readRetry,setReadRetry] = useState(0);
  const [review,setReview] = useState<ListingReview|null>(null);
  const [reviewError,setReviewError] = useState('');
  const [reviewStatus,setReviewStatus] = useState('');
  const [reviewNeedsFiles,setReviewNeedsFiles] = useState(false);
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
    getCapabilities().then(c=>{if(!controller.signal.aborted)setAccountNext(c.seller?.effective_status==='provisioning' ? c.next_action?.step??c.seller.missing_steps?.[0]??null : null);}).catch(()=>{});
    const changed=()=>getCapabilities().then(c=>setAccountNext(c.seller?.effective_status==='provisioning'?c.next_action?.step??c.seller.missing_steps?.[0]??null:null)).catch(()=>{});
    window.addEventListener('capabilities:changed',changed);
    return()=>{controller.abort();window.removeEventListener('capabilities:changed',changed);};
  },[]);
  useEffect(()=>{
    if(!sourcesEnabled)return;
    let alive=true;setReadError('');setSourceLoaded(false);
    Promise.all([readListingSource(draft?.draft_id),readSellerCategories()]).then(([s,c])=>{if(alive){setSource(s.source);setSourceCurrentDraftId(s.current_draft_id);setCategories(c);setSourceDraftId(draft?.draft_id??null);setSourceLoaded(true);}}).catch(()=>{if(alive)setReadError('Your saved files and category list could not be loaded. Retry before continuing.');});
    return()=>{alive=false;};
  },[sourcesEnabled,readRetry,draft?.draft_id]);
  const reconciled=useRef('');
  const pending=selectionSavePending||selectionSaveFailed||filesDirty;
  useEffect(()=>{
    setReview(null);setReviewError('');setReviewStatus('');setReviewNeedsFiles(false);setReviewLoading(false);setPublication(null);
    if(!reviewEnabled||!source||!draft||pending)return;
    const controller=new AbortController();setReviewLoading(true);
    readListingReview(controller.signal,draft.draft_id).then(async r=>{
      if(controller.signal.aborted)return;
      if(r.source_version!==source.version||r.draft_version!==draft.version){
        const key=`${reviewRetry}:${r.source_version}:${r.draft_version}`;
        if(reconciled.current===key){setReviewNeedsFiles(r.source_version!==source.version);setReviewError(r.source_version!==source.version?'Your storage changed since you last saved. Choose your files again, then review.':'Your saved draft changed. Save your listing in Describe and price, then try again.');return;}
        reconciled.current=key;
        setReviewStatus('The saved review changed elsewhere. Reloading your saved files and draft…');
        const savedSource=await readListingSource(draft?.draft_id);
        if(controller.signal.aborted)return;
        await reload(controller.signal,()=>{setSource(savedSource.source);setSourceCurrentDraftId(savedSource.current_draft_id);});
        return;
      }
      setReview(r);
    }).catch(error=>{
      if(controller.signal.aborted)return;
      const detail=axios.isAxiosError(error)?error.response?.data?.detail:undefined;
      const code=typeof detail==='string'?detail:detail?.code;
      setReviewNeedsFiles(code==='source_connection_changed'||code==='source_required');
      setReviewError(code==='source_connection_changed'?'Your storage changed since you last saved. Choose your files again, then review.':['draft_required','source_required'].includes(code)?listingReviewErrorReason(error):"We couldn't load your saved review. Try again.");
    }).finally(()=>{if(!controller.signal.aborted){setReviewLoading(false);setReviewStatus('');}});
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
  const sourceMatchesDraft=sourceDraftId===(draft?.draft_id??null);
  const pointerMatchesDraft=!available||sourceCurrentDraftId===(draft?.draft_id??null);
  const sourceDraftChanged=sourceLoaded&&available&&loaded&&sourceMatchesDraft&&!pointerMatchesDraft;
  const reloadSource=async()=>{
    setSourceLoaded(false);
    try{await reload();}finally{setReadRetry(n=>n+1);}
  };
  const flow:Flow={startAnotherListing:recovery=>void startAnotherListing(recovery),startingListing,samplesBlocked:selectionSavePending||selectionSaveFailed,stepsForContent:content=>listingSteps({connections,source,draft:{version:draft?.version??0,updated_at:draft?.updated_at??'',content:{...draft?.content,...content}},categories,licensesEnabled,review:null,publication:null,pending,licenceDirty}),sourceCurrentDraftId,sourceLoaded:sourceLoaded&&sourceMatchesDraft&&pointerMatchesDraft,sourceDraftChanged,reloadSource,sourceError:readError,fileRevision,setFilesDirty:dirty=>{setFilesDirty(dirty);if(dirty)setFileRevision(n=>n+1);},setListingDirty,setLicenceDirty,source,categories,steps,review,reviewError,reviewLoading,publication,publicationError,licensesEnabled,navigate,
    refreshReview:()=>setReviewRetry(n=>n+1),refreshPublication:()=>setPublicationRetry(n=>n+1),sourceSaveRefused:setSourceSaveNotice,sourceSaved:value=>{setSourceSaveNotice('');setSource(value.source);setSourceCurrentDraftId(value.current_draft_id);setFilesDirty(false);},
    approved:a=>setReview(r=>r?{...r,approval:a}:r),published:setPublication,
    polishLock,polishBusy,setPolishBusy,polishPublication,polishNotice,setPolishNotice,listingDirty,
    openPublicationPolish:item=>{
      if (!polishEnabled || polishLock.current || pendingPolishAccept()) return;
      if (listingDirty) { setDraftEditNotice(polishCopy.dirtyPublication); return; }
      setPolishPublication({item,workspaceDraftId:draft?.draft_id});
      navigate('listing');
    },
    setPolishSuccessor:draftId=>setPolishPublication(current=>current?{...current,successorId:draftId}:null),
    closePublicationPolish:()=>{
      if (polishLock.current || pendingPolishAccept()) return;
      if (listingDirty) { setDraftEditNotice(polishCopy.dirtyReturn); return; }
      setPolishPublication(null);
    }};
  const published=steps[5].state==='done' ? publication?.publication : null;
  return <Context.Provider value={flow}><div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_290px]">
    <aside aria-label="Listing checklist" className="rounded-xl border border-gray-200 bg-white p-4 xl:sticky xl:top-5 xl:col-start-2 xl:row-start-1">
      <button type="button" aria-expanded={expanded} aria-controls="listing-checklist-steps" onClick={()=>setExpanded(v=>!v)} className="w-full text-left font-semibold xl:hidden">Listing checklist · {published?'Published':`Next: ${next?.name??'Check publication'}`} {expanded?'−':'+'}</button>
      <h2 className="hidden font-semibold xl:block">Listing checklist</h2>
      <div id="listing-checklist-steps" className={`${expanded?'block':'hidden'} mt-4 space-y-4 xl:block`}>
        {accountNext&&<a href="#seller-setup-next" onClick={()=>window.dispatchEvent(new Event('seller-setup:next'))} className="block text-sm text-indigo-700 underline">Finish account setup: {SELLER_SETUP_STEPS.find(s=>s.id===accountNext)?.label??'Next account step'}</a>}
        <ol className="space-y-4">{steps.map((s,i)=><li key={s.view}><button type="button" aria-current={view===s.view?'step':undefined} onClick={()=>navigate(s.view)} className="text-left text-sm font-medium"><span aria-hidden="true">{s.state==='done'?'✓':s.state==='blocked'?'🔒':'○'}</span> {i+1}. {s.name} <span className="text-xs">· {s.state==='blocked'?'Needs attention':s.state==='done'?'Complete':'To do'}{s.next?' · Next':''}</span></button>{s.reason&&s.reason!==reviewError&&<p className="mt-1 text-xs leading-5 text-gray-600">{s.reason}</p>}</li>)}</ol>
        {published?<><a href={`/listings/${encodeURIComponent(published.slug)}`} className="block text-sm text-indigo-700 underline">Published: view your listing</a><button type="button" disabled={startingListing} onClick={()=>void startAnotherListing()} className="text-sm text-indigo-700 underline">Start another listing</button><p className="text-xs text-gray-600">Choose new files and update your draft. Your published listing stays saved.</p></>:next&&<button type="button" onClick={()=>navigate(next.view)} className="w-full rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white">Next: {next.name} →</button>}
        {startError&&<p role="alert" className="text-sm text-red-800">{startError} <button disabled={startingListing} onClick={()=>void startAnotherListing()} className="underline">Retry</button></p>}
        {readError&&<p role="alert" className="text-sm text-red-800">{readError} <button onClick={()=>setReadRetry(n=>n+1)} className="underline">Retry</button></p>}
      </div>
        {reviewStatus&&<p role="status" className="text-sm text-gray-600">{reviewStatus}</p>}
        {reviewError&&<p role="alert" className="text-sm text-red-800">{reviewError} {reviewNeedsFiles?<button onClick={()=>navigate('data')} className="min-h-11 underline">Choose files</button>:<button onClick={()=>setReviewRetry(n=>n+1)} className="min-h-11 underline">Retry review</button>}</p>}
    </aside><fieldset disabled={startingListing} aria-busy={startingListing} className="min-w-0 space-y-6 border-0 p-0 xl:col-start-1 xl:row-start-1">
      {sourceSaveNotice&&<p role="alert" className="text-sm text-red-800">{sourceSaveNotice}</p>}
      {draftEditNotice && listingDirty && <p role="alert" className="text-sm text-amber-900">{draftEditNotice} {view !== 'listing' && <DescribeListingAction/>}</p>}
      {pendingAccept && view !== 'listing' && <p role="status" className="text-sm text-indigo-900">{polishCopy.acceptPendingElsewhere} <DescribeListingAction/></p>}
      {/* Keep the publication review mounted while its own successor is staged. */}
      <Fragment key={(polishPublication ? polishPublication.workspaceDraftId : draft?.draft_id)??'legacy'}>{children}</Fragment>
    </fieldset>
  </div></Context.Provider>;
}
export function StepNext({from}:{from:WorkspaceView}) {
  const flow=useListingFlow();if(!flow)return null;
  const index=flow.steps.findIndex(s=>s.view===from);
  const next=flow.steps.slice(index+1).find(s=>s.view!=='license'||flow.licensesEnabled);
  return next&&flow.steps[index]?.state==='done'?<button type="button" onClick={()=>flow.navigate(next.view)} className="rounded-lg bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white">Next: {next.name} →</button>:null;
}

export function StartAnotherListingAction(){
  const flow=useListingFlow();
  return flow?<button type="button" disabled={flow.startingListing} onClick={()=>flow.startAnotherListing('published-refusal')} className="underline">Start another listing</button>:null;
}

export function DescribeListingAction(){
  const flow=useListingFlow();
  return flow?<button type="button" onClick={()=>flow.navigate('listing')} className="underline">Describe and price</button>:<span>Use the Describe and price tab.</span>;
}
