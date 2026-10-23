// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ConnectorConsentPage from '@/app/oauth/connect/page';
import { api } from '@/api/client';
import { useAuthStore } from '@/store/auth';
import { readConnectorContinuation } from '@/lib/aim-data-continuation';
import { buyerPermissions, consentId, consentMetadata, sellerPermissions } from './fixtures/connector-consent';

const navigation = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
vi.mock('@/api/client', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
const assign = vi.fn();
const path = `/oauth/connect?request=${consentId}`;
let metadata: ReturnType<typeof consentMetadata>;
const postPath = `/connector-oauth/requests/${consentId}/decision`;

beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear(); sessionStorage.clear();
  metadata = consentMetadata();
  vi.stubGlobal('window', { document, location: { pathname: '/oauth/connect', search: `?request=${consentId}`, hash: '', assign } });
  vi.mocked(api.get).mockImplementation(async url => ({ data: url === '/connector-oauth/status' ? { enabled: true } : metadata }));
  vi.mocked(api.post).mockResolvedValue({ data: { continue_url: `https://auth.ai.market/oauth/authorize/complete?request=${consentId}` } });
  useAuthStore.setState({ hydrated: true, isLoading: false, isAuthenticated: true, user: { id: 'user', email: 'user@example.com' } as never });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('defaults to Buyer, shows all eight Seller descriptions before approval, and clears Seller copy on switching back', async () => {
  render(<ConnectorConsentPage />);
  const buyer = await screen.findByRole('radio', { name: 'Buyer' }) as HTMLInputElement;
  expect(buyer.checked).toBe(true);
  expect(screen.getAllByRole('listitem')).toHaveLength(2);
  buyerPermissions.forEach(item => expect(screen.getByText(item.description)).toBeTruthy());
  fireEvent.click(screen.getByRole('radio', { name: 'Seller' }));
  expect(screen.getByRole('heading', { name: 'Seller permissions you are granting' })).toBeTruthy();
  expect(screen.getAllByRole('listitem')).toHaveLength(8);
  sellerPermissions.forEach(item => expect(screen.getByText(item.description)).toBeTruthy());
  expect(screen.getByText(/Licenses and required human reviews are completed on ai.market/)).toBeTruthy();
  expect(api.post).not.toHaveBeenCalled();
  fireEvent.click(buyer);
  expect(screen.getAllByRole('listitem')).toHaveLength(2);
  expect(screen.queryByText(/Licenses/)).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Seller permissions you are granting' })).toBeNull();
});

it.each(['absent', 'incomplete', 'unknown-scope', 'blank-description', 'unsupported-version'] as const)('hides Seller and permits only Buyer approval when metadata is %s', async reason => {
  if (reason === 'absent') delete metadata.tool_set_scopes;
  if (reason === 'incomplete') metadata.tool_set_scopes!.seller = sellerPermissions.slice(1);
  if (reason === 'unknown-scope') metadata.tool_set_scopes!.seller = [...sellerPermissions.slice(1), { scope: 'other', description: 'Other' }];
  if (reason === 'blank-description') metadata.tool_set_scopes!.seller = sellerPermissions.map(item => ({ ...item, description: ' ' }));
  if (reason === 'unsupported-version') metadata.seller_permissions_version = 2;
  render(<ConnectorConsentPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
  expect(screen.queryByRole('radio', { name: 'Seller' })).toBeNull();
  await waitFor(() => expect(api.post).toHaveBeenCalledExactlyOnceWith(postPath, {
    decision: 'approve', organization_id: null, csrf_nonce: 'nonce',
  }));
});

it.each(['seller', 'buyer', 'deny'] as const)('echoes the version only on Seller approval: %s', async choice => {
  render(<ConnectorConsentPage />);
  await screen.findByRole('radio', { name: 'Seller' });
  fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } });
  if (choice !== 'buyer') fireEvent.click(screen.getByRole('radio', { name: 'Seller' }));
  fireEvent.click(screen.getByRole('button', { name: choice === 'deny' ? 'Deny' : 'Approve' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledExactlyOnceWith(postPath, {
    decision: choice === 'deny' ? 'deny' : 'approve', organization_id: null, csrf_nonce: 'nonce',
    tool_set: choice === 'buyer' ? 'buyer' : 'seller', ...(choice === 'seller' ? { seller_permissions_version: 1 } : {}),
  }));
});

it('freezes persona and account selection plus decision buttons while a decision is pending', async () => {
  let resolve!: (value: unknown) => void;
  vi.mocked(api.post).mockReturnValue(new Promise(done => { resolve = done; }));
  render(<ConnectorConsentPage />);
  fireEvent.click(await screen.findByRole('radio', { name: 'Seller' }));
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
  expect(screen.getByRole('group').hasAttribute('disabled')).toBe(true);
  for (const control of [...screen.getAllByRole('radio'), screen.getByRole('combobox'), ...screen.getAllByRole('button')]) {
    expect(control.matches(':disabled')).toBe(true);
  }
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
  expect(api.post).toHaveBeenCalledOnce();
  await act(async () => resolve({ data: { continue_url: `https://auth.ai.market/oauth/authorize/complete?request=${consentId}` } }));
});

it.each(['seller_permissions_stale', 'seller_consent_unavailable'])('reloads after 403 %s and waits for another explicit approval using fresh metadata', async code => {
  vi.mocked(api.post).mockRejectedValueOnce({ response: { status: 403, data: { code } } });
  render(<ConnectorConsentPage />);
  fireEvent.click(await screen.findByRole('radio', { name: 'Seller' }));
  let resolve!: (value: unknown) => void;
  vi.mocked(api.get).mockImplementation(async url => url === '/connector-oauth/status' ? { data: { enabled: true } } : new Promise(done => { resolve = done; }));
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
  await waitFor(() => expect(resolve).toBeTypeOf('function'));
  expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  expect(api.post).toHaveBeenCalledOnce();
  expect(assign).not.toHaveBeenCalled();
  expect(readConnectorContinuation()?.request).toBe(consentId);
  const fresh = { ...consentMetadata(), csrf_nonce: 'fresh-nonce', tool_set_scopes: {
    buyer: buyerPermissions, seller: sellerPermissions.map(item => ({ ...item, description: `Updated: ${item.description}` })),
  } };
  await act(async () => resolve({ data: fresh }));
  expect((screen.getByRole('radio', { name: 'Buyer' }) as HTMLInputElement).checked).toBe(true);
  expect(screen.getByRole('status').textContent).toContain('Review them and approve again');
  expect(api.post).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('radio', { name: 'Seller' }));
  sellerPermissions.forEach(item => expect(screen.getByText(`Updated: ${item.description}`)).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
  expect(api.post).toHaveBeenLastCalledWith(postPath, {
    decision: 'approve', organization_id: null, csrf_nonce: 'fresh-nonce', tool_set: 'seller', seller_permissions_version: 1,
  });
});

it('withholds Seller if it disappears on the stale metadata reload', async () => {
  vi.mocked(api.post).mockImplementationOnce(async () => {
    metadata = { ...consentMetadata(), tool_sets: ['buyer'], tool_set_scopes: { buyer: buyerPermissions }, seller_permissions_version: undefined };
    throw { response: { status: 403, data: { code: 'seller_permissions_stale' } } };
  });
  render(<ConnectorConsentPage />);
  fireEvent.click(await screen.findByRole('radio', { name: 'Seller' }));
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
  await screen.findByText(/Review them and approve again/);
  expect(screen.queryByRole('radio', { name: 'Seller' })).toBeNull();
  expect(api.post).toHaveBeenCalledOnce();
});

it.each([410, 503])('keeps approval unavailable when stale metadata reload fails with %s', async status => {
  vi.mocked(api.post).mockImplementationOnce(async () => {
    vi.mocked(api.get).mockImplementation(async url => {
      if (url === '/connector-oauth/status') return { data: { enabled: true } };
      throw { response: { status } };
    });
    throw { response: { status: 403, data: { code: 'seller_permissions_stale' } } };
  });
  render(<ConnectorConsentPage />);
  fireEvent.click(await screen.findByRole('radio', { name: 'Seller' }));
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
  expect((await screen.findByRole('alert')).textContent).toBe(status === 410
    ? 'This connection request expired. Go back to the app and connect again.' : 'Unable to complete this connection request.');
  expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  expect(screen.queryByRole('radio', { name: 'Seller' })).toBeNull();
  expect(api.post).toHaveBeenCalledOnce();
  expect(assign).not.toHaveBeenCalled();
  if (status === 410) expect(readConnectorContinuation()).toBeNull();
});

it.each(['seller_consent_required', 'request_expired'])('keeps existing refusal handling for %s', async code => {
  vi.mocked(api.post).mockRejectedValue({ response: { status: code === 'request_expired' ? 410 : 403, data: { code } } });
  render(<ConnectorConsentPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
  expect((await screen.findByRole('alert')).textContent).toBe(code === 'request_expired'
    ? 'This connection request expired. Go back to the app and connect again.' : 'Unable to complete this connection request.');
  expect(api.get).toHaveBeenCalledTimes(2);
  expect(api.post).toHaveBeenCalledOnce();
});

it('requires explicit Seller selection and approval again after reauthentication', async () => {
  vi.mocked(api.post).mockRejectedValueOnce({ response: { status: 403, data: { code: 'recent_login_required' } } });
  const first = render(<ConnectorConsentPage />);
  fireEvent.click(await screen.findByRole('radio', { name: 'Seller' }));
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Sign in to continue' }));
  expect(navigation.push).toHaveBeenCalledWith(`/login?reauth=connector&redirect=${encodeURIComponent(path)}`);
  first.unmount();
  render(<ConnectorConsentPage />);
  expect((await screen.findByRole('radio', { name: 'Buyer' }) as HTMLInputElement).checked).toBe(true);
  expect(api.post).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('radio', { name: 'Seller' }));
  sellerPermissions.forEach(item => expect(screen.getByText(item.description)).toBeTruthy());
  expect(api.post).toHaveBeenCalledOnce();
});
