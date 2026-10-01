// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {AxiosError} from 'axios';
import {WorkspaceData} from './WorkspaceData';
import {guidedConnection,guidedObjects} from '@/tests/guidedListingFixture';
const mocks=vi.hoisted(()=>({list:vi.fn(),navigate:vi.fn(),dirty:vi.fn(),blocked:false}));
vi.mock('@/api/sellerWorkspace',async original=>({...await original<typeof import('@/api/sellerWorkspace')>(),listWorkspaceObjects:mocks.list}));
vi.mock('./GuidedListingFlow',()=>({useListingFlow:()=>({licensesEnabled:true,samplesBlocked:mocks.blocked,navigate:mocks.navigate,setFilesDirty:mocks.dirty})}));
afterEach(()=>{cleanup();vi.clearAllMocks();});beforeEach(()=>{mocks.blocked=false;mocks.list.mockResolvedValue({objects:guidedObjects,next_cursor:null});});
describe('file Next saves and confirms',()=>{
 it('moves on from saved unchanged files without another save',async()=>{
  const save=vi.fn();render(<WorkspaceData connections={[guidedConnection]} enabled savedSource={{version:1,connection_current:true,content:{connection_id:guidedConnection.id,connection_version:1,version_mode:'current',objects:guidedObjects}}} onSaveSelection={save}/>);
  await screen.findByRole('checkbox',{name:'Select weekly/sales.csv'});expect(screen.queryByRole('button',{name:'Save selected files'})).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Next: Choose a licence →'}));expect(save).not.toHaveBeenCalled();expect(mocks.navigate).toHaveBeenCalledWith('license');
 });
 it('saves changed files first, remains on failed save with its reason, and can retry Next',async()=>{
  const failure=new AxiosError('refused',undefined,undefined,undefined,{status:409,data:{detail:'The selected file version changed. Choose current files.'}} as never);const save=vi.fn().mockRejectedValueOnce(failure).mockResolvedValue(undefined);
  render(<WorkspaceData connections={[guidedConnection]} enabled onSaveSelection={save}/>);fireEvent.click(await screen.findByRole('checkbox',{name:'Select weekly/sales.csv'}));
  fireEvent.click(screen.getByRole('button',{name:'Next: Choose a licence →'}));expect(await screen.findByText('The selected file version changed. Choose current files.')).toBeTruthy();expect(mocks.navigate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Next: Choose a licence →'}));await waitFor(()=>expect(mocks.navigate).toHaveBeenCalledWith('license'));expect(save).toHaveBeenCalledTimes(2);expect(screen.queryByRole('button',{name:'Save selected files'})).toBeNull();
 });
 it('stays on the file step when files commit but sample reconciliation fails',async()=>{
  const save=vi.fn().mockResolvedValue(false);render(<WorkspaceData connections={[guidedConnection]} enabled onSaveSelection={save}/>);fireEvent.click(await screen.findByRole('checkbox',{name:'Select weekly/sales.csv'}));fireEvent.click(screen.getByRole('button',{name:'Next: Choose a licence →'}));
  expect(await screen.findByText('Your files were saved, but your sample choice could not be saved. Finish or clear the sample choice before continuing.')).toBeTruthy();expect(mocks.navigate).not.toHaveBeenCalled();expect(screen.queryByRole('button',{name:'Save selected files'})).toBeNull();
 });
 it('explains an unsaved sample choice without asking to re-save unchanged files',async()=>{
  mocks.blocked=true;render(<WorkspaceData connections={[guidedConnection]} enabled savedSource={{version:1,connection_current:true,content:{connection_id:guidedConnection.id,connection_version:1,version_mode:'current',objects:guidedObjects}}} onSaveSelection={vi.fn()}/>);
  expect((screen.getByRole('button',{name:'Next: Choose a licence →'}) as HTMLButtonElement).disabled).toBe(true);expect(screen.getByText('Finish saving your sample choice or clear it before continuing.')).toBeTruthy();await screen.findByRole('checkbox',{name:'Select weekly/sales.csv'});
 });
 it('explains why Next is disabled with no file choice',()=>{
  render(<WorkspaceData connections={[guidedConnection]} enabled onSaveSelection={vi.fn()}/>);expect((screen.getByRole('button',{name:'Next: Choose a licence →'}) as HTMLButtonElement).disabled).toBe(true);expect(screen.getByText('Choose at least one file before continuing.')).toBeTruthy();
 });
});
