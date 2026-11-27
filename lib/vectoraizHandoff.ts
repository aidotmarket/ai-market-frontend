'use client';

import {DRAFT_SUPERSEDED_MESSAGE} from './listing-action-error';

import {useEffect} from 'react';
import {useAuthStore} from '@/store/auth';
import {customerRefusal} from '@/lib/customerMessages';
import type {SourceContent} from '@/api/sellerListingSource';
import type {AuthorityImportReceipt,SellerWorkspaceConnection, WorkspaceObject} from '@/api/sellerWorkspace';
import type {GatewayFile} from '@/types/sellerGateway';

export const MAX_ENCODED = 48 * 1024;
export const MAX_EXPANDED = 64 * 1024;
export const HANDOFF_TTL = 30 * 60 * 1000;
export const VECTOR_ATTESTATION = 'The seller attests: chunks, embeddings and metadata; no source files are delivered.';
export const DRAFT_IN_PROGRESS = 'You already have a listing in progress. Open Seller Workspace and finish it before importing again.';
const STASH = 'aim.vectoraiz.handoff.v1';
const RECEIPT = 'aim.vectoraiz.receipt.v1';
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;
export class HandoffError extends Error { constructor(){super('Export the listing again from vectorAIz, then open the new link.');} }
const fail = (): never => {throw new HandoffError();};
type DraftText = {title:string; brief:string; description:string; category:string; tags:string};
type Base = {version:1; pack_id:string; draft:DraftText};
export type BucketHandoff = Base & {provider:'aws'|'r2'; bucket:string; region?:string|null; account_id?:string|null; connection_folder:'vz'; pack_prefix:string; file_count:number; selection_sha256:string};
export type GatewayHandoff = Base & {files:{size:number;sha256:string}[]};
export type Handoff = BucketHandoff | GatewayHandoff;
export const isBucket = (handoff:Handoff):handoff is BucketHandoff => 'provider' in handoff;
const record = (v:unknown):Record<string,unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string,unknown> : fail();
const exact = (v:Record<string,unknown>, required:string[], optional:string[]=[]) => {
  if(required.some(k=>!Object.hasOwn(v,k)) || Object.keys(v).some(k=>!required.includes(k)&&!optional.includes(k)))fail();
};
const text = (v:unknown,max:number,min=0):v is string => typeof v==='string' && [...v].length>=min && [...v].length<=max;
const integer = (v:unknown):v is number => Number.isSafeInteger(v) && Number(v)>=0;
export function validateHandoff(value:unknown):Handoff {
  const v=record(value), d=record(v.draft);
  exact(d,['title','brief','description','category','tags']);
  for(const [key,limit] of Object.entries({title:255,brief:4000,description:10000,category:200,tags:1000}))if(!text(d[key],limit))fail();
  if(v.version!==1 || typeof v.pack_id!=='string' || !UUID.test(v.pack_id))fail();
  const base=['version','pack_id','draft'];
  if('provider' in v){
    exact(v,[...base,'provider','bucket','connection_folder','pack_prefix','file_count','selection_sha256'],['region','account_id']);
    if((v.provider!=='aws'&&v.provider!=='r2') || !text(v.bucket,255,1) || v.connection_folder!=='vz' || v.pack_prefix!=='vz/'+v.pack_id+'/' ||
       !integer(v.file_count) || v.file_count<1 || (typeof v.selection_sha256!=="string"||!SHA.test(v.selection_sha256)))fail();
    if(v.provider==='aws' ? !text(v.region,80,1)||v.account_id!=null : !text(v.account_id,128,1)||v.region!=null)fail();
  }else{
    exact(v,[...base,'files']);
    if(!Array.isArray(v.files)||v.files.length<1||v.files.length>64)fail();
    const files=v.files as unknown[];
    for(const item of files){const f=record(item);exact(f,['size','sha256']);if(!integer(f.size)||(typeof f.sha256!=="string"||!SHA.test(f.sha256)))fail();}
    if(new Set(files.map(item=>{const f=record(item);return `${f.size}:${f.sha256}`;})).size!==files.length)fail();
  }
  return v as Handoff;
}

