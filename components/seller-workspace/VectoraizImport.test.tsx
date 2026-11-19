// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {useAuthStore} from '@/store/auth';
import VectoraizImport from './VectoraizImport';
import {VECTOR_NAMES,type PendingHandoff} from '@/lib/vectoraizHandoff';
const api=vi.hoisted(()=>({caps:vi.fn(),consume:vi.fn(),clear:vi.fn(),gateways:vi.fn(),files:vi.fn(),import:vi.fn()}));
vi.mock('@/api/sellerWorkspace',async original=>({...await original<typeof import('@/api/sellerWorkspace')>(),getAuthorityCapabilities:api.caps,importAuthorityDraft:api.import}));
vi.mock('@/api/sellerGateways',async original=>({...await original<typeof import('@/api/sellerGateways')>(),listSellerGateways:api.gateways,readAuthorityGatewayFiles:api.files}));
vi.mock('@/lib/vectoraizHandoff',async original=>({...await original<typeof import('@/lib/vectoraizHandoff')>(),consumeHandoff:api.consume,clearHandoff:api.clear}));
vi.mock('@/components/gateways/PurchaserReview',()=>({default:({versionId}:{versionId:string})=><p>Review {versionId}</p>}));
const id='00000000-0000-4000-8000-000000000001';
const handoff={version:1 as const,pack_id:id,draft:{title:'Vector pack',description:'Private draft description',brief:'Private brief',category:'Technology',tags:'vectors'},files:VECTOR_NAMES.map((_,i)=>({size:10+i,sha256:String(i).repeat(64)}))};
const pending:PendingHandoff={handoff,encoded:'native-compressed',expires:Date.now()+1000000,account:id,route:'/dashboard/gateways',key:id};
beforeEach(()=>{
 for(const f of Object.values(api))f.mockReset();
 useAuthStore.setState({user:{id,email:'seller@example.test'} as never,token:'token'});
 api.caps.mockResolvedValue({import_enabled:true,contract_version:'listing-authority-v1',handoff_versions:[1]});api.consume.mockResolvedValue(pending);
 api.gateways.mockResolvedValue([{gateway_id:'gateway',name:'My gateway',door_url:'https://neutral.example',gateway_metadata_revision:99}]);
 api.files.mockResolvedValue({revision:7,files:handoff.files.map((f,i)=>({file_id:String(i),display_name:VECTOR_NAMES[i].replace('examples/',''),size_bytes:f.size,present:true,changed_at:'2026-01-01',description:{state:'described',described_at:'2026-01-02',sha256:f.sha256}}))});
 api.import.mockResolvedValue({import_id:id,draft_id:id,listing_id:'listing',authority_version_id:'authority'});
});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
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
 expect((await screen.findByRole('alert')).textContent).toBe('You already have a listing in progress. Finish or discard it first.');
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
