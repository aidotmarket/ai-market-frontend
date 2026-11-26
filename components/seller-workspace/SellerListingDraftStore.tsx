'use client';

import {authorityCode} from '@/lib/vectoraizHandoff';
import {createContext,useCallback,useContext,useEffect,useLayoutEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {readListingDraft,saveListingDraft,createListingDraft,type ListingDraftContent,type SavedListingDraft} from '@/api/sellerListingDraft';
import {authSessionOwner,assertAuthSessionOwner,isAuthSessionOwner} from '@/lib/auth-session-owner';
import {useAuthStore} from '@/store/auth';
import {importAuthorityDraft,type AuthorityImportRequest,type AuthorityImportReceipt} from '@/api/sellerWorkspace';
import type {LicenseSelection} from '@/api/listingLicenses';

const EMPTY_DRAFT:ListingDraftContent={brief:'',title:'',description:'',category:'',tags:'',price:'',license:''};
export class DraftNotLoadedError extends Error { constructor(){super('Load your saved draft before saving.');this.name='DraftNotLoadedError';} }
export class DraftChangedError extends Error { constructor(){super('Your saved draft changed. Reload it before saving.');this.name='DraftChangedError';} }
type DraftStore={importDraft:(request:AuthorityImportRequest)=>Promise<AuthorityImportReceipt>;draft:SavedListingDraft|null;available:boolean;loaded:boolean;error:boolean;sampleCapability:boolean;sampleIndices:number[];
  selectionSavePending:boolean;selectionSaveFailed:boolean;requestLoad:()=>void;reload:ReloadListingDraft;retry:()=>void;startNewDraft:(requestId:string)=>Promise<SavedListingDraft>;
  beginSelectionSave:()=>void;finishSelectionSave:(succeeded:boolean)=>void;setVisibleSampleIndices:(indices:number[]|null)=>void;
  saveListingFields:(fields:ListingDraftContent,baselineVersion?:number,descriptionOnly?:boolean)=>Promise<number>;saveLicenseSelection:(selection:LicenseSelection)=>Promise<void>;saveSamples:(indices:number[])=>Promise<void>};
const DraftContext=createContext<DraftStore|null>(null);
export type ReloadListingDraft = (
  signal?: AbortSignal, onLoaded?: () => void, verify?: (draft: SavedListingDraft | null) => void
) => Promise<SavedListingDraft | null>;

type OwnerSnapshot={recoveryRevision:number;loaded:boolean;draft:SavedListingDraft|null;selectionSaveCount:number;selectionSaveFailed:boolean};
const createOwner=(session:number)=>({
  session,recoveryRevision:0,
  draftAccess:{enabled:true},
  draft:null as SavedListingDraft|null,draftGeneration:0,version:0,saveRevision:0,saveAttempt:0,reconciliationRevision:0,loaded:false,queue:Promise.resolve() as Promise<unknown>,
  readSequence:0,latestAppliedRead:0,
  pending:null as {serialized:string;version:number;id:string}|null,
  selectionSaveCount:0,selectionSaveFailed:false,listeners:new Set<(snapshot:OwnerSnapshot)=>void>(),
});
let currentOwner=createOwner(authSessionOwner());
type Owner=ReturnType<typeof createOwner>;
const snapshot=(owner:Owner):OwnerSnapshot=>({recoveryRevision:owner.recoveryRevision,loaded:owner.loaded,draft:owner.draft,selectionSaveCount:owner.selectionSaveCount,selectionSaveFailed:owner.selectionSaveFailed});
const publish=(owner:Owner)=>{if(!isAuthSessionOwner(owner.session))return;const value=snapshot(owner);owner.listeners.forEach(listener=>listener(value));};
const beginOwnerSelectionSave=(owner:Owner)=>{if(!isAuthSessionOwner(owner.session))return;if(owner.selectionSaveCount===0)owner.selectionSaveFailed=false;owner.selectionSaveCount+=1;publish(owner);};
const finishOwnerSelectionSave=(owner:Owner,succeeded:boolean)=>{if(!isAuthSessionOwner(owner.session))return;owner.selectionSaveCount=Math.max(0,owner.selectionSaveCount-1);if(!succeeded)owner.selectionSaveFailed=true;else if(owner.selectionSaveCount===0)owner.selectionSaveFailed=false;publish(owner);};
type DraftBinding={draftGeneration:number;baselineVersion?:number};
const matchesDraft=(owner:Owner,draftId:string|null)=>(owner.draft?.draft_id??null)===draftId;
const persist=(owner:Owner,canAccessDraft:()=>boolean,binding:DraftBinding,build:(base:ListingDraftContent)=>ListingDraftContent)=>{
  const operation=owner.queue.catch(()=>undefined).then(async()=>{
    assertAuthSessionOwner(owner.session);
    if(!canAccessDraft()||!owner.loaded)throw new DraftNotLoadedError();
    // Bind before enqueueing: a real draft transition retires old callbacks,
    // while this store's first save assigning an ID keeps the same generation.
    if(owner.draftGeneration!==binding.draftGeneration)throw new DraftChangedError();
    const content=build(owner.draft?.content??EMPTY_DRAFT);
    const serialized=JSON.stringify(content);
    // Same-draft saves merge over the preceding commit. Explicit editor
    // baselines still reach the backend unchanged for conflict handling.
    const version=binding.baselineVersion??owner.version;
    if(!owner.pending||owner.pending.serialized!==serialized||owner.pending.version!==version)
      owner.pending={serialized,version,id:crypto.randomUUID()};
    // Count every attempt, including identical retries that reuse pending.
    owner.saveAttempt+=1;
    // Imports and publication successors require an explicit target and native session proof.
    const draft=owner.draft;
    const targetId=draft?.authority_version_id||draft?.base_listing_version_id?draft.draft_id:null;
    let result:SavedListingDraft;
    try{result=await saveListingDraft(content,owner.pending.version,owner.pending.id,...(targetId?[targetId]:[]));}
    catch(failure){
      if(authorityCode(failure)==='DRAFT_SUPERSEDED'){
        assertAuthSessionOwner(owner.session);
        owner.draftGeneration+=1;owner.saveRevision+=1;owner.pending=null;owner.loaded=false;owner.draft=null;owner.version=0;
        owner.selectionSaveCount=0;owner.selectionSaveFailed=false;
        try{
          if(canAccessDraft()){
            const readId=++owner.readSequence;
            const current=await readListingDraft();assertAuthSessionOwner(owner.session);
            if(canAccessDraft()){owner.draft=current;owner.version=current?.version??0;owner.loaded=true;owner.latestAppliedRead=readId;}
          }
        }
        catch{/* Keep editing fenced; the load retry will recover the current pointer. */}
        finally{owner.recoveryRevision+=1;publish(owner);}
      }
      throw failure;
    }
    assertAuthSessionOwner(owner.session);
    if(owner.draftGeneration!==binding.draftGeneration)throw new DraftChangedError();
    owner.pending=null;owner.draft=result;owner.version=result.version;owner.saveRevision+=1;publish(owner);
    return result;
  });
  owner.queue=operation;
  return operation;
};
const readCheckpoint=(owner:Owner)=>({id:++owner.readSequence,saveAttempt:owner.saveAttempt,saveRevision:owner.saveRevision,reconciliationRevision:owner.reconciliationRevision});
type ReadCheckpoint=ReturnType<typeof readCheckpoint>;
// A newer applied read supersedes older requests even if the version went down.
// Polish reconciliation also publishes Accept results without a normal Save.
const isCurrentRead=(owner:Owner,checkpoint:ReadCheckpoint)=>
  checkpoint.id>owner.latestAppliedRead&&checkpoint.reconciliationRevision===owner.reconciliationRevision;
const reconcileRead=(owner:Owner,value:SavedListingDraft|null,checkpoint:ReadCheckpoint,verify?:Parameters<ReloadListingDraft>[2])=>{
  if(!isCurrentRead(owner,checkpoint))return false;
  // An intervening uncertain/in-flight attempt retains its content, expected
  // version and request identity even if this GET reports equal/newer data.
  if(owner.saveAttempt!==checkpoint.saveAttempt&&owner.pending)return false;
  // A committed save or rollover invalidates overlapping reads of an older draft. Without such
  // activity, an intentional reset (including null/lower versions) is valid.
  if(owner.saveRevision!==checkpoint.saveRevision&&(!value||value.draft_id!==owner.draft?.draft_id||value.version<owner.version))return false;
  verify?.(value);
  if(!matchesDraft(owner,value?.draft_id??null)){
    owner.draftGeneration+=1;owner.selectionSaveCount=0;owner.selectionSaveFailed=false;
  }
  owner.draft=value;owner.version=value?.version??0;owner.loaded=true;owner.pending=null;owner.latestAppliedRead=checkpoint.id;
  return true;
};

export function resetSellerListingDraftOwnerForTests() {
  if(process.env.NODE_ENV!=='test')return;
  currentOwner=createOwner(authSessionOwner());
}

export function SellerListingDraftProvider({enabled,sampleCapability,children}:{enabled:boolean;sampleCapability:boolean;children:React.ReactNode}) {
  // Auth store notifications expose even coalesced account changes via the
  // existing monotonic lifecycle. Token refresh keeps this snapshot unchanged.
  const session=useSyncExternalStore(useAuthStore.subscribe,authSessionOwner,authSessionOwner);
  if(currentOwner.session!==session)currentOwner=createOwner(session);
  return <OwnedSellerListingDraftProvider key={session} owner={currentOwner} enabled={enabled} sampleCapability={sampleCapability}>{children}</OwnedSellerListingDraftProvider>;
}

function OwnedSellerListingDraftProvider({owner,enabled,sampleCapability,children}:{owner:Owner;enabled:boolean;sampleCapability:boolean;children:React.ReactNode}) {
  const initial=snapshot(owner);
  const [savedDraft,setDraft]=useState<SavedListingDraft|null>(enabled?initial.draft:null);
  const [draftLoaded,setLoaded]=useState(false);
  const [draftError,setError]=useState(false);
  const [requested,setRequested]=useState(enabled);
  const [selectionSaveCount,setSelectionSaveCount]=useState(initial.selectionSaveCount);
  const [selectionSaveFailed,setSelectionSaveFailed]=useState(initial.selectionSaveFailed);
  const [visibleSamples,setVisibleSamples]=useState<{draftGeneration:number;indices:number[]}|null>(null);
  const [retryKey,setRetryKey]=useState(0);
  const access=useMemo(()=>({ownerAccess:null as Owner['draftAccess']|null}),[enabled]);
  const committedAccess=useRef<Owner['draftAccess']|null>(null);
  useLayoutEffect(()=>{
    // A capability change retires old work even if drafts are later re-enabled.
    // A same-capability remount keeps work already admitted by the owner.
    if(owner.draftAccess.enabled!==enabled)owner.draftAccess={enabled};
    access.ownerAccess=owner.draftAccess;
    committedAccess.current=owner.draftAccess;
  },[owner,access,enabled]);
  const canAccessDraft=useCallback(()=>enabled&&access.ownerAccess===owner.draftAccess,[owner,access,enabled]);
  useEffect(()=>{
    let recoveryRevision=owner.recoveryRevision;
    const listener=(value:OwnerSnapshot)=>{
      const recovered=value.recoveryRevision!==recoveryRevision;
      recoveryRevision=value.recoveryRevision;
      if(committedAccess.current?.enabled&&committedAccess.current===owner.draftAccess){
        setDraft(value.draft);
        if(recovered){setLoaded(value.loaded);setError(!value.loaded);setVisibleSamples(null);}
      }
      // Sources can still save selections and publish their status independently.
      setSelectionSaveCount(value.selectionSaveCount);setSelectionSaveFailed(value.selectionSaveFailed);
    };
    owner.listeners.add(listener);listener(snapshot(owner));return()=>{owner.listeners.delete(listener);};
  },[owner]);
  useEffect(()=>{if(sampleCapability)setRequested(true);},[sampleCapability]);
  useEffect(()=>{
    if(!enabled){owner.loaded=false;setDraft(null);setVisibleSamples(null);setLoaded(false);setError(false);return;}
    if(!requested)return;
    // A remount must not revoke saves already admitted by this lifecycle.
    // The local loaded flag still gates new edits until this visit has loaded.
    const controller=new AbortController();setLoaded(false);setError(false);
    let checkpoint:ReadCheckpoint|undefined;
    owner.queue.catch(()=>undefined).then(()=>{assertAuthSessionOwner(owner.session);if(controller.signal.aborted||!canAccessDraft())return null;checkpoint=readCheckpoint(owner);return readListingDraft(controller.signal);}).then(value=>{
      if(controller.signal.aborted||!canAccessDraft()||!isAuthSessionOwner(owner.session)||!checkpoint)return;
      const accepted=reconcileRead(owner,value,checkpoint);
      if(accepted&&owner.selectionSaveCount===0)owner.selectionSaveFailed=false;
      publish(owner);setLoaded(owner.loaded);
    }).catch(()=>{if(!controller.signal.aborted&&canAccessDraft()&&isAuthSessionOwner(owner.session)&&checkpoint&&isCurrentRead(owner,checkpoint)){setError(true);setLoaded(false);}});
    return()=>controller.abort();
  },[owner,enabled,retryKey,requested,canAccessDraft]);
  const reload=useCallback<ReloadListingDraft>(async(signal,onLoaded,verify)=>{
    if(!canAccessDraft())throw new DraftNotLoadedError();
    await owner.queue.catch(()=>undefined);
    assertAuthSessionOwner(owner.session);
    if(!canAccessDraft())throw new DraftNotLoadedError();
    const checkpoint=readCheckpoint(owner);
    let value:SavedListingDraft|null;
    try{value=await readListingDraft(signal);}
    catch(failure){if(canAccessDraft()&&!signal?.aborted&&isAuthSessionOwner(owner.session)&&isCurrentRead(owner,checkpoint))setError(true);throw failure;}
    assertAuthSessionOwner(owner.session);
    if(!canAccessDraft())throw new DraftNotLoadedError();
    if(signal?.aborted)return value;
    if(!reconcileRead(owner,value,checkpoint,verify))return owner.draft;
    if(verify)owner.reconciliationRevision+=1;
    onLoaded?.();publish(owner);setLoaded(true);setError(false);
    return value;
  },[owner,canAccessDraft]);
  const draftGeneration=owner.draftGeneration;
  // The first save may assign an ID to an empty draft. Only an actual pointer
  // transition retires its selection callbacks.
  const beginSelectionSave=useCallback(()=>{if(owner.draftGeneration===draftGeneration)beginOwnerSelectionSave(owner);},[owner,draftGeneration]);
  const finishSelectionSave=useCallback((succeeded:boolean)=>{if(owner.draftGeneration===draftGeneration)finishOwnerSelectionSave(owner,succeeded);},[owner,draftGeneration]);
  const setVisibleSampleIndices=useCallback((indices:number[]|null)=>{
    if(!canAccessDraft()||owner.draftGeneration!==draftGeneration)return;
    setVisibleSamples(indices===null?null:{draftGeneration,indices});
  },[owner,draftGeneration,canAccessDraft]);
  // Apply availability during render, including the first render of a capability change.
  const draft=enabled?savedDraft:null;
  const loaded=enabled&&draftLoaded;
  const error=enabled&&draftError;
  const sampleIndices=sampleCapability&&draft?.content.sample_decision==='member_files'?(draft.content.sample_object_indices??[]):[];
  const visibleSampleIndices=visibleSamples?.draftGeneration===draftGeneration?visibleSamples.indices:null;
  const selectionMismatch=enabled&&visibleSampleIndices!==null&&JSON.stringify(visibleSampleIndices)!==JSON.stringify(sampleIndices);
  const value=useMemo<DraftStore>(()=>({draft,available:enabled,loaded,error,sampleCapability,sampleIndices,
    selectionSavePending:selectionSaveCount>0||selectionMismatch,selectionSaveFailed,reload,requestLoad:()=>setRequested(true),retry:()=>{setRequested(true);setRetryKey(value=>value+1);},
    importDraft:async(request)=>{
      const operation=owner.queue.catch(()=>undefined).then(async()=>{
        assertAuthSessionOwner(owner.session);
        const receipt=await importAuthorityDraft(request);
        assertAuthSessionOwner(owner.session);
        // The backend atomically adopts only a new import. Exact replay never
        // moves its pointer: read current rather than adopting the receipt ID.
        owner.draftGeneration+=1;owner.saveRevision+=1;owner.pending=null;
        owner.loaded=false;owner.draft=null;owner.version=0;publish(owner);setLoaded(false);setError(false);
        owner.selectionSaveCount=0;owner.selectionSaveFailed=false;setVisibleSamples(null);
        // The receipt belongs to the committed POST. The caller can retain it
        // before attempting a separate, retryable current-draft read.
        return receipt;
      });
      owner.queue=operation;return operation;
    },
    startNewDraft:async(requestId)=>{
      const operation=owner.queue.catch(()=>undefined).then(async()=>{
        assertAuthSessionOwner(owner.session);
        if(!canAccessDraft())throw new DraftNotLoadedError();
        const result=await createListingDraft(requestId);
        assertAuthSessionOwner(owner.session);
        owner.draft=result;owner.draftGeneration+=1;owner.version=result.version;owner.loaded=true;owner.pending=null;owner.saveRevision+=1;
        owner.selectionSaveCount=0;owner.selectionSaveFailed=false;setVisibleSamples(null);
        publish(owner);if(canAccessDraft()){setLoaded(true);setError(false);}return result;
      });
      owner.queue=operation;return operation;
    },
    beginSelectionSave,finishSelectionSave,setVisibleSampleIndices,
    saveListingFields:async(fields,baselineVersion,descriptionOnly)=>{if(!loaded)throw new DraftNotLoadedError();const result=await persist(owner,canAccessDraft,{draftGeneration,baselineVersion},base=>descriptionOnly?{...base,description:fields.description}:({
      ...base,brief:fields.brief,title:fields.title,description:fields.description,category:fields.category,
      tags:fields.tags,price:fields.price,license:fields.license,description_source_version:fields.description_source_version??null,
    }));return result.version;},
    saveLicenseSelection:async(selection)=>{if(!loaded)throw new DraftNotLoadedError();await persist(owner,canAccessDraft,{draftGeneration},base=>({...base,license_selection:selection}));},
    saveSamples:async(indices)=>{if(!loaded||!canAccessDraft())throw new DraftNotLoadedError();beginSelectionSave();try{await persist(owner,canAccessDraft,{draftGeneration},base=>sampleCapability
      ?{...base,sample_decision:indices.length?'member_files':'none',sample_object_indices:[...indices]}
      :base);finishSelectionSave(true);}
      catch(failure){finishSelectionSave(false);throw failure;}},
  }),[owner,draft,draftGeneration,enabled,loaded,error,sampleCapability,sampleIndices,selectionSaveCount,selectionSaveFailed,selectionMismatch,reload,beginSelectionSave,finishSelectionSave,setVisibleSampleIndices,canAccessDraft]);
  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

export function useSellerListingDraft() {
  const value=useContext(DraftContext);
  if(!value)throw new Error('SellerListingDraftProvider is required');
  return value;
}

export function useSellerListingDraftStatus() {
  const value=useContext(DraftContext);
  return value ? {draft_id:value.draft?.draft_id,available:value.available,selectionSavePending:value.selectionSavePending,selectionSaveFailed:value.selectionSaveFailed,sampleIndices:value.sampleIndices} :
    {draft_id:undefined,available:false,selectionSavePending:false,selectionSaveFailed:false,sampleIndices:[] as number[]};
}

/** The gateway importer has no Workspace provider; bucket imports use the
 * provider queue so old editor callbacks cannot write into the imported draft. */
export function useOptionalSellerListingDraft(){return useContext(DraftContext);}
