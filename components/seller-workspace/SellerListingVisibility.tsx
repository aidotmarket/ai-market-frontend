'use client';
import {useEffect,useRef,useState} from 'react';
import axios from 'axios';
import {setPublicationVisibility,type PublicationReceipt} from '@/api/sellerListingPublication';
export default function SellerListingVisibility({publication,active,onChange}:{publication:PublicationReceipt;active:boolean;onChange:(value:PublicationReceipt)=>void}) {
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [stale,setStale]=useState(false);
  const action=useRef<AbortController|null>(null);
  const identity=useRef<{id:string;status:string;listed:boolean}|null>(null);
  useEffect(()=>()=>action.current?.abort(),[]);
  useEffect(()=>{setStale(false);setError('');identity.current=null;},[publication]);
  useEffect(()=>{if (!active) {action.current?.abort();action.current=null;setBusy(false);}},[active]);
  const listed=publication.status==='published' && publication.is_listed;
  async function change() {
    if (!active || action.current || stale) return;
    const request=new AbortController();action.current=request;
    identity.current ??={id:crypto.randomUUID(),status:publication.status,listed:!listed};
    setBusy(true);setError('');
    try {
      const result=await setPublicationVisibility(publication,identity.current.listed,identity.current.id,request.signal);
      if (!request.signal.aborted) {identity.current=null;onChange(result);}
    } catch (failure) {
      if (request.signal.aborted) return;
      if (axios.isAxiosError(failure) && failure.response?.status===409) {
        setStale(true);setError('This listing changed or cannot resume. Refresh your listings and check its storage connection.');
      } else setError('The change could not be confirmed. Retry this same change or refresh your listings.');
    } finally {if (action.current===request) {action.current=null;if (!request.signal.aborted) setBusy(false);}}
  }
  if (!['published','unlisted'].includes(publication.status)) return null;
  return <div className="mt-4 space-y-2">
    <button type="button" onClick={change} disabled={!active || busy || stale} className="rounded-lg border border-indigo-300 px-3 py-2 text-sm font-medium text-indigo-800 disabled:opacity-50">{busy?'Saving…':listed?'Pause new sales':'Resume sales'}</button>
    <p className="text-xs leading-5 text-gray-500">Pausing stops new purchases. Existing buyers keep their purchased access.</p>
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
  </div>;
}
