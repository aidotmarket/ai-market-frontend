'use client';

import {createContext,useCallback,useContext,useEffect,useMemo,useRef,useState} from 'react';
import {readListingDraft,saveListingDraft,type ListingDraftContent,type SavedListingDraft} from '@/api/sellerListingDraft';

const EMPTY_DRAFT:ListingDraftContent={brief:'',title:'',description:'',category:'',tags:'',price:'',license:''};
type DraftStore={draft:SavedListingDraft|null;loaded:boolean;error:boolean;sampleCapability:boolean;sampleIndices:number[];
  selectionSavePending:boolean;selectionSaveFailed:boolean;requestLoad:()=>void;retry:()=>void;
  beginSelectionSave:()=>void;finishSelectionSave:(succeeded:boolean)=>void;
  saveFields:(content:ListingDraftContent)=>Promise<void>;saveSamples:(indices:number[])=>Promise<void>};
const DraftContext=createContext<DraftStore|null>(null);

export function SellerListingDraftProvider({enabled,sampleCapability,children}:{enabled:boolean;sampleCapability:boolean;children:React.ReactNode}) {
  const [draft,setDraft]=useState<SavedListingDraft|null>(null);
  const [loaded,setLoaded]=useState(!enabled);
  const [error,setError]=useState(false);
  const [sampleIndices,setSampleIndices]=useState<number[]>([]);
  const [requested,setRequested]=useState(sampleCapability);
  const [selectionSaveCount,setSelectionSaveCount]=useState(0);
  const [selectionSaveFailed,setSelectionSaveFailed]=useState(false);
  const selectionSaveCountRef=useRef(0);
  const [retryKey,setRetryKey]=useState(0);
  const current=useRef<SavedListingDraft|null>(null);
  const version=useRef(0);
  const queue=useRef<Promise<unknown>>(Promise.resolve());
  const pending=useRef<{serialized:string;version:number;id:string}|null>(null);
  useEffect(()=>{if(sampleCapability)setRequested(true);},[sampleCapability]);
  useEffect(()=>{
    if(!enabled){current.current=null;version.current=0;setDraft(null);setSampleIndices([]);setLoaded(true);setError(false);return;}
    if(!requested)return;
    const controller=new AbortController();setLoaded(false);setError(false);
    readListingDraft(controller.signal).then(value=>{if(controller.signal.aborted)return;current.current=value;version.current=value?.version??0;setDraft(value);setSampleIndices(sampleCapability?(value?.content.sample_object_indices??[]):[]);setLoaded(true);})
      .catch(()=>{if(!controller.signal.aborted){setError(true);setLoaded(false);}});
    return()=>controller.abort();
  },[enabled,retryKey,requested,sampleCapability]);
  const persist=useCallback((build:(base:ListingDraftContent)=>ListingDraftContent)=>{
    const operation=queue.current.catch(()=>undefined).then(async()=>{
      const content=build(current.current?.content??EMPTY_DRAFT);
      const serialized=JSON.stringify(content);
      if(!pending.current||pending.current.serialized!==serialized||pending.current.version!==version.current)
        pending.current={serialized,version:version.current,id:crypto.randomUUID()};
      const result=await saveListingDraft(content,pending.current.version,pending.current.id);
      pending.current=null;current.current=result;version.current=result.version;setDraft(result);
      return result;
    });
    queue.current=operation;
    return operation;
  },[]);
  const beginSelectionSave=useCallback(()=>{if(selectionSaveCountRef.current===0)setSelectionSaveFailed(false);selectionSaveCountRef.current+=1;setSelectionSaveCount(selectionSaveCountRef.current);},[]);
  const finishSelectionSave=useCallback((succeeded:boolean)=>{selectionSaveCountRef.current=Math.max(0,selectionSaveCountRef.current-1);setSelectionSaveCount(selectionSaveCountRef.current);if(!succeeded)setSelectionSaveFailed(true);else if(selectionSaveCountRef.current===0)setSelectionSaveFailed(false);},[]);
  const value=useMemo<DraftStore>(()=>({draft,loaded,error,sampleCapability,sampleIndices,
    selectionSavePending:selectionSaveCount>0,selectionSaveFailed,requestLoad:()=>setRequested(true),retry:()=>{setRequested(true);setRetryKey(value=>value+1);},
    beginSelectionSave,finishSelectionSave,
    saveFields:async(fields)=>{await persist(base=>{
      const indices=base.sample_object_indices??[];
      return sampleCapability&&indices.length>0?{...fields,sample_decision:'member_files',sample_object_indices:indices}:fields;
    });},
    saveSamples:async(indices)=>{beginSelectionSave();try{const result=await persist(base=>sampleCapability
      ?{...base,sample_decision:indices.length?'member_files':'none',sample_object_indices:[...indices]}
      :base);const confirmed=result.content.sample_decision==='member_files'?(result.content.sample_object_indices??[]):[];setSampleIndices([...confirmed]);finishSelectionSave(true);}
      catch(failure){finishSelectionSave(false);throw failure;}},
  }),[draft,loaded,error,sampleCapability,sampleIndices,selectionSaveCount,selectionSaveFailed,persist,beginSelectionSave,finishSelectionSave]);
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
