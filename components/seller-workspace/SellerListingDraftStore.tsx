'use client';

import {createContext,useCallback,useContext,useEffect,useMemo,useState,useSyncExternalStore} from 'react';
import {readListingDraft,saveListingDraft,type ListingDraftContent,type SavedListingDraft} from '@/api/sellerListingDraft';
import {authSessionOwner,assertAuthSessionOwner,isAuthSessionOwner} from '@/lib/auth-session-owner';
import {useAuthStore} from '@/store/auth';
import type {LicenseSelection} from '@/api/listingLicenses';

const EMPTY_DRAFT:ListingDraftContent={brief:'',title:'',description:'',category:'',tags:'',price:'',license:''};
export class DraftNotLoadedError extends Error { constructor(){super('Load your saved draft before saving.');this.name='DraftNotLoadedError';} }
type DraftStore={draft:SavedListingDraft|null;available:boolean;loaded:boolean;error:boolean;sampleCapability:boolean;sampleIndices:number[];
  selectionSavePending:boolean;selectionSaveFailed:boolean;requestLoad:()=>void;reload:(signal?:AbortSignal,onLoaded?:()=>void)=>Promise<SavedListingDraft|null>;retry:()=>void;
  beginSelectionSave:()=>void;finishSelectionSave:(succeeded:boolean)=>void;setVisibleSampleIndices:(indices:number[]|null)=>void;
  saveListingFields:(fields:ListingDraftContent,baselineVersion?:number)=>Promise<number>;saveLicenseSelection:(selection:LicenseSelection)=>Promise<void>;saveSamples:(indices:number[])=>Promise<void>};
const DraftContext=createContext<DraftStore|null>(null);

