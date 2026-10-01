// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,it,expect,vi} from 'vitest';
import SavedWorkspaceData from './SavedWorkspaceData';
import {SellerListingDraftProvider,resetSellerListingDraftOwnerForTests} from './SellerListingDraftStore';
import {guidedConnection,guidedObjects} from '@/tests/guidedListingFixture';
const mocks=vi.hoisted(()=>({read:vi.fn(),save:vi.fn(),list:vi.fn(),sourceSaved:vi.fn(),dirty:vi.fn(),navigate:vi.fn(),source:null as unknown}));
vi.mock('@/api/sellerListingSource',()=>({readListingSource:mocks.read,saveListingSource:mocks.save}));
vi.mock('@/api/sellerListingDraft',()=>({readListingDraft:vi.fn().mockResolvedValue(null),saveListingDraft:vi.fn()}));
vi.mock('@/api/sellerWorkspace',async original=>({...await original<typeof import('@/api/sellerWorkspace')>(),listWorkspaceObjects:mocks.list}));
vi.mock('./GuidedListingFlow',()=>({useListingFlow:()=>({source:mocks.source,sourceLoaded:true,sourceError:'',samplesBlocked:false,licensesEnabled:true,sourceSaved:mocks.sourceSaved,setFilesDirty:mocks.dirty,navigate:mocks.navigate})}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
it('hydrates the lifted saved selection immediately and uses its version on the next changed save',async()=>{
 resetSellerListingDraftOwnerForTests();mocks.source={version:4,connection_current:true,content:{connection_id:guidedConnection.id,connection_version:1,version_mode:'current',objects:guidedObjects}};
 const second={...guidedObjects[0],key:'weekly/new.csv',etag:'new-etag'};mocks.list.mockResolvedValue({objects:[...guidedObjects,second],next_cursor:null});mocks.save.mockImplementation(async content=>({version:5,connection_current:true,content}));
 render(<SellerListingDraftProvider enabled sampleCapability={false}><SavedWorkspaceData enabled connections={[guidedConnection]}/></SellerListingDraftProvider>);
 expect((await screen.findByRole('checkbox',{name:'Select weekly/sales.csv'}) as HTMLInputElement).checked).toBe(true);expect(screen.queryByRole('button',{name:'Save selected files'})).toBeNull();expect(mocks.read).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('checkbox',{name:'Select weekly/new.csv'}));fireEvent.click(screen.getByRole('button',{name:'Next: Choose a licence →'}));await waitFor(()=>expect(mocks.save).toHaveBeenCalledOnce());
 expect(mocks.save.mock.calls[0][1]).toBe(4);expect(mocks.save.mock.calls[0][0].objects).toHaveLength(2);expect(mocks.sourceSaved).toHaveBeenCalledWith(expect.objectContaining({version:5}));expect(mocks.navigate).toHaveBeenCalledWith('license');
});
