// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ConnectedApps from './ConnectedApps';
import { getConnectorGrants, getConnectorStatus, revokeConnectorGrant } from '@/api/connector-oauth';

vi.mock('@/api/connector-oauth', () => ({ getConnectorStatus: vi.fn(), getConnectorGrants: vi.fn(), revokeConnectorGrant: vi.fn() }));
const grant = { id: 'grant-1', client: { name: '<img src=x onerror=alert(1)>', host: 'client.example', verified: true },
  organization: null, scopes: [{ scope: 'read', description: '<script>unsafe</script>' }],
  created_at: '2026-09-01T00:00:00Z', last_used_at: null };

beforeEach(() => { vi.resetAllMocks(); vi.mocked(getConnectorStatus).mockResolvedValue(true); vi.mocked(getConnectorGrants).mockResolvedValue([grant]); });
afterEach(cleanup);

it('renders grant details as text and a verified badge', async () => {
  render(<ConnectedApps />);
  expect(await screen.findByText(grant.client.name)).toBeTruthy();
  expect(screen.getByText('client.example')).toBeTruthy();
  expect(screen.getByText('Verified')).toBeTruthy();
  expect(screen.getByText('Personal')).toBeTruthy();
  expect(screen.getByText(grant.scopes[0].description)).toBeTruthy();
  expect(document.querySelector('img, script')).toBeNull();
});

it('is hidden when disabled', async () => {
  vi.mocked(getConnectorStatus).mockResolvedValue(false);
  render(<ConnectedApps />);
  await waitFor(() => expect(getConnectorStatus).toHaveBeenCalled());
  expect(document.querySelector('#connected-apps')).toBeNull();
  expect(getConnectorGrants).not.toHaveBeenCalled();
});

it('confirms revoke and removes only after a successful DELETE', async () => {
  let resolve!: () => void;
  vi.mocked(revokeConnectorGrant).mockReturnValue(new Promise((done) => { resolve = done; }));
  render(<ConnectedApps />);
  await screen.findByText(grant.client.name);
  fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
  expect(revokeConnectorGrant).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm revoke' }));
  expect(screen.getByText(grant.client.name)).toBeTruthy();
  expect(revokeConnectorGrant).toHaveBeenCalledWith('grant-1');
  resolve();
  await waitFor(() => expect(screen.queryByText(grant.client.name)).toBeNull());
});

it('keeps the row on revoke failure', async () => {
  vi.mocked(revokeConnectorGrant).mockRejectedValue(new Error('failed'));
  render(<ConnectedApps />);
  await screen.findByText(grant.client.name);
  fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm revoke' }));
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.getByText(grant.client.name)).toBeTruthy();
});

it('shows the empty state', async () => {
  vi.mocked(getConnectorGrants).mockResolvedValue([]);
  render(<ConnectedApps />);
  expect(await screen.findByText(/choose it in Claude or ChatGPT/)).toBeTruthy();
});
