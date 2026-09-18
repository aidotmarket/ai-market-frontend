'use client';

import {createContext,useCallback,useContext,useEffect,useMemo,useState} from 'react';
import {readListingDraft,saveListingDraft,type ListingDraftContent,type SavedListingDraft} from '@/api/sellerListingDraft';

const EMPTY_DRAFT:ListingDraftContent={brief:'',title:'',description:'',category:'',tags:'',price:'',license:''};
type DraftStore={draft:SavedListingDraft|null;loaded:boolean;error:boolean;sampleCapability:boolean;sampleIndices:number[];
  selectionSavePending:boolean;selectionSaveFailed:boolean;requestLoad:()=>void;retry:()=>void;
  beginSelectionSave:()=>void;finishSelectionSave:(succeeded:boolean)=>void;setVisibleSampleIndices:(indices:number[]|null)=>void;
  saveFields:(content:ListingDraftContent)=>Promise<void>;saveSamples:(indices:number[])=>Promise<void>};
const DraftContext=createContext<DraftStore|null>(null);

type OwnerSnapshot={draft:SavedListingDraft|null;selectionSaveCount:number;selectionSaveFailed:boolean};
const owner={
  draft:null as SavedListingDraft|null,version:0,queue:Promise.resolve() as Promise<unknown>,
  pending:null as {serialized:string;version:number;id:string}|null,
  selectionSaveCount:0,selectionSaveFailed:false,listeners:new Set<(snapshot:OwnerSnapshot)=>void>(),
};
const snapshot=():OwnerSnapshot=>({draft:owner.draft,selectionSaveCount:owner.selectionSaveCount,selectionSaveFailed:owner.selectionSaveFailed});
const publish=()=>{const value=snapshot();owner.listeners.forEach(listener=>listener(value));};
const beginOwnerSelectionSave=()=>{if(owner.selectionSaveCount===0)owner.selectionSaveFailed=false;owner.selectionSaveCount+=1;publish();};
const finishOwnerSelectionSave=(succeeded:boolean)=>{owner.selectionSaveCount=Math.max(0,owner.selectionSaveCount-1);if(!succeeded)owner.selectionSaveFailed=true;else if(owner.selectionSaveCount===0)owner.selectionSaveFailed=false;publish();};
const persist=(build:(base:ListingDraftContent)=>ListingDraftContent)=>{
  const operation=owner.queue.catch(()=>undefined).then(async()=>{
    const content=build(owner.draft?.content??EMPTY_DRAFT);
    const serialized=JSON.stringify(content);
    if(!owner.pending||owner.pending.serialized!==serialized||owner.pending.version!==owner.version)
      owner.pending={serialized,version:owner.version,id:crypto.randomUUID()};
    const result=await saveListingDraft(content,owner.pending.version,owner.pending.id);
    owner.pending=null;owner.draft=result;owner.version=result.version;publish();
    return result;
  });
  owner.queue=operation;
  return operation;
};

export function resetSellerListingDraftOwnerForTests() {
  if(process.env.NODE_ENV!=='test')return;
  owner.draft=null;owner.version=0;owner.queue=Promise.resolve();owner.pending=null;
  owner.selectionSaveCount=0;owner.selectionSaveFailed=false;owner.listeners.clear();
}

export function SellerListingDraftProvider({enabled,sampleCapability,children}:{enabled:boolean;sampleCapability:boolean;children:React.ReactNode}) {
  const initial=snapshot();
  const [draft,setDraft]=useState<SavedListingDraft|null>(initial.draft);
  const [loaded,setLoaded]=useState(!enabled);
  const [error,setError]=useState(false);
  const [requested,setRequested]=useState(sampleCapability);
  const [selectionSaveCount,setSelectionSaveCount]=useState(initial.selectionSaveCount);
  const [selectionSaveFailed,setSelectionSaveFailed]=useState(initial.selectionSaveFailed);
  const [visibleSampleIndices,setVisibleSampleIndices]=useState<number[]|null>(null);
  const [retryKey,setRetryKey]=useState(0);
  useEffect(()=>{const listener=(value:OwnerSnapshot)=>{setDraft(value.draft);setSelectionSaveCount(value.selectionSaveCount);setSelectionSaveFailed(value.selectionSaveFailed);};owner.listeners.add(listener);listener(snapshot());return()=>{owner.listeners.delete(listener);};},[]);
  useEffect(()=>{if(sampleCapability)setRequested(true);},[sampleCapability]);
  useEffect(()=>{
    if(!enabled){setDraft(null);setVisibleSampleIndices(null);setLoaded(true);setError(false);return;}
    if(!requested)return;
    const controller=new AbortController();setLoaded(false);setError(false);
    owner.queue.catch(()=>undefined).then(()=>readListingDraft(controller.signal)).then(value=>{
      if(controller.signal.aborted)return;
      owner.draft=value;owner.version=value?.version??0;owner.pending=null;
      if(owner.selectionSaveCount===0)owner.selectionSaveFailed=false;
      publish();setLoaded(true);
    }).catch(()=>{if(!controller.signal.aborted){setError(true);setLoaded(false);}});
    return()=>controller.abort();
  },[enabled,retryKey,requested]);
  const beginSelectionSave=useCallback(()=>beginOwnerSelectionSave(),[]);
  const finishSelectionSave=useCallback((succeeded:boolean)=>finishOwnerSelectionSave(succeeded),[]);
  const sampleIndices=sampleCapability&&draft?.content.sample_decision==='member_files'?(draft.content.sample_object_indices??[]):[];
  const selectionMismatch=visibleSampleIndices!==null&&JSON.stringify(visibleSampleIndices)!==JSON.stringify(sampleIndices);
  const value=useMemo<DraftStore>(()=>({draft,loaded,error,sampleCapability,sampleIndices,
    selectionSavePending:selectionSaveCount>0||selectionMismatch,selectionSaveFailed,requestLoad:()=>setRequested(true),retry:()=>{setRequested(true);setRetryKey(value=>value+1);},
    beginSelectionSave,finishSelectionSave,setVisibleSampleIndices,
    saveFields:async(fields)=>{await persist(base=>{
      const indices=base.sample_object_indices??[];
      return sampleCapability&&indices.length>0?{...fields,sample_decision:'member_files',sample_object_indices:indices}:fields;
    });},
    saveSamples:async(indices)=>{beginSelectionSave();try{await persist(base=>sampleCapability
      ?{...base,sample_decision:indices.length?'member_files':'none',sample_object_indices:[...indices]}
      :base);finishSelectionSave(true);}
      catch(failure){finishSelectionSave(false);throw failure;}},
  }),[draft,loaded,error,sampleCapability,sampleIndices,selectionSaveCount,selectionSaveFailed,selectionMismatch,beginSelectionSave,finishSelectionSave]);
  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

export function useSellerListingDraft() {
  const value=useContext(DraftContext);
  if(!value)throw new Error('SellerListingDraftProvider is required');
  return value;
}

export function useSellerListingDraftStatus() {
  const value=useContext(DraftContext);
  return value ? {available:true,selectionSavePending:value.selectionSavePending,selectionSaveFailed:value.selectionSaveFailed,sampleIndices:value.sampleIndices} :
    {available:false,selectionSavePending:false,selectionSaveFailed:false,sampleIndices:[] as number[]};
}
