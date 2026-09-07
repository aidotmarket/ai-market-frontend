// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
const stream=vi.hoisted(() => vi.fn());
vi.mock('./workspaceDownloadStream',async importOriginal => ({...await importOriginal<object>(),streamWorkspaceDownload:stream}));
import WorkspaceDownload from './WorkspaceDownload';
const bundle=()=>({delivery_type:'workspace_direct' as const,download_number:1,downloads_remaining:2,files:[{filename:'retail.csv',size:3,
  url:'https://synthetic.s3.eu-west-1.amazonaws.com/file?X-Amz-SignedHeaders=host%3Bif-match',headers:{'If-Match':'"e"'},expires_at:new Date(Date.now()+60000).toISOString()}]});
afterEach(() => {cleanup();Reflect.deleteProperty(window,'showDirectoryPicker');vi.resetAllMocks();});
it('chooses a folder before requesting access and downloads only after an explicit click',async () => {
  const directory={};const picker=vi.fn(async () => directory);Object.defineProperty(window,'showDirectoryPicker',{value:picker,configurable:true});
  const grant=vi.fn(async () => {expect(picker).toHaveBeenCalledOnce();return bundle();});
  stream.mockResolvedValue('ai-market-synthetic');
  render(<WorkspaceDownload orderId="order-1" requestGrant={grant} />);
  expect(grant).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Choose folder and download'}));
  expect(await screen.findByText(/Saved 1 file/)).toBeTruthy();
  expect(grant).toHaveBeenCalledOnce();expect(stream.mock.calls[0][1]).toBe(directory);
});
it('does not consume access when the folder picker is cancelled',async () => {
  Object.defineProperty(window,'showDirectoryPicker',{value:vi.fn(async () => {throw new DOMException('cancel','AbortError');}),configurable:true});
  const grant=vi.fn();render(<WorkspaceDownload orderId="order-1" requestGrant={grant} />);
  fireEvent.click(screen.getByRole('button',{name:'Choose folder and download'}));
  await screen.findByText(/Download cancelled/);
  expect(grant).not.toHaveBeenCalled();
});
it('ignores late grant responses after leaving the page',async () => {
  Object.defineProperty(window,'showDirectoryPicker',{value:vi.fn(async () => ({})),configurable:true});
  let resolve!: (value:ReturnType<typeof bundle>) => void;
  const grant=vi.fn(() => new Promise<ReturnType<typeof bundle>>(done => {resolve=done;}));
  const view=render(<WorkspaceDownload orderId="order-1" requestGrant={grant} />);
  fireEvent.click(screen.getByRole('button',{name:'Choose folder and download'}));
  await screen.findByText(/Checking access/);view.unmount();
  await act(async () => resolve(bundle()));
  expect(stream).not.toHaveBeenCalled();
});
