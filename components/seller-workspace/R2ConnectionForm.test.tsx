// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import R2ConnectionForm from './R2ConnectionForm';
const api=vi.hoisted(()=>({save:vi.fn()}));
vi.mock('@/api/sellerWorkspace',async(importOriginal)=>({...await importOriginal<typeof import('@/api/sellerWorkspace')>(),createIdempotencyKey:()=> 'r2-test-id',saveR2Connection:api.save}));
import {SellerWorkspaceApiError,type SellerWorkspaceConnection} from '@/api/sellerWorkspace';
afterEach(()=>{cleanup();vi.resetAllMocks();});

it('keeps keys hidden and requires dedicated read-only confirmation before saving',async()=>{
  const saved=vi.fn();api.save.mockResolvedValue({connection:{id:'r2-connection'}});
  render(<R2ConnectionForm onSaved={saved} onClose={vi.fn()}/>);
  expect((screen.getByRole('button',{name:'Verify and connect R2'}) as HTMLButtonElement).disabled).toBe(true);
  for (const [label,value] of [['Cloudflare account ID','d'.repeat(32)],['Bucket name','seller-bucket'],['Folder inside the bucket','sale'],['Access Key ID','a'.repeat(32)],['Secret Access Key','b'.repeat(64)]]){
    fireEvent.change(screen.getByLabelText(label),{target:{value}});
  }
  expect((screen.getByLabelText('Secret Access Key') as HTMLInputElement).type).toBe('password');
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button',{name:'Verify and connect R2'}));
  await waitFor(()=>expect(saved).toHaveBeenCalledWith({id:'r2-connection'}));
  expect(api.save).toHaveBeenCalledWith(expect.objectContaining({dedicated_bucket_readonly:true,expected_version:0,secret_access_key:'b'.repeat(64)}),'r2-test-id',undefined);
  expect((screen.getByLabelText('Secret Access Key') as HTMLInputElement).value).toBe('');
});

it('does not echo a failed request or provider secret',async()=>{
  api.save.mockRejectedValue(new Error('private-provider-secret'));
  render(<R2ConnectionForm onSaved={vi.fn()} onClose={vi.fn()}/>);
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.submit(screen.getByRole('button',{name:'Verify and connect R2'}).closest('form')!);
  await screen.findByRole('alert');
  expect(screen.queryByText(/private-provider-secret/)).toBeNull();
});

it('keeps the R2 server security refusal distinct from invalid keys',async()=>{
 api.save.mockRejectedValue(new SellerWorkspaceApiError('two_factor_required'));const saved=vi.fn();
 render(<R2ConnectionForm onSaved={saved} onClose={vi.fn()}/>);fireEvent.click(screen.getByRole('checkbox'));
 fireEvent.submit(screen.getByRole('button',{name:'Verify and connect R2'}).closest('form')!);
 expect((await screen.findByRole('alert')).textContent).toContain('sign-in security step');expect(saved).not.toHaveBeenCalled();
});

