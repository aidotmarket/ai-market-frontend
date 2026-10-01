// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {AxiosError} from 'axios';
import SavedLicenseStep from './SavedLicenseStep';
import {SellerListingDraftProvider,resetSellerListingDraftOwnerForTests} from './SellerListingDraftStore';
import {createStandardSelection} from '@/api/listingLicenses';
import {emptyGuidedDraft} from '@/tests/guidedListingFixture';
const mocks=vi.hoisted(()=>({read:vi.fn(),save:vi.fn(),navigate:vi.fn(),dirty:vi.fn(),enabled:true}));
vi.mock('@/api/sellerListingDraft',()=>({readListingDraft:mocks.read,saveListingDraft:mocks.save}));
vi.mock('./GuidedListingFlow',()=>({useListingFlow:()=>({licensesEnabled:mocks.enabled,navigate:mocks.navigate,setLicenceDirty:mocks.dirty})}));
vi.mock('@/api/sellerLegalIdentity',async original=>({...await original<typeof import('@/api/sellerLegalIdentity')>(),getSellerLegalIdentity:vi.fn().mockResolvedValue({status:'known',source:'stripe_connect',legal_name:'Synthetic Seller',jurisdiction:'ES',version:1}),refreshSellerLegalIdentity:vi.fn().mockResolvedValue({status:'known',source:'stripe_connect',legal_name:'Synthetic Seller',jurisdiction:'ES',version:1})}));
const selected={...createStandardSelection(),identity_version:1,seller_acceptance:{signer_name:'Sam Seller',signer_title:'Owner',authority_confirmed:true}};
const saved={version:2,updated_at:'2026-10-01T00:00:00Z',content:{...emptyGuidedDraft,license_selection:selected}};
const renderStep=()=>render(<SellerListingDraftProvider enabled sampleCapability={false}><SavedLicenseStep/></SellerListingDraftProvider>);
afterEach(()=>{cleanup();vi.clearAllMocks();});beforeEach(()=>{resetSellerListingDraftOwnerForTests();mocks.enabled=true;mocks.read.mockResolvedValue(saved);mocks.save.mockImplementation(async content=>({...saved,version:3,content}));});
describe('separate saved licence task',()=>{
 it('treats a saved complete choice as confirmed and moves on without another save',async()=>{
  renderStep();await screen.findByText('Legal name on the licence: Synthetic Seller (ES)');expect(screen.queryByRole('button',{name:'Save licence choice'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Next: Describe and price →'}));await waitFor(()=>expect(mocks.navigate).toHaveBeenCalledWith('listing'));expect(mocks.save).not.toHaveBeenCalled();
 });
 it('saves changed licence details with empty category before Next, showing the reason and staying on failure',async()=>{
  const failure=new AxiosError('refused',undefined,undefined,undefined,{status:409,data:{detail:'The licence choice changed elsewhere. Retry the saved draft.'}} as never);mocks.save.mockRejectedValueOnce(failure).mockImplementationOnce(async content=>({...saved,version:3,content}));
  renderStep();await screen.findByText('Legal name on the licence: Synthetic Seller (ES)');fireEvent.change(screen.getByLabelText('Signer title'),{target:{value:'Director'}});
  fireEvent.click(screen.getByRole('button',{name:'Next: Describe and price →'}));expect(await screen.findByText('The licence choice changed elsewhere. Retry the saved draft.')).toBeTruthy();expect(mocks.navigate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Next: Describe and price →'}));await waitFor(()=>expect(mocks.navigate).toHaveBeenCalledWith('listing'));expect(mocks.save.mock.calls[1][0].category).toBe('');expect(mocks.save.mock.calls[1][0].license_selection.seller_acceptance.signer_title).toBe('Director');expect(screen.queryByRole('button',{name:'Save licence choice'})).toBeNull();
 });
 it('skips selection when the existing licence capability is off',async()=>{
  mocks.enabled=false;renderStep();expect(screen.queryByText('How can buyers use this data?')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Next: Describe and price →'}));expect(mocks.navigate).toHaveBeenCalledWith('listing');await waitFor(()=>expect(mocks.read).toHaveBeenCalled());
 });
});
