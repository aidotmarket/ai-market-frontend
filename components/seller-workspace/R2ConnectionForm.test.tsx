// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import R2ConnectionForm from './R2ConnectionForm';
const api=vi.hoisted(()=>({save:vi.fn()}));
vi.mock('@/api/sellerWorkspace',()=>({createIdempotencyKey:()=> 'r2-test-id',saveR2Connection:api.save}));
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
