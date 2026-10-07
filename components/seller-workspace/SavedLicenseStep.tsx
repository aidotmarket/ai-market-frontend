'use client';
import {useEffect,useRef,useState} from 'react';
import axios from 'axios';
import {createStandardSelection,isCompleteLicenseSelection,type LicenseSelection} from '@/api/listingLicenses';
import {sameLicenseSelection} from '@/api/sellerListingReview';
import {legalIdentityFailure} from '@/api/sellerLegalIdentity';
import {useSellerListingDraft} from './SellerListingDraftStore';
import {useListingFlow} from './GuidedListingFlow';
import SellerLicenseSelection,{type IdentityState} from './SellerLicenseSelection';

export default function SavedLicenseStep(){
  const store=useSellerListingDraft();const flow=useListingFlow();
  const [edited,setEdited]=useState<LicenseSelection|null>(null);
  const value=edited??store.draft?.content.license_selection??createStandardSelection();
  const [conflict,setConflict]=useState(false);const [identity,setIdentity]=useState<IdentityState>({kind:'checking'});
  const [legalDirty,setLegalDirty]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const changed=!sameLicenseSelection(value,store.draft?.content.license_selection);
  const flowRef=useRef(flow);flowRef.current=flow;
  useEffect(()=>{flowRef.current?.setLicenceDirty(changed);},[changed]);
  const ready=store.loaded&&store.available&&identity.kind==='known'&&!legalDirty&&isCompleteLicenseSelection(value);
  async function save(next=false){
    if(busy||!ready)return;
    setBusy(true);setError('');setConflict(false);
    try{if(changed){await store.saveLicenseSelection(value);setEdited(null);}if(next)flow?.navigate('listing');}
    catch(failure){setConflict(axios.isAxiosError(failure)&&failure.response?.status===409);const code=legalIdentityFailure(failure);const detail=axios.isAxiosError(failure)?failure.response?.data?.detail:null;
      setError(code==='required'?'Save your legal name and country before saving the licence choice.':code==='conflict'?'Your legal details need a quick check by support before saving.':typeof detail==='string'?detail:'Licence choice could not be saved. Retry before continuing.');
    }finally{setBusy(false);}
  }
  if(!flow?.licensesEnabled)return <><p>Licences are off in this Workspace. Continue to Describe and price to enter your licence.</p><button onClick={()=>flow?.navigate('listing')}>Next: Describe and price →</button></>;
  if(!store.available)return <p role="status">Saved drafts are unavailable in this Workspace, so your licence choice cannot be saved. Continue to Describe and price to prepare your listing, then return when saved drafts are available. <button onClick={()=>flow.navigate('listing')}>Continue to Describe and price →</button></p>;
  if(!store.loaded)return <p role="status">{store.error?'Your saved draft could not be loaded. Retry before choosing a licence.':'Loading your saved licence choice…'} {store.error&&<button onClick={store.retry}>Retry</button>}</p>;
  return <section className="space-y-4" aria-label="Choose a licence"><h2 className="text-xl font-semibold">Choose a licence</h2>
    <SellerLicenseSelection value={value} onChange={v=>{setEdited(v);setError('');}} disabled={busy} onIdentityStateChange={setIdentity} onLegalDirtyChange={setLegalDirty} legalIdentityEnabled />
    {!ready&&<p role="status" className="text-sm text-amber-900">{legalDirty?'Save your legal name and country first.':identity.kind!=='known'?'Confirm your legal name and country before saving the licence choice.':'Add signer details and tick the confirmation box to continue.'}</p>}
    {!changed&&<p role="status">Licence choice saved to your account.</p>}
    {changed&&<button type="button" disabled={busy||!ready} onClick={()=>void save()} className="rounded-lg border px-4 py-2">{busy?'Saving licence choice…':'Save licence choice'}</button>}
    <button type="button" disabled={busy||!ready} onClick={()=>void save(true)} className="rounded-lg bg-indigo-700 px-4 py-2 text-white">Next: Describe and price →</button>
    {conflict&&<button type="button" onClick={store.retry} className="text-sm text-indigo-700 underline">Reload saved draft and keep my licence edits</button>}
    {error&&<p role="alert" className="text-sm text-red-800">{error}</p>}
  </section>;
}