type OwnerSnapshot={draft:SavedListingDraft|null;selectionSaveCount:number;selectionSaveFailed:boolean};
const createOwner=(session:number)=>({
  session,
  draft:null as SavedListingDraft|null,version:0,saveRevision:0,loaded:false,queue:Promise.resolve() as Promise<unknown>,
  pending:null as {serialized:string;version:number;id:string}|null,
  selectionSaveCount:0,selectionSaveFailed:false,listeners:new Set<(snapshot:OwnerSnapshot)=>void>(),
});
let currentOwner=createOwner(authSessionOwner());
type Owner=ReturnType<typeof createOwner>;
const snapshot=(owner:Owner):OwnerSnapshot=>({draft:owner.draft,selectionSaveCount:owner.selectionSaveCount,selectionSaveFailed:owner.selectionSaveFailed});
const publish=(owner:Owner)=>{if(!isAuthSessionOwner(owner.session))return;const value=snapshot(owner);owner.listeners.forEach(listener=>listener(value));};
const beginOwnerSelectionSave=(owner:Owner)=>{if(!isAuthSessionOwner(owner.session))return;if(owner.selectionSaveCount===0)owner.selectionSaveFailed=false;owner.selectionSaveCount+=1;publish(owner);};
const finishOwnerSelectionSave=(owner:Owner,succeeded:boolean)=>{if(!isAuthSessionOwner(owner.session))return;owner.selectionSaveCount=Math.max(0,owner.selectionSaveCount-1);if(!succeeded)owner.selectionSaveFailed=true;else if(owner.selectionSaveCount===0)owner.selectionSaveFailed=false;publish(owner);};
const persist=(owner:Owner,build:(base:ListingDraftContent)=>ListingDraftContent,baselineVersion?:number)=>{
  const operation=owner.queue.catch(()=>undefined).then(async()=>{
    assertAuthSessionOwner(owner.session);
    if(!owner.loaded)throw new DraftNotLoadedError();
    const content=build(owner.draft?.content??EMPTY_DRAFT);
    const serialized=JSON.stringify(content);
    const version=baselineVersion??owner.version;
    if(!owner.pending||owner.pending.serialized!==serialized||owner.pending.version!==version)
      owner.pending={serialized,version,id:crypto.randomUUID()};
    const result=await saveListingDraft(content,owner.pending.version,owner.pending.id);
    assertAuthSessionOwner(owner.session);
    owner.pending=null;owner.draft=result;owner.version=result.version;owner.saveRevision+=1;publish(owner);
    return result;
  });
  owner.queue=operation;
  return operation;
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
  const [draft,setDraft]=useState<SavedListingDraft|null>(initial.draft);
  const [loaded,setLoaded]=useState(false);
  const [error,setError]=useState(false);
  const [requested,setRequested]=useState(enabled);
  const [selectionSaveCount,setSelectionSaveCount]=useState(initial.selectionSaveCount);
  const [selectionSaveFailed,setSelectionSaveFailed]=useState(initial.selectionSaveFailed);
  const [visibleSampleIndices,setVisibleSampleIndices]=useState<number[]|null>(null);
  const [retryKey,setRetryKey]=useState(0);
  useEffect(()=>{const listener=(value:OwnerSnapshot)=>{setDraft(value.draft);setSelectionSaveCount(value.selectionSaveCount);setSelectionSaveFailed(value.selectionSaveFailed);};owner.listeners.add(listener);listener(snapshot(owner));return()=>{owner.listeners.delete(listener);};},[owner]);
  useEffect(()=>{if(sampleCapability)setRequested(true);},[sampleCapability]);
  useEffect(()=>{
    if(!enabled){owner.loaded=false;setDraft(null);setVisibleSampleIndices(null);setLoaded(false);setError(false);return;}
    if(!requested)return;
    // A remount must not revoke saves already admitted by this lifecycle.
    // The local loaded flag still gates new edits until this visit has loaded.
    const controller=new AbortController();setLoaded(false);setError(false);
    owner.queue.catch(()=>undefined).then(()=>{assertAuthSessionOwner(owner.session);if(controller.signal.aborted)return null;return readListingDraft(controller.signal);}).then(value=>{
      if(controller.signal.aborted||!isAuthSessionOwner(owner.session))return;
      owner.draft=value;owner.version=value?.version??0;owner.loaded=true;owner.pending=null;
      if(owner.selectionSaveCount===0)owner.selectionSaveFailed=false;
      publish(owner);setLoaded(true);
    }).catch(()=>{if(!controller.signal.aborted&&isAuthSessionOwner(owner.session)){setError(true);setLoaded(false);}});
    return()=>controller.abort();
  },[owner,enabled,retryKey,requested]);
  const reload=useCallback(async(signal?:AbortSignal,onLoaded?:()=>void)=>{
    await owner.queue.catch(()=>undefined);
    assertAuthSessionOwner(owner.session);
    const saveRevision=owner.saveRevision;
    const value=await readListingDraft(signal);
    assertAuthSessionOwner(owner.session);
    if(signal?.aborted)return value;
    // Only an overlapping successful save makes an older read stale. Fresh
    // reads must still be able to load an intentional reset (including null).
    if(owner.saveRevision!==saveRevision&&(!value||value.version<owner.version))return owner.draft;
    owner.draft=value;owner.version=value?.version??0;owner.loaded=true;owner.pending=null;
    onLoaded?.();publish(owner);setLoaded(true);setError(false);
    return value;
  },[owner]);
  const beginSelectionSave=useCallback(()=>beginOwnerSelectionSave(owner),[owner]);
  const finishSelectionSave=useCallback((succeeded:boolean)=>finishOwnerSelectionSave(owner,succeeded),[owner]);
  const sampleIndices=sampleCapability&&draft?.content.sample_decision==='member_files'?(draft.content.sample_object_indices??[]):[];
  const selectionMismatch=visibleSampleIndices!==null&&JSON.stringify(visibleSampleIndices)!==JSON.stringify(sampleIndices);
  const value=useMemo<DraftStore>(()=>({draft,available:enabled,loaded,error,sampleCapability,sampleIndices,
    selectionSavePending:selectionSaveCount>0||selectionMismatch,selectionSaveFailed,reload,requestLoad:()=>setRequested(true),retry:()=>{setRequested(true);setRetryKey(value=>value+1);},
    beginSelectionSave,finishSelectionSave,setVisibleSampleIndices,
    saveListingFields:async(fields,baselineVersion)=>{if(!loaded)throw new DraftNotLoadedError();const result=await persist(owner,base=>({
      ...base,brief:fields.brief,title:fields.title,description:fields.description,category:fields.category,
      tags:fields.tags,price:fields.price,license:fields.license,description_source_version:fields.description_source_version??null,
    }),baselineVersion);return result.version;},
    saveLicenseSelection:async(selection)=>{if(!loaded)throw new DraftNotLoadedError();await persist(owner,base=>({...base,license_selection:selection}));},
    saveSamples:async(indices)=>{if(!loaded)throw new DraftNotLoadedError();beginSelectionSave();try{await persist(owner,base=>sampleCapability
      ?{...base,sample_decision:indices.length?'member_files':'none',sample_object_indices:[...indices]}
      :base);finishSelectionSave(true);}
      catch(failure){finishSelectionSave(false);throw failure;}},
  }),[owner,draft,enabled,loaded,error,sampleCapability,sampleIndices,selectionSaveCount,selectionSaveFailed,selectionMismatch,reload,beginSelectionSave,finishSelectionSave]);
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
