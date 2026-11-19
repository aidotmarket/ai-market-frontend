'use client';

import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {useAuthStore} from '@/store/auth';
import {sessionLifecycle} from '@/api/connector-seller-settings';
import {authorityAvailable,getAuthorityCapabilities,importAuthorityDraft,listSellerWorkspaceConnections,listWorkspaceObjects,type AuthorityImportRequest,type AuthorityImportReceipt,type AuthorityTarget,type SellerWorkspaceConnection} from '@/api/sellerWorkspace';
import {describeGatewayFile,getGatewayFile,listSellerGateways,readAuthorityGatewayFiles,type AuthorityGateway} from '@/api/sellerGateways';
import {resolveFolder} from './folderSelection';
import {useOptionalSellerListingDraft} from './SellerListingDraftStore';
import PurchaserReview from '@/components/gateways/PurchaserReview';
import {HANDOFF_CAPTURED,authorityCode,authorityMessage,bucketTarget,clearHandoff,consumeHandoff,HandoffError,identityMatches,isBucket,matchGateway,matchingConnections,saveAuthorityReceipt,readAuthorityReceipt,VECTOR_ATTESTATION,type PendingHandoff} from '@/lib/vectoraizHandoff';
import {readListingDraft,type SavedListingDraft} from '@/api/sellerListingDraft';
import type {GatewayFile} from '@/types/sellerGateway';

