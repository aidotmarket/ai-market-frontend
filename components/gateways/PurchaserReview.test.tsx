// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {useAuthStore} from '@/store/auth';
import PurchaserReview from './PurchaserReview';
import {VECTOR_ATTESTATION} from '@/lib/vectoraizHandoff';
import type {AuthorityReview} from '@/api/sellerWorkspace';
const api=vi.hoisted(()=>({caps:vi.fn(),read:vi.fn(),confirm:vi.fn()}));
vi.mock('@/api/sellerWorkspace',()=>({getAuthorityCapabilities:api.caps,authorityAvailable:(c:{import_enabled:boolean;handoff_versions:number[]})=>c.import_enabled&&c.handoff_versions.includes(1),readAuthorityReview:api.read,confirmAuthorityReview:api.confirm}));
const review:AuthorityReview={authority_version_id:'version',binding_hash:'binding',public_review:{public_fields:{title:'Vector pack',seller_attestation:VECTOR_ATTESTATION},rendered_html:'',render_hash:'render',presentation_version:'seller-listing-review-v3-authority-vector-v1',inventory_version:'public-surface-inventory-v2'},native_confirmed:true,purchaser_confirmed:false,purchaser_view:{door_host:'neutral.example',seller_attestation:VECTOR_ATTESTATION,files:[{file_id:'a',delivery_name:'chunks.parquet',size_bytes:10,columns:[{name:'project code',type:'string'},{name:'value',type:'string'}]}]},purchaser_view_hash:'view',gateway_metadata_revision:7};
beforeEach(()=>{
 api.caps.mockReset().mockResolvedValue({import_enabled:true,handoff_versions:[1]});api.read.mockReset().mockResolvedValue(review);api.confirm.mockReset().mockResolvedValue({event_id:'event'});
 useAuthStore.setState({user:{id:'seller'} as never,token:'token'});
});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
async function mount(value=review){
 api.read.mockResolvedValue(value);render(<PurchaserReview versionId="version"/>);
 await screen.findByText('Names your buyer will see');
}
it('stays dark when the capability or handoff version is disabled',async()=>{
 api.caps.mockResolvedValue({import_enabled:false,handoff_versions:[1]});const {container}=render(<PurchaserReview versionId="version"/>);
 await waitFor(()=>expect(api.caps).toHaveBeenCalled());expect(container.textContent).toBe('');expect(api.read).not.toHaveBeenCalled();
});
it('renders all private names, columns, unknown values and the fixed public/native attestation as text',async()=>{
 await mount();
 expect(screen.getByText('Gateway address: neutral.example')).toBeTruthy();expect(screen.getByText('chunks.parquet')).toBeTruthy();
 expect(screen.getByText('value — string')).toBeTruthy();expect(screen.getAllByText(VECTOR_ATTESTATION).length).toBeGreaterThan(0);
 expect(screen.getByText('Private to you. These names are excluded from company approval.')).toBeTruthy();
});
it('blocks host/delivery/public identity matches locally and allows an explicit column warning choice',async()=>{
 await mount();
 fireEvent.change(screen.getByLabelText('Names to keep private (one per line)'),{target:{value:'neutral'}});
 fireEvent.click(screen.getByLabelText('I reviewed the names my buyer will see.'));
 expect((screen.getByRole('button',{name:'Confirm buyer names'}) as HTMLButtonElement).disabled).toBe(true);
 expect(api.confirm).not.toHaveBeenCalled();
 fireEvent.change(screen.getByLabelText('Names to keep private (one per line)'),{target:{value:'project'}});
 fireEvent.click(screen.getByLabelText('I reviewed the names my buyer will see.'));
 fireEvent.click(screen.getByLabelText(/I reviewed these potentially private column names/));
 fireEvent.click(screen.getByRole('button',{name:'Confirm buyer names'}));
 await waitFor(()=>expect(api.confirm).toHaveBeenCalledOnce());
 expect(api.confirm.mock.calls[0][0]).toEqual(review);expect(JSON.stringify(api.confirm.mock.calls[0])).not.toContain('"project"');
});
it.each(['alias','column','delivery name','door host'])('T2 %s-only revision retains native confirmation and clears browser consent',async kind=>{
 await mount({...review,purchaser_confirmed:true});
 const updated={...review,authority_version_id:'next',binding_hash:'next-binding',gateway_metadata_revision:8,native_confirmed:true,purchaser_confirmed:false,
   purchaser_view:{...review.purchaser_view!,door_host:kind==='door host'?'changed.example':'neutral.example'}};
 api.read.mockResolvedValueOnce(updated);fireEvent.click(screen.getByRole('button',{name:'Refresh review'}));
 await screen.findByLabelText('I reviewed the names my buyer will see.');
 expect(screen.getByText('Pack review confirmed.')).toBeTruthy();
 expect(screen.queryByLabelText('I reviewed this exact pack in vectorAIz.')).toBeNull();
 expect((screen.getByLabelText('I reviewed the names my buyer will see.') as HTMLInputElement).checked).toBe(false);
});
it.each(['pack','source'])('T2 %s revision requires both confirmations again',async()=>{
 await mount({...review,purchaser_confirmed:true});
 api.read.mockResolvedValueOnce({...review,authority_version_id:'new-source',binding_hash:'new-source',native_confirmed:false,purchaser_confirmed:false});
 fireEvent.click(screen.getByRole('button',{name:'Refresh review'}));
 await screen.findByLabelText('I reviewed this exact pack in vectorAIz.');
 expect((screen.getByRole('button',{name:'Confirm buyer names'}) as HTMLButtonElement).disabled).toBe(true);
});
it('handles a stale 409 by removing the old preview and requiring a fresh read',async()=>{
 await mount();api.confirm.mockRejectedValueOnce({response:{status:409,data:{detail:{code:'AUTHORITY_PURCHASER_STALE'}}}});
 fireEvent.click(screen.getByLabelText('I reviewed the names my buyer will see.'));fireEvent.click(screen.getByLabelText(/I reviewed these potentially private column names/));fireEvent.click(screen.getByRole('button',{name:'Confirm buyer names'}));
 expect((await screen.findByRole('alert')).textContent).toContain('Refresh the review');
 expect(screen.queryByText('Names your buyer will see')).toBeNull();
});
it('reuses a confirmation key after an uncertain response and refresh of the same binding',async()=>{
 await mount({...review,purchaser_view:{...review.purchaser_view!,files:[]}});
 api.confirm.mockRejectedValueOnce(new Error('network'));
 fireEvent.click(screen.getByLabelText('I reviewed the names my buyer will see.'));fireEvent.click(screen.getByRole('button',{name:'Confirm buyer names'}));
 await screen.findByRole('alert');const key=api.confirm.mock.calls[0][2];
 fireEvent.click(screen.getByRole('button',{name:'Refresh review'}));await screen.findByText('Names your buyer will see');
 fireEvent.click(screen.getByLabelText('I reviewed the names my buyer will see.'));fireEvent.click(screen.getByRole('button',{name:'Confirm buyer names'}));
 await waitFor(()=>expect(api.confirm).toHaveBeenCalledTimes(2));expect(api.confirm.mock.calls[1][2]).toBe(key);
});
it('does not show a previous account review after an account change',async()=>{
 await mount();api.caps.mockResolvedValue({import_enabled:false,handoff_versions:[1]});
 await act(async()=>{useAuthStore.setState({user:{id:'other'} as never});});
 await waitFor(()=>expect(screen.queryByText('Names your buyer will see')).toBeNull());
});

it('CC NIT renders a column without name without crashing local identity checks',async()=>{
 await mount({...review,purchaser_view:{...review.purchaser_view!,files:[{...review.purchaser_view!.files[0],columns:[{type:'string'} as never]}]}});
 fireEvent.change(screen.getByLabelText('Names to keep private (one per line)'),{target:{value:'private'}});
 expect(screen.getByText('Names your buyer will see')).toBeTruthy();
});
