// @vitest-environment jsdom
import {act,cleanup,render,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {AxiosError,type AxiosAdapter} from 'axios';
import {api} from '@/api/client';
import {nativeClient,nativeSession} from '@/api/connector-seller-settings';
import {EMPTY_LISTING_DRAFT,type SavedListingDraft} from '@/api/sellerListingDraft';
import type {SellerWorkspaceConnection,WorkspaceObject} from '@/api/sellerWorkspace';
import {useAuthStore} from '@/store/auth';
import {SellerListingDraftProvider,useSellerListingDraft,resetSellerListingDraftOwnerForTests} from './SellerListingDraftStore';
import SavedWorkspaceData from './SavedWorkspaceData';
const view=vi.hoisted(()=>({save:null as null|((connection:SellerWorkspaceConnection,objects:WorkspaceObject[])=>Promise<unknown>)}));
vi.mock('./WorkspaceData',()=>({WorkspaceData:(props:{onSaveSelection:typeof view.save})=>{view.save=props.onSaveSelection;return null;}}));
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002';
const draftA={draft_id:a,authority_version_id:'authority-a',version:1,content:{...EMPTY_LISTING_DRAFT,title:'Imported A'},updated_at:''};
const draftB={draft_id:b,version:1,content:{...EMPTY_LISTING_DRAFT,title:'New B'},updated_at:''};
let store:ReturnType<typeof useSellerListingDraft>;
function Capture(){store=useSellerListingDraft();return null;}
const oldApiAdapter=api.defaults.adapter,oldNativeAdapter=nativeClient.defaults.adapter;
afterEach(()=>{cleanup();api.defaults.adapter=oldApiAdapter;nativeClient.defaults.adapter=oldNativeAdapter;vi.restoreAllMocks();});
beforeEach(()=>{useAuthStore.setState({token:'token',user:{id:a} as never});resetSellerListingDraftOwnerForTests();});
it.each(['content','source'] as const)('binds stale imported %s writes at the serialized HTTP boundary; B survives and the editor reloads B',async kind=>{
 // Stateful model of backend 63a274a6: omitted IDs resolve to current, while
 // explicit IDs resolve before the superseded guard and version check.
 const rows=new Map<string,SavedListingDraft>([[a,structuredClone(draftA)],[b,structuredClone(draftB)]]);
 let current=a;const superseded=new Set<string>();const writes:Array<Record<string,unknown>>=[];
 const adapter:AxiosAdapter=async config=>{
   let data:unknown;
   if(config.method==='get')data=config.url?.endsWith('listing-source')?{source:null,current_draft_id:current}:{draft:rows.get(current)};
   else{
     const body=JSON.parse(config.data);writes.push(body);
     if(body.draft_id){expect(body.csrf).toBe(nativeSession().csrf);expect(config.headers.get('X-CSRF-Token')).toBe(nativeSession().csrf);}
     const target=body.draft_id??current;
     if(superseded.has(target))throw new AxiosError('superseded','ERR_BAD_REQUEST',config,undefined,{status:409,statusText:'Conflict',headers:{},config,data:{detail:{code:'DRAFT_SUPERSEDED'}}});
     const row=rows.get(target)!;
     if(body.expected_version!==row.version)throw new Error('version conflict');
     row.content=body.content;row.version+=1;data={draft:row,current_draft_id:current,source:{version:row.version,content:body.content,connection_current:true}};
   }
   return {data,status:200,statusText:'OK',headers:{},config};
 };
 api.defaults.adapter=adapter;nativeClient.defaults.adapter=adapter;
 render(<SellerListingDraftProvider enabled sampleCapability={false}><Capture/>{kind==='source'&&<SavedWorkspaceData enabled connections={[]}/>}</SellerListingDraftProvider>);
 await waitFor(()=>expect(store.loaded).toBe(true));
 const oldSave=store.saveListingFields;
 // Another tab starts B. Both drafts have version 1.
 superseded.add(a);current=b;
 await act(async()=>{
   const saving=kind==='content'?oldSave({...draftA.content,title:'Stale A edit'},1):view.save!({id:a,version:1} as SellerWorkspaceConnection,[{key:'data.csv',version_id:null,etag:'etag',size:42} as WorkspaceObject]);
   await expect(saving).rejects.toMatchObject({response:{status:409,data:{detail:{code:'DRAFT_SUPERSEDED'}}}});
 });
 expect(writes).toHaveLength(1);expect(writes[0]).toMatchObject({draft_id:a,expected_version:kind==='content'?1:0,request_id:expect.any(String)});
 if(kind==='source')expect(writes[0]).toMatchObject({expected_current_draft_id:a,draft_id:a});
 expect(rows.get(b)).toEqual(draftB);expect(store.draft).toEqual(draftB);
 await expect(oldSave(draftA.content,1)).rejects.toThrow('changed');
});
