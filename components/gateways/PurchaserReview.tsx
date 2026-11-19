'use client';

import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {useOptionalSellerListingDraft} from '@/components/seller-workspace/SellerListingDraftStore';
import {useAuthStore} from '@/store/auth';
import {sessionLifecycle} from '@/api/connector-seller-settings';
import {authorityAvailable,getAuthorityCapabilities,readAuthorityReview,confirmAuthorityReview,type AuthorityReview} from '@/api/sellerWorkspace';
import {VECTOR_ATTESTATION,authorityCode,authorityMessage,identityMatches} from '@/lib/vectoraizHandoff';

/** Owner-only review. Nothing from this component is passed to company approval. */
const publicLabels:Record<string,string>={title:'Title',description:'Description',category:'Category',tags:'Tags',price:'Price (USD)',license:'Licence',buyer_approval_required:'Buyer approval required',seller_attestation:'Seller attestation',object_count:'Files',file_size_bytes:'Download size (bytes)',formats_available:'Formats'};
const publicValue=(value:unknown):string=>typeof value==='boolean'?(value?'Yes':'No'):Array.isArray(value)?value.map(publicValue).join(', '):value===null?'Unknown':typeof value==='object'?JSON.stringify(value):String(value);
export default function PurchaserReview({versionId,identityTerms=[]}:{versionId?:string|null;identityTerms?:string[]}){
  const store=useOptionalSellerListingDraft();
  const [superseded,setSuperseded]=useState(false);
  const account=useAuthStore(state=>state.user?.id);
  const [reviewOwner,setReviewOwner]=useState<string|undefined>(undefined);
  const [review,setReview]=useState<AuthorityReview|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [enabled,setEnabled]=useState(false);
  const [native,setNative]=useState(false),[purchaser,setPurchaser]=useState(false);
  const [terms,setTerms]=useState(identityTerms.join('\n'));
  const [warningsAccepted,setWarningsAccepted]=useState(false);
  const pending=useRef<{binding:string;kind:string;key:string}|null>(null);
  const generation=useRef(0);
  const binding=review?.binding_hash;
  useEffect(()=>{setNative(false);setPurchaser(false);setWarningsAccepted(false);},[binding,terms]);
  useEffect(()=>{
    const run=++generation.current;const same=sessionLifecycle();
    setReview(null);setSuperseded(false);setError(null);setEnabled(false);setReviewOwner(account);setTerms(identityTerms.join('\n'));pending.current=null;
    if(!versionId)return;
    void (async()=>{try{
      const caps=await getAuthorityCapabilities();if(run!==generation.current||!same()||!authorityAvailable(caps))return;
      setEnabled(true);
      const value=await readAuthorityReview(versionId);if(run===generation.current&&same())setReview(value);
    }catch(cause){if(run===generation.current&&same())void refusal(cause);}})();
    return()=>{++generation.current;};
    // Terms are deliberately local; a caller's array identity is not a new review.
  },[versionId,account]);
  async function refusal(cause:unknown){
    setReview(null);setError(authorityMessage(cause));
    if(authorityCode(cause)==='DRAFT_SUPERSEDED'){
      setSuperseded(true);pending.current=null;
      // Adopt the current pointer, never retry confirmation against the replaced draft.
      try{if(store)await store.reload();}catch{/* The Workspace link also offers load retry. */}
    }
  }
  async function refresh(){
    if(!versionId)return;const run=++generation.current,same=sessionLifecycle();
    setBusy(true);setReview(null);setError(null);
    try{const value=await readAuthorityReview(versionId);if(run===generation.current&&same())setReview(value);}
    catch(cause){if(run===generation.current&&same())await refusal(cause);}
    finally{if(run===generation.current&&same())setBusy(false);}
  }
  async function confirm(kind:'native'|'purchaser'){
    if(!review)return;const current=review,run=generation.current,same=sessionLifecycle();
    setBusy(true);setError(null);
    if(!pending.current||pending.current.binding!==current.binding_hash||pending.current.kind!==kind)
      pending.current={binding:current.binding_hash,kind,key:crypto.randomUUID()};
    try{
      await confirmAuthorityReview(current,kind,pending.current.key);
      if(run!==generation.current||!same())return;
      pending.current=null;
      // Backend derives confirmation validity from pack/source and metadata
      // independently. Never carry ticks across a refreshed binding locally.
      const next=await readAuthorityReview(current.authority_version_id);
      if(run===generation.current&&same()){setReview(next);setNative(false);setPurchaser(false);}
    }catch(cause){
      if(run===generation.current&&same()){setReview(null);setNative(false);setPurchaser(false);setWarningsAccepted(false);await refusal(cause);}
    }finally{if(run===generation.current&&same())setBusy(false);}
  }
  if(!enabled||reviewOwner!==account)return null;
  const localTerms=terms.split(/\n/).map(t=>t.trim()).filter(Boolean);
  const view=review?.purchaser_view;
  const publicStrings=Object.values(review?.public_review.public_fields??{}).filter((v):v is string=>typeof v==='string');
  const blocked=identityMatches(localTerms,[...publicStrings,...(view?[view.door_host??'',...view.files.map(f=>f.delivery_name)]:[])]);
  const warnings=view?.files.flatMap(f=>f.columns.map(c=>c.name)).filter((name):name is string=>typeof name==='string').filter(name=>identityMatches(localTerms,[name]).length||/confidential|client|project/i.test(name))??[];
  return <section aria-label="vectorAIz review" className="space-y-3 rounded border bg-white p-4">
    <h2 className="text-lg font-semibold">Review your vectorAIz listing</h2>
    <p>{VECTOR_ATTESTATION}</p>
    {error&&<p role="alert">{error}</p>}
    {superseded&&<Link href="/dashboard/seller-workspace" className="underline">Open current draft</Link>}
    <button type="button" disabled={busy||superseded} onClick={()=>void refresh()} className="rounded border px-3 py-2">Refresh review</button>
    {review&&<>
      <h3 className="font-semibold">What everyone can see</h3>
      <dl>{Object.entries(review.public_review.public_fields).map(([key,value])=><div key={key}><dt>{publicLabels[key]??key.replaceAll('_',' ')}</dt><dd className="whitespace-pre-wrap break-words">{publicValue(value)}</dd></div>)}</dl>
      <label className="block">Names to keep private (one per line)
        <textarea value={terms} maxLength={16384} onChange={e=>setTerms(e.target.value)} className="block w-full rounded border"/>
      </label>
      <p>These names stay in this browser. Review content as well: vectors do not make it anonymous.</p>
      {blocked.length>0&&<p role="alert">A private name appears in public text, a delivery name or the gateway address: {blocked.join(', ')}. Change it before confirming.</p>}
      {!review.native_confirmed?<><label className="block"><input type="checkbox" checked={native} onChange={e=>setNative(e.target.checked)}/> I reviewed this exact pack in vectorAIz.</label>
      <button type="button" disabled={busy||!native||blocked.length>0} onClick={()=>void confirm('native')} className="rounded border px-3 py-2">Confirm pack review</button></>:<p>Pack review confirmed.</p>}
      {view&&<>
        <h3 className="font-semibold">Names your buyer will see</h3>
        <p>Private to you. These names are excluded from company approval.</p>
        <p>Gateway address: {view.door_host??'Unknown'}</p>
        {view.files.map(file=><article key={file.file_id} className="rounded border p-3">
          <h4>{file.delivery_name}</h4><p>{file.size_bytes} bytes</p>
          {file.columns.length?<ul>{file.columns.map((column,index)=><li key={index}>{column.name} — {column.type??'Unknown type'}</li>)}</ul>:<p>No columns.</p>}
        </article>)}
        {warnings.length>0&&<label className="block"><input type="checkbox" checked={warningsAccepted} onChange={e=>setWarningsAccepted(e.target.checked)}/> I reviewed these potentially private column names and choose to include them: {warnings.join(', ')}.</label>}
        {review.purchaser_confirmed?<p>Buyer names confirmed.</p>:<><label className="block"><input type="checkbox" checked={purchaser} onChange={e=>setPurchaser(e.target.checked)}/> I reviewed the names my buyer will see.</label>
        <button type="button" disabled={busy||!review.native_confirmed||!purchaser||blocked.length>0||warnings.length>0&&!warningsAccepted} onClick={()=>void confirm('purchaser')} className="rounded border px-3 py-2">Confirm buyer names</button></>}
      </>}
    </>}
  </section>;
}
