// @vitest-environment jsdom
import {StrictMode} from 'react';
import {Blob as NodeBlob} from 'node:buffer';
import {DecompressionStream as NodeDecompressionStream} from 'node:stream/web';
import {deflateRawSync} from 'node:zlib';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {useAuthStore} from '@/store/auth';
import VectoraizImport from './VectoraizImport';
import {HANDOFF_CAPTURED,VECTOR_NAMES,type PendingHandoff} from '@/lib/vectoraizHandoff';
const draftState=vi.hoisted(()=>({value:null as unknown}));
vi.mock('./SellerListingDraftStore',()=>({useOptionalSellerListingDraft:()=>draftState.value}));
const api=vi.hoisted(()=>({draft:vi.fn(),caps:vi.fn(),consume:vi.fn(),clear:vi.fn(),gateways:vi.fn(),files:vi.fn(),import:vi.fn(),connections:vi.fn(),bucket:vi.fn()}));
vi.mock('@/api/sellerListingDraft',()=>({readListingDraft:api.draft}));
vi.mock('@/api/sellerWorkspace',async original=>({...await original<typeof import('@/api/sellerWorkspace')>(),getAuthorityCapabilities:api.caps,importAuthorityDraft:api.import,listSellerWorkspaceConnections:api.connections}));
vi.mock('@/api/sellerGateways',async original=>({...await original<typeof import('@/api/sellerGateways')>(),listSellerGateways:api.gateways,readAuthorityGatewayFiles:api.files}));
vi.mock('@/lib/vectoraizHandoff',async original=>({...await original<typeof import('@/lib/vectoraizHandoff')>(),consumeHandoff:api.consume,clearHandoff:api.clear,bucketTarget:api.bucket}));
vi.mock('./folderSelection',()=>({resolveFolder:vi.fn().mockResolvedValue([])}));
vi.mock('@/components/gateways/PurchaserReview',()=>({default:({versionId}:{versionId:string})=><p>Review {versionId}</p>}));
const id='00000000-0000-4000-8000-000000000001';
const handoff={version:1 as const,pack_id:id,draft:{title:'Vector pack',description:'Private draft description',brief:'Private brief',category:'Technology',tags:'vectors'},files:VECTOR_NAMES.map((_,i)=>({size:10+i,sha256:String(i).repeat(64)}))};
const pending:PendingHandoff={handoff,encoded:'native-compressed',expires:Date.now()+1000000,account:id,route:'/dashboard/gateways',key:id};
beforeEach(()=>{
 draftState.value=null;sessionStorage.clear();
 for(const f of Object.values(api))f.mockReset();
 api.draft.mockResolvedValue({draft_id:id,authority_version_id:'authority',version:1,content:handoff.draft,updated_at:'2026-11-19T00:00:00Z'});
 useAuthStore.setState({user:{id,email:'seller@example.test'} as never,token:'token'});
 api.caps.mockResolvedValue({import_enabled:true,contract_version:'listing-authority-v1',handoff_versions:[1]});api.consume.mockResolvedValue(pending);
 api.gateways.mockResolvedValue([{gateway_id:'gateway',name:'My gateway',door_url:'https://neutral.example',gateway_metadata_revision:99}]);
 api.files.mockResolvedValue({revision:7,files:handoff.files.map((f,i)=>({file_id:String(i),display_name:VECTOR_NAMES[i].replace('examples/',''),size_bytes:f.size,present:true,changed_at:'2026-01-01',description:{state:'described',described_at:'2026-01-02',sha256:f.sha256}}))});
 api.import.mockResolvedValue({import_id:id,draft_id:id,listing_id:'listing',authority_version_id:'authority'});
});
afterEach(()=>{vi.useRealTimers();cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
async function ready(){
 render(<VectoraizImport mode="gateway"/>);await screen.findByRole('option',{name:'My gateway'});
 fireEvent.click(screen.getByRole('button',{name:'Check uploaded files'}));
 await screen.findByLabelText(/Import for my signed-in account/);
 fireEvent.click(screen.getByLabelText(/Import for my signed-in account/));fireEvent.click(screen.getByLabelText(/I reviewed this draft/));
}
it('T1 uses the selection-page revision, atomic import endpoint and original receipt',async()=>{
 await ready();fireEvent.click(screen.getByRole('button',{name:'Import private draft'}));
 await screen.findByText('Review authority');
 expect(api.import).toHaveBeenCalledExactlyOnceWith({contract_version:'listing-authority-v1',handoff:'native-compressed',idempotency_key:id,account_id:id,account_confirmed:true,target_confirmed:true,target:{type:'gateway',gateway_id:'gateway',file_ids:['0','1','2','3','4','5'],expected_metadata_revision:7}});
 expect(screen.getByRole('link',{name:'Continue editing the listing'}).getAttribute('href')).toBe('/dashboard/listings/listing/edit');
});
it('T1 reuses the exact import key/body after an uncertain network result',async()=>{
 api.import.mockRejectedValueOnce(new Error('network'));await ready();
 fireEvent.click(screen.getByRole('button',{name:'Import private draft'}));await screen.findByRole('alert');
 fireEvent.click(screen.getByRole('button',{name:'Import private draft'}));await screen.findByText('Review authority');
 expect(api.import.mock.calls[1][0]).toEqual(api.import.mock.calls[0][0]);expect(api.files).toHaveBeenCalledOnce();
});
it('T1 maps unfinished work to the requested existing copy and does not continue',async()=>{
 api.import.mockRejectedValueOnce({response:{status:409,data:{detail:{code:'AUTHORITY_DRAFT_IN_PROGRESS'}}}});await ready();
 fireEvent.click(screen.getByRole('button',{name:'Import private draft'}));
 expect((await screen.findByRole('alert')).textContent).toBe('You already have a listing in progress. Open Seller Workspace and finish it before importing again.');
 expect(screen.queryByText('Review authority')).toBeNull();
});
it('keeps local identity terms out of the transmitted handoff and request',async()=>{
 await ready();fireEvent.change(screen.getByLabelText('Names to keep private (one per line)'),{target:{value:'private-term'}});
 fireEvent.click(screen.getByLabelText(/I reviewed this draft/));fireEvent.click(screen.getByRole('button',{name:'Import private draft'}));await screen.findByText('Review authority');
 expect(JSON.stringify(api.import.mock.calls)).not.toContain('private-term');
});
it('does not offer the importer when disabled and clears pending intake',async()=>{
 api.caps.mockResolvedValue({import_enabled:false,contract_version:'listing-authority-v1',handoff_versions:[1]});
 const {container}=render(<VectoraizImport mode="gateway"/>);
 await waitFor(()=>expect(api.clear).toHaveBeenCalledOnce());expect(container.textContent).toBe('');expect(api.consume).not.toHaveBeenCalled();expect(api.gateways).not.toHaveBeenCalled();
});
it('shows nothing new when gateway metadata revision is absent',async()=>{
 api.gateways.mockResolvedValue([{gateway_id:'gateway',name:'Old gateway'}]);render(<VectoraizImport mode="gateway"/>);
 await waitFor(()=>expect(api.gateways).toHaveBeenCalled());expect(screen.queryByRole('option',{name:'Old gateway'})).toBeNull();
});
it('discards an in-flight receipt on account change',async()=>{
 let resolve!:(v:unknown)=>void;api.import.mockImplementation(()=>new Promise(done=>{resolve=done;}));await ready();
 fireEvent.click(screen.getByRole('button',{name:'Import private draft'}));await waitFor(()=>expect(api.import).toHaveBeenCalledOnce());
 await act(async()=>{useAuthStore.setState({user:{id:'other'} as never});resolve({import_id:id,draft_id:id,listing_id:'listing',authority_version_id:'old'});});
 expect(screen.queryByText('Review old')).toBeNull();
});

it('re-reads files and requires another target review after a stale import refusal',async()=>{
 api.import.mockRejectedValueOnce({response:{status:409,data:{detail:{code:'AUTHORITY_PURCHASER_STALE'}}}});
 await ready();fireEvent.click(screen.getByRole('button',{name:'Import private draft'}));
 await waitFor(()=>expect(api.files).toHaveBeenCalledTimes(2));
 await screen.findByRole('alert');
 expect((screen.getByLabelText(/I reviewed this draft/) as HTMLInputElement).checked).toBe(false);
 expect((screen.getByRole('button',{name:'Import private draft'}) as HTMLButtonElement).disabled).toBe(true);
});

it('MEDIUM 5 second same-tab handoff retires pack A selections and requires fresh confirmation for pack B',async()=>{
 await ready();
 api.import.mockRejectedValueOnce(new Error('uncertain A'));
 fireEvent.click(screen.getByRole('button',{name:'Import private draft'}));await screen.findByRole('alert');
 api.consume.mockResolvedValue({...pending,key:'pack-b-key',encoded:'pack-b',handoff:{...handoff,draft:{...handoff.draft,title:'Pack B'}}});
 act(()=>{window.dispatchEvent(new Event(HANDOFF_CAPTURED));});
 await screen.findByText('Pack B');
 expect(screen.queryByRole('button',{name:'Import private draft'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Check uploaded files'}));
 await screen.findByLabelText(/Import for my signed-in account/);
 expect((screen.getByLabelText(/Import for my signed-in account/) as HTMLInputElement).checked).toBe(false);
 expect((screen.getByLabelText(/I reviewed this draft/) as HTMLInputElement).checked).toBe(false);
 fireEvent.click(screen.getByLabelText(/Import for my signed-in account/));fireEvent.click(screen.getByLabelText(/I reviewed this draft/));
 fireEvent.click(screen.getByRole('button',{name:'Import private draft'}));
 await screen.findByText('Review authority');expect(api.import.mock.calls[1][0].handoff).toBe('pack-b');
 expect(api.import.mock.calls[1][0].idempotency_key).toBe('pack-b-key');
});
it('MEDIUM 7 / CC F4 enabled zero gateways gives setup and re-export guidance',async()=>{
 api.gateways.mockResolvedValue([]);render(<VectoraizImport mode="gateway"/>);
 await screen.findByText(/No compatible gateway/);expect(screen.getByText(/Use “Add a gateway” below/)).toBeTruthy();expect(screen.queryByRole('link',{name:'Set up a gateway'})).toBeNull();
});
it('MEDIUM 7 enabled gateway-list error gives a visible retry next step',async()=>{
 api.gateways.mockRejectedValue(new Error('network'));render(<VectoraizImport mode="gateway"/>);
 expect((await screen.findByRole('alert')).textContent).toContain('Open the link from vectorAIz again to retry');
});
it('MEDIUM 7 / CC F3 expiry on an open confirmation screen gives re-export guidance',async()=>{
 api.consume.mockResolvedValue({...pending,expires:Date.now()+500});
 await ready();
 await screen.findByRole('alert');
 expect(screen.getByRole('alert').textContent).toContain('expired');
 expect(screen.queryByRole('button',{name:'Import private draft'})).toBeNull();
 expect((screen.getByRole('button',{name:'Check uploaded files'}) as HTMLButtonElement).disabled).toBe(true);
 vi.useRealTimers();expect(api.import).not.toHaveBeenCalled();
});

it('MEDIUM 6 exact replay of an older receipt cannot review a later current bucket draft',async()=>{
 draftState.value={loaded:true,draft:{draft_id:'later',content:{}},importDraft:api.import};
 api.import.mockResolvedValue({import_id:id,draft_id:'older',listing_id:null,authority_version_id:'old-version'});
 api.consume.mockResolvedValue({...pending,route:'/dashboard/seller-workspace',handoff:{version:1,pack_id:id,draft:handoff.draft,provider:'aws',region:'eu-west-1',bucket:'neutral',connection_folder:'vz',pack_prefix:'vz/'+id+'/',file_count:6,selection_sha256:'a'.repeat(64)}});
 api.connections.mockResolvedValue([{id:'connection',bucket:'neutral',provider:'aws',region:'eu-west-1',status:'verified',scope:'whole_bucket'}]);
 api.bucket.mockResolvedValue({connection_id:'connection',objects:[]});
 render(<VectoraizImport mode="bucket"/>);
 await screen.findByRole('option',{name:/neutral/});
 fireEvent.click(screen.getByRole('button',{name:'Check uploaded files'}));
 await screen.findByLabelText(/Import for my signed-in account/);
 fireEvent.click(screen.getByLabelText(/Import for my signed-in account/));fireEvent.click(screen.getByLabelText(/I reviewed this draft/));
 fireEvent.click(screen.getByRole('button',{name:'Import private draft'}));
 await waitFor(()=>expect(api.import).toHaveBeenCalledOnce());await act(async()=>{});
 expect(screen.queryByText('Review old-version')).toBeNull();
});
it('MEDIUM 6 bucket review disappears on a mounted current draft switch and HIGH 1 optional owner reference restores it',async()=>{
 const receipt={import_id:id,draft_id:id,listing_id:null,authority_version_id:id};
 const {saveAuthorityReceipt}=await import('@/lib/vectoraizHandoff');
 saveAuthorityReceipt(id,receipt);api.consume.mockResolvedValue(null);
 draftState.value={loaded:true,draft:{draft_id:id}};
 const view=render(<VectoraizImport mode="bucket"/>);await screen.findByText('Review '+id);
 draftState.value={loaded:true,draft:{draft_id:'later'}};view.rerender(<VectoraizImport mode="bucket"/>);
 expect(screen.queryByText('Review '+id)).toBeNull();
 draftState.value={loaded:true,draft:{draft_id:'later',authority_version_id:'durable'}};view.rerender(<VectoraizImport mode="bucket"/>);
 expect(screen.getByText('Review durable')).toBeTruthy();
});

it('MEDIUM 7 stays dark when disabled even with a future durable draft authority reference',async()=>{
 draftState.value={loaded:true,draft:{draft_id:id,authority_version_id:'durable'}};
 api.caps.mockResolvedValue({import_enabled:false,contract_version:'listing-authority-v1',handoff_versions:[1]});
 const {container}=render(<VectoraizImport mode="bucket"/>);
 await waitFor(()=>expect(api.clear).toHaveBeenCalledOnce());expect(container.textContent).toBe('');
});

it.each([true,false])('MEDIUM 5 deferred A capability (enabled=%s) cannot consume or clear the real replacement B stash',async enabled=>{
 vi.stubGlobal('Blob',NodeBlob);vi.stubGlobal('DecompressionStream',NodeDecompressionStream);
 const real=await vi.importActual<typeof import('@/lib/vectoraizHandoff')>('@/lib/vectoraizHandoff');
 api.consume.mockImplementation(real.consumeHandoff);api.clear.mockImplementation(real.clearHandoff);
 const caps={import_enabled:true,contract_version:'listing-authority-v1',handoff_versions:[1]};
 let resolveA!:(v:unknown)=>void,resolveB!:(v:unknown)=>void;
 api.caps.mockImplementationOnce(()=>new Promise(done=>{resolveA=done;})).mockImplementationOnce(()=>new Promise(done=>{resolveB=done;}));
 async function capture(title:string){
   window.history.replaceState(null,'','/dashboard/gateways#vz='+deflateRawSync(JSON.stringify({...handoff,draft:{...handoff.draft,title}})).toString('base64url'));
   await act(async()=>{await real.captureHandoff();});
 }
 await capture('Pack A');render(<StrictMode><VectoraizImport mode="gateway"/></StrictMode>);
 await waitFor(()=>expect(api.caps).toHaveBeenCalledTimes(1));
 await capture('Pack B');await waitFor(()=>expect(api.caps).toHaveBeenCalledTimes(2));
 await act(async()=>{resolveA({...caps,import_enabled:enabled});});
 expect(api.consume).not.toHaveBeenCalled();expect(api.clear).not.toHaveBeenCalled();
 expect(sessionStorage.getItem('aim.vectoraiz.handoff.v1')).not.toBeNull();
 await act(async()=>{resolveB(caps);});
 await screen.findByText('Pack B');await screen.findByRole('option',{name:'My gateway'});
 fireEvent.click(screen.getByRole('button',{name:'Check uploaded files'}));
 await screen.findByLabelText(/Import for my signed-in account/);
 expect((screen.getByLabelText(/Import for my signed-in account/) as HTMLInputElement).checked).toBe(false);
 expect((screen.getByLabelText(/I reviewed this draft/) as HTMLInputElement).checked).toBe(false);
 expect((screen.getByRole('button',{name:'Import private draft'}) as HTMLButtonElement).disabled).toBe(true);
});
it.each([true,false])('expiry during POST preserves completion (success=%s) and blocks retries after failure',async success=>{
 let resolve!:(v:unknown)=>void,reject!:(v:unknown)=>void;
 api.import.mockImplementation(()=>new Promise((done,fail)=>{resolve=done;reject=fail;}));
 vi.useFakeTimers({toFake:['setTimeout','clearTimeout','Date']});
 const expires=Date.now()+60000;api.consume.mockResolvedValue({...pending,expires});
 // Flush mount and file reads explicitly: RTL polling also uses the fake clock.
 render(<VectoraizImport mode="gateway"/>);await act(async()=>{});
 fireEvent.click(screen.getByRole('button',{name:'Check uploaded files'}));await act(async()=>{});
 fireEvent.click(screen.getByLabelText(/Import for my signed-in account/));fireEvent.click(screen.getByLabelText(/I reviewed this draft/));
 fireEvent.click(screen.getByRole('button',{name:'Import private draft'}));
 await act(async()=>{vi.advanceTimersByTime(61000);});
 expect(screen.queryByRole('alert')).toBeNull();
 await act(async()=>{if(success)resolve({import_id:id,draft_id:id,listing_id:'listing',authority_version_id:'authority'});else reject(new Error('network'));});
 vi.useRealTimers();
 if(success){expect(screen.getByText('Review authority')).toBeTruthy();expect(screen.queryByRole('alert')).toBeNull();}
 else{await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('expired'));expect(screen.queryByRole('button',{name:'Import private draft'})).toBeNull();}
 expect(api.import).toHaveBeenCalledOnce();
});

it('gateway detail setup guidance links to the gateway list, where Add a gateway is available',async()=>{
 api.gateways.mockResolvedValue([]);render(<VectoraizImport mode="gateway" gatewayId="missing"/>);
 expect((await screen.findByRole('link',{name:'Open the gateway list'})).getAttribute('href')).toBe('/dashboard/gateways');
});
it('unmounted capability continuation cannot clear or consume a later entry',async()=>{
 let resolve!:(v:unknown)=>void;
 api.caps.mockImplementation(()=>new Promise(done=>{resolve=done;}));
 const view=render(<VectoraizImport mode="gateway"/>);
 await waitFor(()=>expect(api.caps).toHaveBeenCalledOnce());view.unmount();
 await act(async()=>{resolve({import_enabled:false});});
 expect(api.clear).not.toHaveBeenCalled();expect(api.consume).not.toHaveBeenCalled();
});

it.each(['bucket','gateway'] as const)('prefers durable current draft over a receipt for %s after refresh',async mode=>{
 api.consume.mockResolvedValue(null);
 const draft={draft_id:id,authority_version_id:'durable',version:1,content:{...handoff.draft},updated_at:'2026-11-19T00:00:00Z'};
 if(mode==='bucket')draftState.value={loaded:true,draft};else api.draft.mockResolvedValue(draft);
 const view=render(<VectoraizImport mode={mode}/>);await screen.findByText('Review durable');
 view.unmount();sessionStorage.clear();render(<VectoraizImport mode={mode}/>);await screen.findByText('Review durable');
});
it.each(['bucket','gateway'] as const)('explicit null version suppresses receipt recovery for %s',async mode=>{
 const {saveAuthorityReceipt}=await import('@/lib/vectoraizHandoff');
 saveAuthorityReceipt(id,{import_id:id,draft_id:id,listing_id:null,authority_version_id:'old'});api.consume.mockResolvedValue(null);
 const draft={draft_id:id,authority_version_id:null,version:1,content:handoff.draft,updated_at:'2026-11-19T00:00:00Z'};
 if(mode==='bucket')draftState.value={loaded:true,draft};else api.draft.mockResolvedValue(draft);
 const view=render(<VectoraizImport mode={mode}/>);await act(async()=>{});
 expect(view.container.textContent).toBe('');expect(screen.queryByText('Review old')).toBeNull();
});
