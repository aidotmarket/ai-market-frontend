// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ConnectorConsentPage from './page';
import { useAuthStore } from '@/store/auth';
import { decideConnectorRequest, getConnectorRequest, getConnectorStatus } from '@/api/connector-oauth';
import { setConnectorStatus } from '@/lib/aim-data-continuation';

const navigation = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
vi.mock('@/api/connector-oauth', () => ({ getConnectorStatus: vi.fn(), getConnectorRequest: vi.fn(), decideConnectorRequest: vi.fn() }));
const id = 'a'.repeat(43);
const path = `/oauth/connect?request=${id}`;
const metadata = { request: id, client: { client_id: 'client', name: '<b>Claude</b>', host: 'claude.ai', verified: true },
  accounts: [{ organization_id: null, label: 'Personal', kind: 'personal' as const }],
  scopes: [{ scope: 'search', description: '<script>Search the marketplace</script>' }],
  expires_at: new Date(Date.now() + 600_000).toISOString(), csrf_nonce: 'nonce' };
const assign = vi.fn();

beforeEach(() => {
  vi.resetAllMocks(); sessionStorage.clear();
  setConnectorStatus(true);
  vi.stubGlobal('window', { document, location: { pathname: '/oauth/connect', search: `?request=${id}`, hash: '', assign } });
  vi.mocked(getConnectorStatus).mockResolvedValue(true);
  vi.mocked(getConnectorRequest).mockResolvedValue(metadata);
  vi.mocked(decideConnectorRequest).mockResolvedValue(`https://auth.ai.market/oauth/authorize/complete?request=${id}`);
  useAuthStore.setState({ hydrated: true, isLoading: false, isAuthenticated: true, user: { id: 'user', email: 'user@example.com' } as never });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('redirects a signed-out browser to login with the validated path', async () => {
  useAuthStore.setState({ isAuthenticated: false, user: null });
  render(<ConnectorConsentPage />);
  await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith(`/login?redirect=${encodeURIComponent(path)}`));
  expect(getConnectorRequest).not.toHaveBeenCalled();
});

it('renders name, host, verified badge and API scope as text', async () => {
  render(<ConnectorConsentPage />);
  expect(await screen.findByText('claude.ai')).toBeTruthy();
  expect(screen.getByText('Verified')).toBeTruthy();
  expect(screen.getByText('<b>Claude</b>', { exact: false })).toBeTruthy();
  expect(screen.getByText(metadata.scopes[0].description)).toBeTruthy();
  expect(document.querySelector('script, b')).toBeNull();
});

it.each(['approve', 'deny'] as const)('%s sends the nonce and navigates to the guarded URL', async (decision) => {
  render(<ConnectorConsentPage />);
  fireEvent.click(await screen.findByRole('button', { name: decision === 'approve' ? 'Approve' : 'Deny' }));
  await waitFor(() => expect(decideConnectorRequest).toHaveBeenCalledWith(id, decision, null, 'nonce'));
  expect(assign).toHaveBeenCalledWith(`https://auth.ai.market/oauth/authorize/complete?request=${id}`);
});

it.each(['', 'org-1'])('renders a styled native account dropdown and preserves selection %s', async (value) => {
  vi.mocked(getConnectorRequest).mockResolvedValue({ ...metadata, accounts: [
    { organization_id: 'org-1', label: 'Team account', kind: 'organization' },
    ...metadata.accounts,
  ] });
  render(<ConnectorConsentPage />);
  const select = await screen.findByRole('combobox', { name: 'Connect account' }) as HTMLSelectElement;
  expect(select.classList.contains('border-gray-300')).toBe(true);
  expect(select.classList.contains('pr-10')).toBe(true);
  expect(select.classList.contains('focus:ring-2')).toBe(true);
  const caret = select.parentElement?.querySelector('svg');
  expect(caret?.getAttribute('aria-hidden')).toBe('true');
  expect(caret?.classList.contains('pointer-events-none')).toBe(true);
  expect(Array.from(select.options, (option) => [option.text, option.value])).toEqual([
    ['Personal', ''], ['Team account', 'org-1'],
  ]);
  expect(select.value).toBe('org-1');
  fireEvent.change(select, { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
  await waitFor(() => expect(decideConnectorRequest).toHaveBeenCalledWith(id, 'approve', value || null, 'nonce'));
});

it('rejects an unsafe continue URL', async () => {
  vi.mocked(decideConnectorRequest).mockRejectedValue(new Error('invalid_redirect'));
  render(<ConnectorConsentPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
  expect((await screen.findByRole('alert')).textContent).toBe('Unable to complete this connection request.');
  expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  expect(assign).not.toHaveBeenCalled();
});

it('shows the fixed early-access message when the GET request is refused', async () => {
  vi.mocked(getConnectorRequest).mockRejectedValue({ response: { status: 403, data: { code: 'EARLY_ACCESS_ONLY', message: 'Untrusted server message' } } });
  render(<ConnectorConsentPage />);
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toBe('Connector access is limited during early access. See ai.market/docs/claude.');
  expect(screen.getByRole('link', { name: 'ai.market/docs/claude' }).getAttribute('href')).toBe('/docs/claude');
  expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Deny' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Sign in again' })).toBeNull();
});

it('shows the fixed early-access message when the decision POST is refused', async () => {
  vi.mocked(decideConnectorRequest).mockRejectedValue({ response: { status: 403, data: { code: 'EARLY_ACCESS_ONLY', message: 'Untrusted server message' } } });
  render(<ConnectorConsentPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toBe('Connector access is limited during early access. See ai.market/docs/claude.');
  expect(screen.getByRole('link', { name: 'ai.market/docs/claude' }).getAttribute('href')).toBe('/docs/claude');
  expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Deny' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Sign in again' })).toBeNull();
  expect(assign).not.toHaveBeenCalled();
});

it('shows an expired state for 410', async () => {
  vi.mocked(getConnectorRequest).mockRejectedValue({ response: { status: 410, data: { code: 'request_expired' } } });
  render(<ConnectorConsentPage />);
  expect(await screen.findByText('This connection request expired. Go back to the app and connect again.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
});

it('offers sign-in and 2FA for insufficient assurance', async () => {
  vi.mocked(getConnectorRequest).mockRejectedValue({ response: { status: 403, data: { code: 'insufficient_assurance' } } });
  render(<ConnectorConsentPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Sign in again' }));
  expect(navigation.push).toHaveBeenCalledWith(`/login?reauth=connector&redirect=${encodeURIComponent(path)}`);
});
