// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,describe,it,expect,vi} from 'vitest';
import LicenseReadingDialog from './LicenseReadingDialog';
const get=vi.hoisted(()=>vi.fn());vi.mock('@/api/client',()=>({api:{get}}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
describe('shared licence reading dialog',()=>{
 it('labels the dialog, traps keyboard and programmatic focus, closes on Esc and restores focus',()=>{
  const opened=vi.fn();render(<><button>Outside</button><LicenseReadingDialog label="Read licence" href="/licenses/standard/1.0/no-ai-training" text="Exact full text" onOpen={opened}/></>);
  const trigger=screen.getByRole('button',{name:'Read licence'});trigger.focus();fireEvent.click(trigger);
  expect(screen.getByRole('dialog',{name:'Read licence'}).getAttribute('aria-modal')).toBe('true');expect(opened).toHaveBeenCalledOnce();
  const close=screen.getByRole('button',{name:'Close'});const link=screen.getByRole('link',{name:'Open in new tab'});
  expect(document.activeElement).toBe(close);expect(link.getAttribute('href')).toBe('/licenses/standard/1.0/no-ai-training');
  fireEvent.keyDown(document,{key:'Tab',shiftKey:true});expect(document.activeElement).toBe(link);
  fireEvent.keyDown(document,{key:'Tab'});expect(document.activeElement).toBe(close);
  screen.getByRole('button',{name:'Outside'}).focus();expect(document.activeElement).toBe(close);
  expect(screen.getByText('Exact full text')).toBeTruthy();fireEvent.keyDown(document,{key:'Escape'});
  expect(screen.queryByRole('dialog')).toBeNull();expect(document.activeElement).toBe(trigger);expect(document.body.style.overflow).toBe('');
 });
 it('loads the selected stock document and keeps an external reading link on failure',async()=>{
  get.mockResolvedValueOnce({data:{full_text:'Full covenant'}}).mockRejectedValueOnce(new Error('offline'));
  render(<LicenseReadingDialog label="Read covenant" href="/licenses/marketplace-listing/1.0"/>);
  fireEvent.click(screen.getByRole('button',{name:'Read covenant'}));expect(await screen.findByText('Full covenant')).toBeTruthy();
  expect(get).toHaveBeenCalledWith('/licenses/marketplace-listing/1.0?format=json',expect.objectContaining({signal:expect.any(AbortSignal)}));
  fireEvent.keyDown(document,{key:'Escape'});fireEvent.click(screen.getByRole('button',{name:'Read covenant'}));
  await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('could not be loaded'));expect(screen.getByRole('link',{name:'Open in new tab'})).toBeTruthy();
 });
});
