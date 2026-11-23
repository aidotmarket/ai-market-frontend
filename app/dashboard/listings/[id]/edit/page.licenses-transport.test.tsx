// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import EditListingPage from './page';
import enabled from '@/api/fixtures/s1735-capability-on.json';
import disabled from '@/api/fixtures/s1735-capability-off.json';
import {useAuthStore} from '@/store/auth';
import type {User} from '@/types';

const transport=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),patch:vi.fn()}));
const navigation=vi.hoisted(()=>({id:'listing-1',router:{push:vi.fn()}}));
vi.mock('@/api/client', async original => ({ ...await original<typeof import('@/api/client')>(), api: transport }));
vi.mock('next/navigation',()=>({useParams:()=>({id:navigation.id}),useRouter:()=>navigation.router}));
vi.mock('@/components/Toast',()=>{const toast=vi.fn();return {useToast:()=>({toast})};});
vi.mock('@/components/listings/SellerAtAGlance',()=>({default:()=>null}));
vi.mock('@/components/listings/SellerShareControls',()=>({default:()=>null}));

const listing={title:'Example listing',description:'Useful data',category:'Technology',tags:[],price:25,
  pricing_type:'one_time',status:'unlisted',listing_licenses_enabled:true};
afterEach(()=>{cleanup();useAuthStore.setState({user:null,token:null});navigation.id='listing-1';vi.resetAllMocks();});
const identity={status:'known',source:'stripe_connect',legal_name:'Sam Seller Ltd',jurisdiction:'US',version:2,seller_editable:false};
const getFor=(capability:unknown)=>async(path:string)=>({data:path==='/seller-workspace/capabilities'?capability:path==='/seller-workspace/legal-identity'?identity:listing});

it.each(['account','listing'])('restarts prefill when the %s changes after signer details appear',async(scope)=>{
  const signInAs=(id:string)=>useAuthStore.setState({user:{id} as User,token:`session-${id}`});
  signInAs('seller-1');
  const signerLookup=vi.fn().mockResolvedValueOnce({data:{signer_name:'First Seller',signer_title:'Director'}})
    .mockResolvedValueOnce({data:null});
  transport.get.mockImplementation((path:string)=>path==='/seller-workspace/license-signer'?signerLookup():getFor(enabled)(path));
  const view=render(<EditListingPage/>);
  await screen.findByDisplayValue('First Seller');
  expect(screen.getByDisplayValue('Director')).toBeTruthy();

  if(scope==='account') act(()=>signInAs('seller-2'));
  else {navigation.id='listing-2';view.rerender(<EditListingPage/>);}

  await waitFor(()=>expect(signerLookup).toHaveBeenCalledTimes(2));
  expect(screen.getByLabelText<HTMLInputElement>('Signer full name').value).toBe('');
  expect(screen.getByLabelText<HTMLInputElement>('Signer title').value).toBe('');
});

it('omits the unpublished licence choice from the edit-page draft PATCH',async()=>{
  transport.get.mockImplementation(async(path:string)=>({data:path==='/seller-workspace/capabilities'?enabled:listing}));
  transport.patch.mockResolvedValue({data:{}});
  render(<EditListingPage/>);
  const save=await screen.findByRole('button',{name:'Save Draft'});
  fireEvent.click(save);
  await waitFor(()=>expect(transport.patch).toHaveBeenCalledOnce());
  expect(transport.patch.mock.calls[0][0]).toBe('/listings/listing-1');
  expect(transport.patch.mock.calls[0][1]).not.toHaveProperty('license_selection');
});

it.each([[enabled,true],[disabled,false]])('uses only the capability response for licence UI and publish payload',async(capability,shown)=>{
  transport.get.mockImplementation(getFor(capability));
  transport.post.mockImplementation(async(path:string)=>({data:path==='/seller-workspace/legal-identity/refresh'?identity:{}}));
  render(<EditListingPage/>);
  const publish=await screen.findByRole('button',{name:'Publish'}) as HTMLButtonElement;
  expect(Boolean(screen.queryByText('How can buyers use this data?'))).toBe(shown);
  expect(transport.get).toHaveBeenCalledWith('/seller-workspace/capabilities');
  expect(transport.get).toHaveBeenCalledWith('/listings/listing-1');
  if (shown) {
    expect(publish.disabled).toBe(true);
    const details=screen.getByText('Read the summary and full terms').closest('details')!;
    Object.defineProperty(details,'open',{value:true,configurable:true});fireEvent(details,new Event('toggle'));
    fireEvent.change(screen.getByLabelText('Signer full name'),{target:{value:'Sam Seller'}});
    fireEvent.change(screen.getByLabelText('Signer title'),{target:{value:'Director'}});
    fireEvent.click(screen.getByLabelText('Confirm covenant and authority'));
  }
  fireEvent.click(publish);
  await waitFor(()=>expect(transport.post).toHaveBeenCalledWith('/listings/listing-1/publish',...(shown?[expect.anything()]:[])));
  const call=transport.post.mock.calls.find(([path])=>path==='/listings/listing-1/publish')!;
  expect(call[1]).toEqual(shown?{license_selection:expect.objectContaining({kind:'standard',identity_version:2,seller_acceptance:{signer_name:'Sam Seller',signer_title:'Director',authority_confirmed:true}})}:undefined);
  expect(transport.get.mock.calls.some(([path])=>path==='/seller-workspace/legal-identity')).toBe(shown);
});