const serverConfirmation={version:'v9',text:'R2 server confirmation <verbatim> & unchanged.'};
const fillR2=()=>{
  for(const [label,value] of [['Cloudflare account ID','d'.repeat(32)],['Bucket name','seller-bucket'],['Access Key ID','a'.repeat(32)],['Secret Access Key','b'.repeat(64)]])fireEvent.change(screen.getByLabelText(label),{target:{value}});
  fireEvent.click(screen.getByRole('checkbox',{name:'These keys have Object Read only permission for this dedicated bucket.'}));
};
it('defaults to folder and sends no whole-bucket confirmation for a folder connection',async()=>{
  api.save.mockResolvedValue({connection:{id:'folder'}});
  render(<R2ConnectionForm wholeBucketConfirmation={serverConfirmation} onSaved={vi.fn()} onClose={vi.fn()}/>);
  expect((screen.getByRole('radio',{name:'A folder in the bucket'}) as HTMLInputElement).checked).toBe(true);
  fillR2();fireEvent.change(screen.getByLabelText('Folder inside the bucket'),{target:{value:'sale'}});
  fireEvent.click(screen.getByRole('button',{name:'Verify and connect R2'}));
  await waitFor(()=>expect(api.save).toHaveBeenCalledOnce());
  const payload=api.save.mock.calls[0][0];
  expect(payload).toMatchObject({scope:'prefix',prefix:'sale'});
  expect(payload).not.toHaveProperty('whole_bucket_confirmed');expect(payload).not.toHaveProperty('confirmation_version');
});
it('hides whole bucket without the capability',()=>{
  render(<R2ConnectionForm onSaved={vi.fn()} onClose={vi.fn()}/>);
  expect(screen.queryByRole('radio',{name:'The whole bucket'})).toBeNull();
  expect(screen.getByLabelText('Folder inside the bucket')).toBeTruthy();
});
it('requires the server checkbox and echoes its version with an empty prefix',async()=>{
  api.save.mockResolvedValue({connection:{id:'whole'}});
  render(<R2ConnectionForm wholeBucketConfirmation={serverConfirmation} onSaved={vi.fn()} onClose={vi.fn()}/>);
  fillR2();fireEvent.change(screen.getByLabelText('Folder inside the bucket'),{target:{value:'stale-folder'}});
  fireEvent.click(screen.getByRole('radio',{name:'The whole bucket'}));
  expect(screen.queryByLabelText('Folder inside the bucket')).toBeNull();
  const checkbox=screen.getByRole('checkbox',{name:serverConfirmation.text}) as HTMLInputElement;
  expect(checkbox.required).toBe(true);expect(checkbox.parentElement?.querySelector('span')?.textContent).toBe(serverConfirmation.text);
  const submit=screen.getByRole('button',{name:'Verify and connect R2'}) as HTMLButtonElement;
  expect(submit.disabled).toBe(true);fireEvent.submit(submit.closest('form')!);expect(api.save).not.toHaveBeenCalled();
  fireEvent.click(checkbox);fireEvent.click(submit);
  await waitFor(()=>expect(api.save).toHaveBeenCalledOnce());
  expect(api.save.mock.calls[0][0]).toMatchObject({scope:'whole_bucket',prefix:'',whole_bucket_confirmed:true,confirmation_version:'v9'});
});
it.each(['prefix','whole_bucket'] as const)('preserves %s binding on key replacement with no confirmation fields, even flag off',async(scope)=>{
  api.save.mockResolvedValue({connection:{id:'existing'}});
  const connection={id:'existing',scope,prefix:scope==='prefix'?'sale':'',provider_account_id:'d'.repeat(32),bucket:'seller-bucket',region:'eu',version:4} as SellerWorkspaceConnection;
  render(<R2ConnectionForm connection={connection} onSaved={vi.fn()} onClose={vi.fn()}/>);
  expect(screen.queryByRole('radio')).toBeNull();
  fireEvent.change(screen.getByLabelText('Access Key ID'),{target:{value:'a'.repeat(32)}});
  fireEvent.change(screen.getByLabelText('Secret Access Key'),{target:{value:'b'.repeat(64)}});
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button',{name:'Verify and replace keys'}));
  await waitFor(()=>expect(api.save).toHaveBeenCalledOnce());
  const payload=api.save.mock.calls[0][0];
  expect(payload).toMatchObject({scope,prefix:connection.prefix,expected_version:4});
  expect(payload).not.toHaveProperty('whole_bucket_confirmed');expect(payload).not.toHaveProperty('confirmation_version');
  expect(api.save.mock.calls[0][2]).toBe('existing');
});

it('requires fresh whole-bucket consent after changing scope or bucket',()=>{
  render(<R2ConnectionForm wholeBucketConfirmation={serverConfirmation} onSaved={vi.fn()} onClose={vi.fn()}/>);
  fillR2();
  fireEvent.click(screen.getByRole('radio',{name:'The whole bucket'}));
  fireEvent.click(screen.getByRole('checkbox',{name:serverConfirmation.text}));
  fireEvent.click(screen.getByRole('radio',{name:'A folder in the bucket'}));
  fireEvent.click(screen.getByRole('radio',{name:'The whole bucket'}));
  expect((screen.getByRole('checkbox',{name:serverConfirmation.text}) as HTMLInputElement).checked).toBe(false);
  fireEvent.click(screen.getByRole('checkbox',{name:serverConfirmation.text}));
  fireEvent.change(screen.getByLabelText('Bucket name'),{target:{value:'another-bucket'}});
  expect((screen.getByRole('checkbox',{name:serverConfirmation.text}) as HTMLInputElement).checked).toBe(false);
});
