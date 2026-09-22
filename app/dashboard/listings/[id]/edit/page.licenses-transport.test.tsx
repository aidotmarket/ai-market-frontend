// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import EditListingPage from './page';
import enabled from '@/api/fixtures/s1735-capability-on.json';
import disabled from '@/api/fixtures/s1735-capability-off.json';

const transport=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('@/api/client',()=>({api:transport}));
vi.mock('next/navigation',()=>({useParams:()=>({id:'listing-1'}),useRouter:()=>({push:vi.fn()})}));
vi.mock('@/components/Toast',()=>({useToast:()=>({toast:vi.fn()})}));
vi.mock('@/components/listings/SellerAtAGlance',()=>({default:()=>null}));
vi.mock('@/components/listings/SellerShareControls',()=>({default:()=>null}));

const listing={title:'Example listing',description:'Useful data',category:'Technology',tags:[],price:25,
  pricing_type:'one_time',status:'unlisted',listing_licenses_enabled:true};
afterEach(()=>{cleanup();vi.resetAllMocks();});

it.each([[enabled,true],[disabled,false]])('uses only the capability response for licence UI and publish payload',async(capability,shown)=>{
  transport.get.mockImplementation(async(path:string)=>({data:path==='/seller-workspace/capabilities'?capability:listing}));
  transport.post.mockResolvedValue({data:{}});
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
  await waitFor(()=>expect(transport.post).toHaveBeenCalled());
  expect(transport.post.mock.calls[0][0]).toBe('/listings/listing-1/publish');
  expect(transport.post.mock.calls[0][1]).toEqual(shown?{license_selection:expect.objectContaining({kind:'standard',seller_acceptance:{signer_name:'Sam Seller',signer_title:'Director',authority_confirmed:true}})}:undefined);
});
