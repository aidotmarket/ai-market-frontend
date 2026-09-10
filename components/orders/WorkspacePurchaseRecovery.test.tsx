// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import WorkspacePurchaseRecovery from './WorkspacePurchaseRecovery';
import {prepareWorkspacePurchase} from '@/api/sellerWorkspaceDownload';
import {getOrder} from '@/api/orders';
vi.mock('@/api/sellerWorkspaceDownload',()=>({prepareWorkspacePurchase:vi.fn()}));
vi.mock('@/api/orders',()=>({getOrder:vi.fn()}));
afterEach(cleanup);
beforeEach(()=>vi.resetAllMocks());
it('checks only on request and refreshes the purchase without requesting a download',async()=>{
  const ready=vi.fn();const order={id:'purchase',workspace_delivery:true,status:'delivered'};
  vi.mocked(getOrder).mockResolvedValue(order as Awaited<ReturnType<typeof getOrder>>);
  render(<WorkspacePurchaseRecovery orderId="purchase" onReady={ready}/>);
  expect(prepareWorkspacePurchase).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Check file access'}));
  await waitFor(()=>expect(ready).toHaveBeenCalledWith(order));
  expect(prepareWorkspacePurchase).toHaveBeenCalledTimes(1);
});
it('keeps a failed purchase available for an explicit retry',async()=>{
  vi.mocked(prepareWorkspacePurchase).mockRejectedValue(new Error('unavailable'));
  const ready=vi.fn();render(<WorkspacePurchaseRecovery orderId="purchase" onReady={ready}/>);
  fireEvent.click(screen.getByRole('button',{name:'Check file access'}));
  await screen.findByRole('alert');
  expect(ready).not.toHaveBeenCalled();expect(getOrder).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Check file access'}));
  await waitFor(()=>expect(prepareWorkspacePurchase).toHaveBeenCalledTimes(2));
});
it('ignores a late response after leaving the purchase',async()=>{
  let finish!:()=>void;
  vi.mocked(prepareWorkspacePurchase).mockImplementation(()=>new Promise<void>(resolve=>{finish=resolve;}));
  const ready=vi.fn();const view=render(<WorkspacePurchaseRecovery orderId="purchase" onReady={ready}/>);
  fireEvent.click(screen.getByRole('button',{name:'Check file access'}));
  view.unmount();finish();
  await waitFor(()=>expect(vi.mocked(prepareWorkspacePurchase).mock.calls[0][1].aborted).toBe(true));
  expect(ready).not.toHaveBeenCalled();
});
