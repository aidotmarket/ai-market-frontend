// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SellerWorkspaceConnection } from '@/api/sellerWorkspace';
import SavedWorkspaceData from './SavedWorkspaceData';
const api = vi.hoisted(() => ({readListingSource:vi.fn(), saveListingSource:vi.fn(), listWorkspaceObjects:vi.fn()}));
vi.mock('@/api/sellerListingSource', () => api);
vi.mock('@/api/sellerWorkspace', () => api);
const connection = {id:'connection-1',version:1,status:'verified',bucket:'synthetic',prefix:'data'} as SellerWorkspaceConnection;
const object = {key:'data/example.csv',version_id:null,etag:'synthetic',size:42,last_modified:null,format_candidate:'csv'};
const content = {connection_id:connection.id,connection_version:1,version_mode:'current',objects:[{key:object.key,version_id:null,etag:object.etag,size:42}]};
afterEach(cleanup);
beforeEach(() => {vi.resetAllMocks(); api.listWorkspaceObjects.mockResolvedValue({objects:[object],next_cursor:null});});
it('restores the selected files from the account', async () => {
  api.readListingSource.mockResolvedValue({version:2, content, connection_current:true});
  render(<SavedWorkspaceData enabled connections={[connection]} />);
  const checkbox = await screen.findByRole('checkbox', {name:`Select ${object.key}`});
  expect((checkbox as HTMLInputElement).checked).toBe(true);
  expect(screen.getByText(/File selection saved to your account/)).toBeTruthy();
});
it('retries an unknown save with the same version and identity', async () => {
  api.readListingSource.mockResolvedValue(null);
  api.saveListingSource.mockRejectedValueOnce(new Error('network')).mockResolvedValue({version:1,content,connection_current:true});
  render(<SavedWorkspaceData enabled connections={[connection]} />);
  fireEvent.click(await screen.findByRole('checkbox', {name:`Select ${object.key}`}));
  fireEvent.click(screen.getByRole('button', {name:'Save selected files'}));
  await screen.findByText(/Saving could not be confirmed/);
  fireEvent.click(screen.getByRole('button', {name:'Save selected files'}));
  await screen.findByText(/File selection saved to your account/);
  expect(api.saveListingSource.mock.calls[0]).toEqual(api.saveListingSource.mock.calls[1]);
  expect(api.saveListingSource.mock.calls[0][0]).toEqual(content);
  expect(api.saveListingSource.mock.calls[0][1]).toBe(0);
});
it('does not open an empty file picker when the saved selection cannot be loaded', async () => {
  api.readListingSource.mockRejectedValue(new Error('network'));
  render(<SavedWorkspaceData enabled connections={[connection]} />);
  await screen.findByRole('alert');
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(api.listWorkspaceObjects).not.toHaveBeenCalled();
  api.readListingSource.mockResolvedValue(null);
  fireEvent.click(screen.getByRole('button', {name:'Try loading again'}));
  await waitFor(() => expect(api.listWorkspaceObjects).toHaveBeenCalledTimes(1));
});