const routeFor=(mode:'bucket'|'gateway')=>mode==='bucket'?'/dashboard/seller-workspace':'/dashboard/gateways';
export default function VectoraizImport({mode='bucket',gatewayId}:{mode?:'bucket'|'gateway';gatewayId?:string}){
  const account=useAuthStore(state=>state.user?.id);
  const email=useAuthStore(state=>state.user?.email);
  const store=useOptionalSellerListingDraft();
  const [gatewayDraft,setGatewayDraft]=useState<SavedListingDraft|null|undefined>(undefined);
  const [intake,setIntake]=useState(0);
  const [expired,setExpired]=useState(false);
  const [canRestore,setCanRestore]=useState(false);
  const [pending,setPending]=useState<PendingHandoff|null>(null);
  const [connections,setConnections]=useState<SellerWorkspaceConnection[]>([]);
  const [gateways,setGateways]=useState<AuthorityGateway[]>([]);
  const [choice,setChoice]=useState('');
  const [target,setTarget]=useState<AuthorityTarget|null>(null);
  const [files,setFiles]=useState<GatewayFile[]>([]);
  const [candidates,setCandidates]=useState<GatewayFile[]>([]);
  const [terms,setTerms]=useState('');
  const [accountConfirmed,setAccountConfirmed]=useState(false),[targetConfirmed,setTargetConfirmed]=useState(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
  const [progress,setProgress]=useState<string[]>([]);
  const [receipt,setReceipt]=useState<AuthorityImportReceipt|null>(null);
  const request=useRef<AuthorityImportRequest|null>(null);
  const restoreAllowed=useRef(false);
  const bootstrap=useRef<{account:string;generation:number;promise:Promise<PendingHandoff|null>}|null>(null);
  const run=useRef(0);
  const importing=useRef<number|null>(null);
  const abort=useRef<AbortController|null>(null);
  useEffect(()=>{
    const captured=()=>{++run.current;abort.current?.abort();bootstrap.current=null;request.current=null;setPending(null);setReceipt(null);setTarget(null);setFiles([]);setCandidates([]);setConnections([]);setGateways([]);setChoice('');setTerms('');setAccountConfirmed(false);setTargetConfirmed(false);setBusy(false);setProgress([]);setIntake(v=>v+1);};
    window.addEventListener(HANDOFF_CAPTURED,captured);
    return()=>window.removeEventListener(HANDOFF_CAPTURED,captured);
  },[]);
  useEffect(()=>{
    setExpired(false);
    if(!pending)return;
    const expire=()=>{if(importing.current===run.current)return;++run.current;abort.current?.abort();setBusy(false);setExpired(true);request.current=null;setTarget(null);setAccountConfirmed(false);setTargetConfirmed(false);setError('This import link expired. Export the listing again from vectorAIz, then open the new link.');};
    if(pending.expires<=Date.now()){expire();return;}
    const timer=setTimeout(expire,pending.expires-Date.now());return()=>clearTimeout(timer);
  },[pending]);
  useEffect(()=>{
    const generation=++run.current;const same=sessionLifecycle();
    restoreAllowed.current=false;setCanRestore(false);setPending(null);setReceipt(null);setGatewayDraft(undefined);setTarget(null);setError(null);setTerms('');request.current=null;
    if(!account)return;
    // One consumption per mounted entry, including React Strict Mode's replay.
    if(bootstrap.current?.account!==account){
      const entry={account,generation,promise:Promise.resolve<PendingHandoff|null>(null)};
      bootstrap.current=entry;
      const ownsEntry=()=>same()&&bootstrap.current===entry&&entry.generation===run.current;
      entry.promise=(async()=>{
        const caps=await getAuthorityCapabilities();
        if(!ownsEntry())return null;
        restoreAllowed.current=authorityAvailable(caps);
        if(!restoreAllowed.current){clearHandoff();return null;}
        return consumeHandoff(account,routeFor(mode),ownsEntry);
      })();
    }
    bootstrap.current.generation=generation;
    void bootstrap.current.promise.then(async item=>{
      if(!same()||generation!==run.current)return;
      if(!item){
        if(mode==='gateway'&&restoreAllowed.current){const draft=await readListingDraft();if(!same()||generation!==run.current)return;setGatewayDraft(draft);}
        setCanRestore(true);return;
      }
      setPending(item);
      if(isBucket(item.handoff)){
        const list=matchingConnections(item.handoff,await listSellerWorkspaceConnections());
        if(!same()||generation!==run.current)return;
        setConnections(list);setChoice(list.length===1?list[0].id:'');
      }else{
        const list=(await listSellerGateways()).filter(g=>g.gateway_metadata_revision!==undefined&&(!gatewayId||g.gateway_id===gatewayId));
        if(!same()||generation!==run.current)return;
        setGateways(list);setChoice(list.length===1?list[0].gateway_id:'');
      }
    }).catch(cause=>{if(same()&&generation===run.current)setError(authorityMessage(cause)+' Open the link from vectorAIz again to retry.');});
    return()=>{++run.current;abort.current?.abort();};
  },[account,mode,gatewayId,intake]);
  useEffect(()=>{
    if(!account||!canRestore||!restoreAllowed.current||pending||receipt)return;
    const saved=readAuthorityReceipt(account);
    if(!saved)return;
    if(mode==='bucket'&&store?.loaded&&store.draft?.draft_id===saved.draft_id&&saved.listing_id===null)setReceipt(saved);
  },[account,canRestore,pending,receipt,mode,store?.loaded,store?.draft?.draft_id]);
  const current=()=>{
    if(pending&&pending.expires<=Date.now()){setExpired(true);setError('This import link expired. Export the listing again from vectorAIz, then open the new link.');return false;}
    return !!pending&&pending.account===useAuthStore.getState().user?.id;
  };
  async function checkFiles(){
    if(!pending||!choice||!current())return;
    const generation=run.current,same=sessionLifecycle();
    setBusy(true);setTarget(null);setTargetConfirmed(false);setCandidates([]);setFiles([]);setError(null);
    if(request.current){setPending({...pending,key:crypto.randomUUID()});request.current=null;}
    try{
      let next:AuthorityTarget;
      if(isBucket(pending.handoff)){
        const connection=connections.find(c=>c.id===choice);if(!connection)throw new HandoffError();
        const objects=await resolveFolder(choice,pending.handoff.pack_prefix,listWorkspaceObjects,{cancelled:()=>generation!==run.current||!same()});
        next={type:'bucket',selection:await bucketTarget(pending.handoff,connection,objects)};
      }else{
        const selection=await readAuthorityGatewayFiles(choice);
        if(!selection)throw new HandoffError();
        const candidates=selection.files.filter(f=>f.present&&pending.handoff&&!isBucket(pending.handoff)&&pending.handoff.files.some(p=>p.size===f.size_bytes)&&
          (f.description.state!=='described'||!f.description.described_at||Date.parse(f.changed_at)>Date.parse(f.description.described_at)));
        if(candidates.length){
          if(same()&&generation===run.current)setCandidates(candidates);
          return;
        }
        const selected=matchGateway(pending.handoff,selection.files);
        next={type:'gateway',gateway_id:choice,file_ids:selected.map(f=>f.file_id),expected_metadata_revision:selection.revision};
        if(same()&&generation===run.current)setFiles(selected);
      }
      if(same()&&generation===run.current)setTarget(next);
    }catch(cause){if(same()&&generation===run.current)setError(authorityMessage(cause));}
    finally{if(same()&&generation===run.current)setBusy(false);}
  }
  async function describe(){
    if(!current())return;
    const generation=run.current,same=sessionLifecycle();const controller=new AbortController();abort.current=controller;
    setBusy(true);setProgress([]);setError(null);
    try{
      for(const file of candidates){
        if(!same()||generation!==run.current||!current())return;
        if(same()&&generation===run.current)setProgress(p=>[...p,file.display_name+': checking']);
        let result=await describeGatewayFile(choice,file.file_id);
        for(let poll=0;poll<60&&result.data.description.state!=='described';poll++){
          if(result.data.description.state==='failed')throw new HandoffError();
          const delay=Math.min(60,Math.max(1,result.retryAfter??2))*1000;
          await new Promise<void>((resolve,reject)=>{
            const timer=setTimeout(()=>{controller.signal.removeEventListener('abort',cancel);resolve();},delay);
            const cancel=()=>{clearTimeout(timer);reject(new Error('cancelled'));};
            controller.signal.addEventListener('abort',cancel,{once:true});
            if(controller.signal.aborted)cancel();
          });
          if(!same()||generation!==run.current||!current())return;
          result=await getGatewayFile(choice,file.file_id);
        }
        if(result.data.description.state!=='described')throw new HandoffError();
        if(same()&&generation===run.current)setProgress(p=>[...p,file.display_name+': ready']);
      }
      // Describing changes metadata. Take every selection page again rather
      // than mixing the old selection with a later gateway detail revision.
      if(same()&&generation===run.current){setCandidates([]);await checkFiles();}
    }catch(cause){if(same()&&generation===run.current)setError(authorityMessage(cause));}
    finally{if(same()&&generation===run.current)setBusy(false);}
  }
  async function save(){
    if(!pending||!target||!accountConfirmed||!targetConfirmed||!current()||blocked.length>0)return;
    const generation=run.current,same=sessionLifecycle();
    setBusy(true);setError(null);
    importing.current=generation;
    let completed=false;
    // A network-uncertain retry reuses this exact request and idempotency key.
    request.current??={contract_version:'listing-authority-v1',handoff:pending.encoded,idempotency_key:pending.key,
      account_id:account!,account_confirmed:true,target_confirmed:true,target};
    try{
      const result=await (store?store.importDraft(request.current):importAuthorityDraft(request.current));
      if(!same()||generation!==run.current)return;
      if(!store){
        // The current draft read, rather than a replayed receipt, owns recovery.
        const draft=await readListingDraft();if(!same()||generation!==run.current)return;setGatewayDraft(draft);
      }
      completed=true;saveAuthorityReceipt(account!,result);setReceipt(result);setPending(null);request.current=null;
    }catch(cause){
      if(same()&&generation===run.current){
        if(authorityCode(cause)==='AUTHORITY_PURCHASER_STALE'){
          request.current=null;setPending({...pending,key:crypto.randomUUID()});
          setTarget(null);setTargetConfirmed(false);setFiles([]);
          await checkFiles();
        }
        if(same()&&generation===run.current)setError(authorityMessage(cause));
      }
    }finally{
      if(importing.current===generation)importing.current=null;
      if(same()&&generation===run.current){
        setBusy(false);
        // Once sent, the server owns completion. Expiry only blocks a new POST.
        if(!completed&&pending.expires<=Date.now())setPending({...pending});
      }
    }
  }
  if(!account||bootstrap.current?.account!==account)return null;
  // A durable draft reference takes precedence once the backend supplies it.
  const draftVersion=store?.loaded?store.draft?.authority_version_id:gatewayDraft===null?null:gatewayDraft?.authority_version_id;
  const currentDraft=store?.loaded?store.draft:gatewayDraft;
  const matchingReceipt=receipt&&(currentDraft===undefined?mode!=='bucket':currentDraft?.draft_id===receipt.draft_id)?receipt:null;
  const reviewVersion=restoreAllowed.current?(draftVersion!==undefined?draftVersion:matchingReceipt?.authority_version_id):null;
  if(reviewVersion&&!pending)return <section className="space-y-3 rounded border bg-white p-4"><h2>Imported from vectorAIz</h2>
    <p>Your private draft is saved. Review it before publishing.</p>
    {matchingReceipt?.listing_id&&<Link className="underline" href={'/dashboard/listings/'+encodeURIComponent(matchingReceipt.listing_id)+'/edit'}>Continue editing the listing</Link>}
    <PurchaserReview versionId={reviewVersion} identityTerms={terms.split('\n').filter(Boolean)}/>
  </section>;
  if(!pending||pending.account!==account)return null;
  const h=pending.handoff,bucket=isBucket(h);
  const gateway=gateways.find(g=>g.gateway_id===choice);
  let host='';try{host=new URL(gateway?.door_url??'').hostname;}catch{/* Unknown host remains visible in the purchaser review. */}
  const blocked=identityMatches(terms.split('\n').filter(Boolean),[h.draft.title,h.draft.description,h.draft.category,h.draft.tags,...(isBucket(h)?[h.bucket,h.pack_prefix]:[]),host,...files.map(f=>f.display_name)]);
  return <section aria-label="From vectorAIz" className="space-y-3 rounded border bg-white p-4">
    <h2 className="text-lg font-semibold">From vectorAIz</h2>
    <p>{VECTOR_ATTESTATION}</p><p>This link is a draft to review. It does not prove who created the pack.</p>
    <dl>{Object.entries(h.draft).map(([key,value])=><div key={key}><dt>{key}</dt><dd className="whitespace-pre-wrap break-words">{value||'Empty'}</dd></div>)}</dl>
    {store?.draft&&<details><summary>Your existing draft</summary><dl>{Object.entries(store.draft.content).filter(([,v])=>typeof v==='string').map(([key,v])=><div key={key}><dt>{key}</dt><dd>{String(v)}</dd></div>)}</dl></details>}
    <p>A new private draft will be created. An unpublished vectorAIz import can be replaced. Finish any ordinary website listing in progress in Seller Workspace before importing.</p>
    <label className="block">Choose {bucket?'a storage connection':'a gateway'}
      <select value={choice} disabled={busy} onChange={e=>{setChoice(e.target.value);setPending({...pending,key:crypto.randomUUID()});setTarget(null);setFiles([]);setCandidates([]);setTargetConfirmed(false);request.current=null;}} className="ml-2 rounded border">
        <option value="">Choose…</option>
        {bucket?connections.map(c=><option key={c.id} value={c.id}>{c.bucket} · {c.prefix||'Whole bucket'}</option>):gateways.map(g=><option key={g.gateway_id} value={g.gateway_id}>{g.name}</option>)}
      </select>
    </label>
    {bucket&&connections.length===0&&<p>No matching storage connection. <Link href="/dashboard/seller-workspace?view=storage" className="underline">Connect your storage</Link>, then open the link from vectorAIz again.</p>}
    {!bucket&&gateways.length===0&&<p>No compatible gateway is available. {gatewayId?<><Link className="underline" href="/dashboard/gateways">Open the gateway list</Link> and use “Add a gateway”</>:<>Use “Add a gateway” below to set up a gateway</>}, then open the link from vectorAIz again.</p>}
    <label className="block">Names to keep private (one per line)<textarea className="block w-full rounded border" value={terms} maxLength={16384} onChange={e=>{setTerms(e.target.value);setTargetConfirmed(false);}}/></label>
    <p>These names stay in this browser.</p>
    <button type="button" disabled={busy||expired||!choice} onClick={()=>void checkFiles()} className="rounded border px-3 py-2">Check uploaded files</button>
    {candidates.length>0&&<div><p>These files need a fresh description before they can be checked:</p><ul>{candidates.map(f=><li key={f.file_id}>{f.display_name}: {f.description.state}</li>)}</ul>
      <button type="button" disabled={busy||expired} onClick={()=>void describe()} className="rounded border px-3 py-2">Describe these files</button></div>}
    {progress.map((message,index)=><p role="status" key={index}>{message}</p>)}
    {files.length>0&&<ul>{files.map(f=><li key={f.file_id}>{f.display_name} · {f.size_bytes} bytes</li>)}</ul>}
    {blocked.length>0&&<p role="alert">A private name appears in public text, a delivery name or the gateway address: {blocked.join(', ')}. Change it and export again before importing.</p>}
    {target&&<><label className="block"><input type="checkbox" checked={accountConfirmed} onChange={e=>setAccountConfirmed(e.target.checked)}/> Import for my signed-in account: {email??account}</label>
      <label className="block"><input type="checkbox" checked={targetConfirmed} onChange={e=>setTargetConfirmed(e.target.checked)}/> I reviewed this draft and the selected {bucket?'storage connection':'gateway'} and files.</label>
      <button type="button" disabled={busy||expired||!accountConfirmed||!targetConfirmed||blocked.length>0} onClick={()=>void save()} className="rounded bg-indigo-700 px-3 py-2 text-white">Import private draft</button></>}
    {error&&<p role="alert">{error}</p>}
    <button type="button" disabled={busy} onClick={()=>{setPending(null);clearHandoff();}} className="rounded border px-3 py-2">Discard import</button>
  </section>;
}