// JSON.parse checks grammar; the lexical pass rejects duplicate keys (including
// escaped spellings) and excessive nesting before the object is materialized.
export function strictJSON(raw:string):unknown {
  const stack:Array<Set<string>|null>=[];
  const tokens=raw.match(/"(?:[^"\\]|\\.)*"|[{}\[\]:,]|[^\s{}\[\]:,]+/g)??[];
  for(let i=0;i<tokens.length;i++){
    const t=tokens[i];
    if(t==='{'||t==='['){stack.push(t==='{'?new Set():null);if(stack.length>24)fail();}
    else if(t==='}'||t===']')stack.pop();
    else if(t.startsWith('"') && tokens[i+1]===':'){
      const keys=stack.at(-1);const key=JSON.parse(t);if(!keys||keys.has(key))return fail();keys.add(key);
    }
  }
  return JSON.parse(raw);
}
async function inflate(bytes:Uint8Array):Promise<Uint8Array> {
  const reader=new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const chunks:Uint8Array[]=[];let length=0;
  try{while(true){const next=await reader.read();if(next.done)break;length+=next.value.length;if(length>MAX_EXPANDED){await reader.cancel();fail();}chunks.push(next.value);}}
  finally{reader.releaseLock();}
  const out=new Uint8Array(length);let offset=0;for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.length;}return out;
}
export async function decodeHandoff(encoded:string):Promise<Handoff>{
  try{
    if(encoded.length>MAX_ENCODED||! /^[A-Za-z0-9_-]+$/.test(encoded))fail();
    const binary=atob(encoded.replace(/-/g,'+').replace(/_/g,'/'));
    const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
    const raw=await inflate(bytes);
    return validateHandoff(strictJSON(new TextDecoder('utf-8',{fatal:true}).decode(raw)));
  }catch{throw new HandoffError();}
}
export type PendingHandoff={handoff:Handoff;encoded:string;expires:number;account:string|null;route:string;key:string};
let capturing:Promise<void>=Promise.resolve();
let captureGeneration=0;
export const HANDOFF_CAPTURED='vectoraiz-handoff-captured';
declare global { interface Window { __vectoraizEntry?: {fragment:string;route:string}; } }
export function clearHandoff(){++captureGeneration;try{sessionStorage.removeItem(STASH);}catch{/* Storage may be unavailable. */}}
export function captureHandoff():Promise<void>{
  if(typeof window==='undefined')return capturing;
  const entry=window.__vectoraizEntry;delete window.__vectoraizEntry;
  const fragment=entry?.fragment??window.location.hash;
  if(!/(?:^#|&)vz(?:=|&|$)/.test(fragment))return capturing;
  // Clear before parsing, storage, asynchronous decoding or any auth redirect.
  window.history.replaceState(window.history.state,'',window.location.pathname+window.location.search);
  clearHandoff();const generation=captureGeneration;
  const account=useAuthStore.getState().user?.id??null;
  const route=entry?.route??window.location.pathname;
  capturing=(async()=>{try{
    if(!['/dashboard/seller-workspace','/dashboard/gateways'].includes(route))return;
    if(fragment.length>MAX_ENCODED+4||!fragment.startsWith('#vz='))return;
    const encoded=fragment.slice(4), handoff=await decodeHandoff(encoded);
    if((isBucket(handoff)?'/dashboard/seller-workspace':'/dashboard/gateways')!==route||generation!==captureGeneration)return;
    sessionStorage.setItem(STASH,JSON.stringify({encoded,expires:Date.now()+HANDOFF_TTL,account,route,key:crypto.randomUUID()}));
  }catch{/* Never retain or report an invalid payload. */}})();
  window.dispatchEvent(new Event(HANDOFF_CAPTURED));
  return capturing;
}
export async function consumeHandoff(account:string,route:string,isCurrent:()=>boolean=()=>true):Promise<PendingHandoff|null>{
  await capturing;
  if(!isCurrent())return null;
  try{
    const raw=sessionStorage.getItem(STASH);sessionStorage.removeItem(STASH);if(!raw||raw.length>MAX_EXPANDED*2)return null;
    const item=JSON.parse(raw) as PendingHandoff;
    if(!integer(item.expires)||item.expires<=Date.now()||item.expires>Date.now()+HANDOFF_TTL||item.route!==route||item.account!==null&&item.account!==account||!UUID.test(item.key))return null;
    const handoff=await decodeHandoff(item.encoded);
    return {...item,handoff,account};
  }catch{return null;}
}
// Only opaque server receipt IDs survive a reload. The consumed payload and
// browser identity terms never do. A bucket locator must match current draft.
export function saveAuthorityReceipt(account:string,receipt:AuthorityImportReceipt){
  try{sessionStorage.setItem(RECEIPT,JSON.stringify({account,receipt}));}catch{/* Review remains available in memory. */}
}
export function readAuthorityReceipt(account:string):AuthorityImportReceipt|null{
  try{
    const value=JSON.parse(sessionStorage.getItem(RECEIPT)??'null');
    if(value?.account!==account)return null;
    const receipt=value.receipt as AuthorityImportReceipt;
    return [receipt.import_id,receipt.draft_id,receipt.authority_version_id].every(id=>UUID.test(id))&&
      (receipt.listing_id===null||UUID.test(receipt.listing_id))?receipt:null;
  }catch{return null;}
}
export function useHandoffBoundary(){
  // This security boundary intentionally sanitizes the external URL during
  // render, before the layout can render an error or schedule a redirect.
  // Capture is idempotent after replaceState; decoding never updates React.
  if(typeof window!=='undefined')void captureHandoff();
  useEffect(()=>{
    void captureHandoff();
    const change=()=>{void captureHandoff();};window.addEventListener('hashchange',change);
    // An unauthenticated stash survives first login. Later identity changes
    // clear the stash and fence in-flight decoding.
    let owner=useAuthStore.getState().user?.id??null;
    const unsubscribe=useAuthStore.subscribe(state=>{const next=state.user?.id??null;if(owner!==null&&owner!==next){clearHandoff();try{sessionStorage.removeItem(RECEIPT);}catch{/* No retained receipt. */}}owner=next;});
    return()=>{unsubscribe();window.removeEventListener('hashchange',change);};
  },[]);
}

export const VECTOR_NAMES=['manifest.json','chunks.parquet','documents.parquet','README.md','examples/query.py','examples/query.json'];
export function requireVectorNames(names:string[]){if(names.length!==6||new Set(names).size!==6||names.some(n=>!VECTOR_NAMES.includes(n)))fail();}
export function matchingConnections(h:BucketHandoff,connections:SellerWorkspaceConnection[]){
  return connections.filter(c=>c.status==='verified'&&c.provider===h.provider&&c.bucket===h.bucket && (c.provider==='aws'?c.region===h.region:c.provider_account_id===h.account_id)&&
    (c.scope==='whole_bucket'||!c.prefix||h.pack_prefix.startsWith((c.prefix??'').replace(/\/$/,'')+'/')));
}
export async function bucketTarget(h:BucketHandoff,c:SellerWorkspaceConnection,objects:WorkspaceObject[]):Promise<SourceContent>{
  requireVectorNames(objects.map(o=>o.key.startsWith(h.pack_prefix)?o.key.slice(h.pack_prefix.length):''));
  const tuples=objects.map(o=>[o.key,'"'+o.etag.replace(/^"|"$/g,'')+'"',o.size] as [string,string,number]).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(tuples)));
  if(objects.length!==h.file_count||Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('')!==h.selection_sha256)fail();
  return {connection_id:c.id,connection_version:c.version,version_mode:'current',objects:objects.map(({key,version_id,etag,size})=>({key,version_id,etag,size}))};
}
export function matchGateway(h:GatewayHandoff,files:GatewayFile[]):GatewayFile[]{
  const selected=h.files.map(pair=>{
    const matches=files.filter(f=>f.present&&f.description.state==='described'&&f.description.described_at!==null&&Date.parse(f.changed_at)<=Date.parse(f.description.described_at)&&f.size_bytes===pair.size&&f.description.sha256===pair.sha256);
    return matches.length===1?matches[0]:fail();
  });
  requireVectorNames(selected.map(f=>f.display_name==='query.py'?'examples/query.py':f.display_name==='query.json'?'examples/query.json':f.display_name));return selected;
}
export function identityMatches(terms:string[],values:string[]):string[]{
  const normalize=(s:string)=>s.normalize('NFKC').toLocaleLowerCase('en-US');
  return values.filter(v=>terms.some(t=>t.trim()&&normalize(v).includes(normalize(t.trim()))));
}
export function authorityCode(error:unknown):string|undefined{
  const root=error as {message?:string;response?:{data?:{detail?:string|{code?:string}}}};
  const detail=root?.response?.data?.detail;
  return typeof detail==='string'?detail:detail?.code??root?.message;
}
export function authorityMessage(error:unknown):string{
  const again='Export the listing again from vectorAIz, then open the new link.';
  const refresh='The files or names changed. Refresh the review and check them again.';
  const unavailable='Listing imports are not available on this account yet. Contact support.';
  const signin='Your sign-in changed. Sign in again, then retry.';
  const table:Record<string,string>={AUTHORITY_DRAFT_IN_PROGRESS:DRAFT_IN_PROGRESS,DRAFT_SUPERSEDED:DRAFT_SUPERSEDED_MESSAGE};
  for(const code of ['ACCOUNT_CHANGED','ENTRY_REQUIRED'])table['AUTHORITY_'+code]=signin;
  for(const code of ['CSRF_REQUIRED','SESSION_CHANGED','FIRST_PARTY_SESSION_REQUIRED'])table[code]=signin;
  for(const code of ['SOURCE_MISMATCH','SOURCE_AMBIGUOUS','VECTOR_SELECTION_REQUIRED','HANDOFF_MALFORMED','HANDOFF_PACK_ID_UNSUPPORTED'])table['AUTHORITY_'+code]=again;
  for(const code of ['PURCHASER_STALE','SOURCE_STALE','BINDING_STALE','NATIVE_REVIEW_REQUIRED','REVIEW_REQUIRED','CONFIRMATION_MALFORMED'])table['AUTHORITY_'+code]=refresh;
  for(const code of ['IMPORT_DISABLED','VERSION_NOT_FOUND'])table['AUTHORITY_'+code]=unavailable;
  for(const code of ['IMPORT_KEY_CONFLICT','CONFIRMATION_KEY_CONFLICT'])table['AUTHORITY_'+code]='Start the import again from vectorAIz.';
  table.AUTHORITY_LISTING_DISABLED='Your company has turned listing off. Ask your company administrator to enable listing, then retry.';
  table.SELLER_DISABLED='Selling from vectorAIz is not available yet. Contact support.';
  const detail=(error as {response?:{data?:{detail?:{field?:unknown;message?:unknown;code?:unknown}}}})?.response?.data?.detail;
  if(detail&&typeof detail==='object'&&!detail.code&&typeof detail.field==='string'&&typeof detail.message==='string')return detail.message+((error as {response?:{status?:number}}).response?.status===422&&/contact details/i.test(detail.message)?' Edit it in vectorAIz and export again.':'');
  table.AUTHORITY_REQUEST_TOO_LARGE='Export again from vectorAIz with a smaller draft.';
  return customerRefusal(error,table,error instanceof HandoffError?again:'We could not complete the import or review. Try again, or contact support.');
}
