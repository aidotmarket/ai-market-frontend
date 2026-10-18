'use client';
import {useEffect,useRef,useState} from 'react';
import axios from 'axios';
import {useAuthStore} from '@/store/auth';
import type {ApprovalReceipt} from '@/api/sellerListingReview';
import {lookupPreparation,prepareListing,preparationRequest,preparationError,preparationErrorCode,preparationStatus,type PreparationRequest,type PreparedListing} from '@/api/sellerListingPreparation';
import type {SigningInstrument} from '@/api/seller-batch-signing';
import NativeSellerAuth from '@/components/NativeSellerAuth';
import WorkspaceBatchSigning from './WorkspaceBatchSigning';

export default function SellerPreparation({approval,active,onChange,onLoaded,published=false}:{approval:ApprovalReceipt;active:boolean;published?:boolean;onChange:(value:PreparedListing|null)=>void;onLoaded:(ready:boolean)=>void}) {
  const token=useAuthStore(s=>s.token);
  const [value,setValue]=useState<PreparedListing|null>(null);
  const [loaded,setLoaded]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<unknown>(null);
  const [retry,setRetry]=useState(0);
  const request=useRef<PreparationRequest|null>(null);
  const action=useRef<AbortController|null>(null);
  const changed=useRef(onChange);changed.current=onChange;
  const loadedChanged=useRef(onLoaded);loadedChanged.current=onLoaded;
  useEffect(()=>{
    setValue(null);changed.current(null);setLoaded(false);loadedChanged.current(false);setError(null);
    if(!active)return;
    const controller=new AbortController();
    lookupPreparation(approval,controller.signal).then(p=>{if(!controller.signal.aborted){setValue(p);changed.current(p);setLoaded(true);loadedChanged.current(true);}})
      .catch(e=>{if(!controller.signal.aborted)setError(e);});
    return()=>{controller.abort();action.current?.abort();action.current=null;setBusy(false);};
  },[approval,active,retry,token]);
  async function prepare() {
    if(!active||!loaded||value||action.current)return;
    const controller=new AbortController();action.current=controller;setBusy(true);setError(null);
    try {
      request.current??=preparationRequest(approval);
      const p=await prepareListing(request.current,approval,controller.signal);
      if(!controller.signal.aborted){setValue(p);changed.current(p);}
    } catch(e) {
      if(controller.signal.aborted)return;
      if(preparationErrorCode(e)==='PREPARATION_EXISTS') {
        try {const p=await lookupPreparation(approval,controller.signal);if(!controller.signal.aborted){setValue(p);changed.current(p);if(!p)setError(e);}}
        catch(failure){if(!controller.signal.aborted)setError(failure);}
      } else setError(e);
    } finally {if(action.current===controller){action.current=null;setBusy(false);}}
  }
  const needsLogin=preparationErrorCode(error)==='FIRST_PARTY_SESSION_REQUIRED'||axios.isAxiosError(error)&&error.response?.status===401;
  return <section aria-label="Listing preparation" className="space-y-4">
    <p role="status">{value?preparationStatus[published?'published':value.status]:loaded?'Ready to prepare the approved review':'Checking preparation status…'}</p>
    {loaded&&!value&&<button disabled={!active||busy} onClick={()=>void prepare()}>{busy?'Preparing…':'Prepare for publishing'}</button>}
    {!!error&&<p role="alert">{preparationError(error)}</p>}
    {needsLogin&&<NativeSellerAuth error={axios.isAxiosError(error)?error:{isAxiosError:true,response:{status:401}}} onRetry={()=>setRetry(n=>n+1)} onToken={async()=>{setRetry(n=>n+1);}}/>}
    {!busy&&<button disabled={!active} onClick={()=>setRetry(n=>n+1)}>Refresh preparation status</button>}
    {!published&&active&&value?.status==='prepared'&&value.license_selection&&<WorkspaceBatchSigning preparation={value as SigningInstrument} onSigned={rows=>{const signed=rows.find(row=>row.id===value.id);if(signed){const next={...value,...signed};setValue(next);changed.current(next);}}}/>}
  </section>;
}
