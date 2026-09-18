// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AxiosError } from 'axios';
import SavedListingEditor from './SavedListingEditor';
import {SellerListingDraftProvider} from './SellerListingDraftStore';

const api = vi.hoisted(() => ({ readListingDraft: vi.fn(), saveListingDraft: vi.fn() }));
vi.mock('@/api/sellerListingDraft', () => api);
const content = { brief: '', title: 'Saved title', description: '', category: '', tags: '', price: '100', license: 'Research' };
beforeEach(() => {
  vi.clearAllMocks();
  api.readListingDraft.mockResolvedValue({ version: 3, content, updated_at: '2026-09-07T00:00:00Z' });
});
afterEach(cleanup);
const renderEditor=(sampleCapability=false)=>render(<SellerListingDraftProvider enabled sampleCapability={sampleCapability}><SavedListingEditor active /></SellerListingDraftProvider>);

it('loads an account draft before editing and preserves newer edits during a save', async () => {
  let finish!: (result: { version: number }) => void;
  api.saveListingDraft.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  renderEditor();
  expect(screen.queryByLabelText('Title')).toBeNull();
  const title = await screen.findByLabelText('Title');
  expect((title as HTMLInputElement).value).toBe('Saved title');
  fireEvent.change(title, { target: { value: 'First edit' } });
  fireEvent.click(screen.getByText('Save private draft'));
  await waitFor(()=>expect(api.saveListingDraft).toHaveBeenCalledOnce());
  expect(api.saveListingDraft.mock.calls[0][1]).toBe(3);
  fireEvent.change(title, { target: { value: 'Newer edit' } });
  await act(async () => finish({ version: 4 }));
  expect((title as HTMLInputElement).value).toBe('Newer edit');
  expect(screen.getByText(/You have unsaved changes/)).toBeTruthy();
});

it('reuses a request identity after an unknown save outcome', async () => {
  api.saveListingDraft.mockRejectedValueOnce(new Error('lost response')).mockResolvedValueOnce({ version: 4 });
  renderEditor();
  fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'Retry me' } });
  fireEvent.click(screen.getByText('Save private draft'));
  await screen.findByText(/Saving could not be confirmed/);
  fireEvent.click(screen.getByText('Save private draft'));
  await screen.findByText(/Draft saved to your account/);
  expect(api.saveListingDraft.mock.calls[0]).toEqual(api.saveListingDraft.mock.calls[1]);
});

it('keeps the local draft on conflict and does not silently fetch over it', async () => {
  api.saveListingDraft.mockRejectedValue(new AxiosError('conflict', undefined, undefined, undefined, { status: 409 } as never));
  renderEditor();
  const title = await screen.findByLabelText('Title');
  fireEvent.change(title, { target: { value: 'Keep this edit' } });
  fireEvent.click(screen.getByText('Save private draft'));
  await screen.findByText(/This draft was saved elsewhere/);
  expect((title as HTMLInputElement).value).toBe('Keep this edit');
  expect(api.readListingDraft).toHaveBeenCalledTimes(1);
});

it('does not open a blank editor when the saved draft cannot be read', async () => {
  api.readListingDraft.mockRejectedValue(new Error('offline'));
  renderEditor();
  await screen.findByRole('alert');
  expect(screen.queryByLabelText('Title')).toBeNull();
  expect(api.saveListingDraft).not.toHaveBeenCalled();
});

it('explains an unsupported price before saving and allows correction', async () => {
  api.saveListingDraft.mockResolvedValue({version:4});
  renderEditor();
  const price = await screen.findByLabelText('Your price (USD)');
  fireEvent.change(price, {target:{value:'1000000'}});
  expect(screen.getByRole('alert').textContent).toContain('$999,999.99');
  expect((screen.getByText('Save private draft') as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByText('Save private draft'));
  expect(api.saveListingDraft).not.toHaveBeenCalled();
  fireEvent.change(price, {target:{value:'999999.99'}});
  expect(screen.queryByRole('alert')).toBeNull();
  fireEvent.click(screen.getByText('Save private draft'));
  await screen.findByText(/Draft saved to your account/);
  expect(api.saveListingDraft.mock.calls[0][0].price).toBe('999999.99');
});

it('keeps the legacy draft PUT body byte-identical and round-trips an active sample selection',async()=>{
  api.saveListingDraft.mockImplementation(async(saved)=>({version:4,content:saved,updated_at:'2026-09-18T00:00:00Z'}));
  renderEditor();
  fireEvent.change(await screen.findByLabelText('Title'),{target:{value:'Legacy edit'}});
  fireEvent.click(screen.getByText('Save private draft'));
  await screen.findByText(/Draft saved to your account/);
  expect(JSON.stringify(api.saveListingDraft.mock.calls[0][0])).toBe(JSON.stringify({...content,title:'Legacy edit'}));
  cleanup();vi.clearAllMocks();
  const sampled={...content,sample_decision:'member_files' as const,sample_object_indices:[2]};
  api.readListingDraft.mockResolvedValue({version:3,content:sampled,updated_at:'2026-09-18T00:00:00Z'});
  api.saveListingDraft.mockImplementation(async(saved)=>({version:4,content:saved,updated_at:'2026-09-18T00:00:00Z'}));
  renderEditor(true);
  fireEvent.change(await screen.findByLabelText('Title'),{target:{value:'Sampled edit'}});
  fireEvent.click(screen.getByText('Save private draft'));
  await screen.findByText(/Draft saved to your account/);
  expect(api.saveListingDraft.mock.calls[0][0]).toEqual({...content,title:'Sampled edit',sample_decision:'member_files',sample_object_indices:[2]});
});
