'use client';
import {useEffect,useRef,useState} from 'react';
import {nativeAuthError} from '@/api/connector-seller-settings';
import {useAuthStore} from '@/store/auth';
import type {ApprovalReceipt} from '@/api/sellerListingReview';
import {lookupPreparation,prepareListing,preparationRequest,preparationError,preparationErrorCode,preparationUnavailable,preparationStatus,type PreparationRequest,type PreparedListing} from '@/api/sellerListingPreparation';
import type {SigningInstrument} from '@/api/seller-batch-signing';
import NativeSellerAuth from '@/components/NativeSellerAuth';
import WorkspaceBatchSigning from './WorkspaceBatchSigning';

export default function SellerPreparation({approval,active,onChange,onLoaded,published=false,publicationBlocked=false}:{approval:ApprovalReceipt;active:boolean;published?:boolean;publicationBlocked?:boolean;onChange:(value:PreparedListing|null)=>void;onLoaded:(ready:boolean)=>void}) {
  const token=useAuthStore(s=>s.token);
  const [value,setValue]=useState<PreparedListing|null>(null);
  const [loaded,setLoaded]=useState(false);
  const [unavailable,setUnavailable]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<unknown>(null);
  const [retry,setRetry]=useState(0);
  const request=useRef<PreparationRequest|null>(null);
  const action=useRef<AbortController|null>(null);
  const changed=useRef(onChange);changed.current=onChange;
  const loadedChanged=useRef(onLoaded);loadedChanged.current=onLoaded;
  useEffect(()=>{
    setValue(null);changed.current(null);setLoaded(false);loadedChanged.current(false);setError(null);setUnavailable(false);
    if(!active)return;
    const controller=new AbortController();
    lookupPreparation(approval,controller.signal).then(p=>{if(!controller.signal.aborted){setValue(p);changed.current(p);setLoaded(true);loadedChanged.current(true);}})
      .catch(e=>{if(!controller.signal.aborted){
        if(preparationUnavailable(e)){setUnavailable(true);setLoaded(true);loadedChanged.current(true);}
        else setError(e);
      }});
    return()=>{controller.abort();action.current?.abort();action.current=null;setBusy(false);};
  },[approval,active,retry,token]);
  async function prepare() {
    if(!active||!loaded||value||published||publicationBlocked||unavailable||action.current)return;
    // Publication must wait until this create has a confirmed outcome or B2 recovers it.
    const controller=new AbortController();action.current=controller;setBusy(true);setError(null);loadedChanged.current(false);
    try {
      request.current??=preparationRequest(approval);
      const p=await prepareListing(request.current,approval,controller.signal);
      if(!controller.signal.aborted){setValue(p);changed.current(p);loadedChanged.current(true);}
    } catch(e) {
      if(controller.signal.aborted)return;
      if(preparationErrorCode(e)==='PREPARATION_EXISTS') {
        try {const p=await lookupPreparation(approval,controller.signal);if(!controller.signal.aborted){setValue(p);changed.current(p);loadedChanged.current(true);if(!p)setError(e);}}
        catch(failure){if(!controller.signal.aborted)setError(failure);}
      } else setError(e);
    } finally {if(action.current===controller){action.current=null;setBusy(false);}}
  }
  const authError=nativeAuthError(error);
  if(unavailable)return null;
  return <section aria-label="Listing preparation" className="space-y-4">
    <p role="status">{published?preparationStatus.published:value?preparationStatus[value.status]:loaded?'Ready to prepare the approved review':'Checking preparation status…'}</p>
    {!published&&loaded&&!value&&<button disabled={!active||busy||publicationBlocked} onClick={()=>void prepare()}>{busy?'Preparing…':'Prepare for publishing'}</button>}
    {!!error&&<p role="alert">{preparationError(error)}</p>}
    {!!authError&&<NativeSellerAuth error={authError} onRetry={()=>setRetry(n=>n+1)} onToken={async()=>{setRetry(n=>n+1);}}/>}
    {!busy&&<button disabled={!active} onClick={()=>setRetry(n=>n+1)}>Refresh preparation status</button>}
    {!published&&active&&value?.status==='prepared'&&value.license_selection&&<WorkspaceBatchSigning preparation={value as SigningInstrument} onSigned={rows=>{const signed=rows.find(row=>row.id===value.id);if(signed){const next={...value,...signed};setValue(next);changed.current(next);}}}/>}
  </section>;
}
