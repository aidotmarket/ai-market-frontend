// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { InternalAxiosRequestConfig } from 'axios';
import type { User } from '@/types';

const net = vi.hoisted(() => ({ adapter: vi.fn() }));
const shared = vi.hoisted(() => ({ refreshAccessToken: vi.fn(), getMe: vi.fn(), login: vi.fn(), verify2FALogin: vi.fn() }));
const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), query: new URLSearchParams(), pathname: '/dashboard/settings/wallet' }));
const capabilities = vi.hoisted(() => ({ getCapabilities: vi.fn() }));
vi.mock('axios', async original => {
  const actual = await original<typeof import('axios')>();
  return { ...actual, default: { ...actual.default, create: (config: object) => actual.default.create({ ...config, adapter: net.adapter }) } };
});
vi.mock('@/api/client', () => ({ refreshAccessToken: shared.refreshAccessToken, api: {} }));
vi.mock('@/api/auth', () => ({ ...shared, isTwoFactorChallenge: (value: { requires_2fa?: boolean }) => value.requires_2fa === true }));
vi.mock('next/navigation', () => ({ useRouter: () => nav, usePathname: () => nav.pathname, useSearchParams: () => nav.query }));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/api/connector-oauth', () => ({ getConnectorStatus: vi.fn().mockResolvedValue(false) }));
vi.mock('@/api/capabilities', () => capabilities);
vi.mock('@/api/sellerWorkspace', () => ({ getSellerWorkspaceCapabilities: vi.fn(), isAWSConnectionAvailable: () => false }));
vi.mock('@/api/sellerGateways', () => ({ listSellerGateways: vi.fn().mockResolvedValue([]) }));
vi.mock('@/components/onboarding/SellerSetupProgressBar', () => ({ default: () => null }));

import WalletPage from './page';
import DashboardLayout from '@/app/dashboard/layout';
import LoginForm from '@/app/login/LoginForm';
import { useAuthStore } from '@/store/auth';
import { createWalletTopup, getWalletBalance, getWalletHistory, parseWalletAmount, resolveWalletOwner } from '@/api/wallet';

const user: User = {
  id: 'owner-a', email: 'buyer@example.test', role: 'buyer', status: 'active', first_name: 'Buyer',
  last_name: null, company_name: null, created_at: '2026-01-01T00:00:00Z', email_verified_at: null,
  totp_enabled: false, auth_methods: ['password'], primary_auth: 'password',
};
const row = { id: 'tx-1', wallet_id: 'wallet-a', transaction_type: 'top_up', amount_cents: 501,
  balance_after_cents: 1201, description: '<b>Actual credit</b>', reference_id: 'unrelated-session', created_at: '2026-10-20T12:00:00Z' };
const history = { transactions: [row], total: 21, has_more: true };
const checkout = { session_id: 'cs_actual', amount_cents: 501, checkout_url: 'https://checkout.stripe.com/c/pay/cs_actual' };
const response = (config: InternalAxiosRequestConfig, data: unknown) => ({ config, data, status: 200, statusText: 'OK', headers: {} });
const failure = (status: number) => ({ response: { status } });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function defaultData(config: InternalAxiosRequestConfig): unknown {
  if (config.url === '/auth/me') return { id: config.headers.get('Authorization') === 'Bearer token-b' ? 'owner-b' : 'owner-a', status: 'active' };
  if (config.url === '/wallet/balance') return { user_id: config.headers.get('Authorization') === 'Bearer token-b' ? 'owner-b' : 'owner-a', balance_cents: 1201, currency: 'USD' };
  if (config.url === '/wallet/transactions') return history;
  return checkout;
}
const calls = (url: string) => net.adapter.mock.calls.map(([c]) => c as InternalAxiosRequestConfig).filter(c => c.url === url);
const walletCalls = () => net.adapter.mock.calls.filter(([c]) => (c as InternalAxiosRequestConfig).url?.startsWith('/wallet/'));
const postCalls = () => calls('/wallet/topup');
const ready = () => screen.findByRole('button', { name: 'Continue to checkout' });
const amount = (text = '5.01') => fireEvent.change(screen.getByLabelText('Amount (USD)'), { target: { value: text } });
const submit = () => fireEvent.submit(screen.getByRole('form', { name: 'Fund wallet' }));
const refresh = () => fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
const settle = async () => { await act(async () => { await Promise.resolve(); }); };
const realRefresh = useAuthStore.getState().refreshAuth;

beforeEach(() => {
  vi.clearAllMocks();
  net.adapter.mockReset();
  net.adapter.mockImplementation(async config => response(config, defaultData(config)));
  capabilities.getCapabilities.mockResolvedValue({ seller: { effective_status: 'inactive' } });
  shared.getMe.mockResolvedValue(user);
  shared.refreshAccessToken.mockImplementation(async () => { useAuthStore.setState({ token: 'token-rotated' }); return 'token-rotated'; });
  useAuthStore.setState({ user, token: 'token-a', hydrated: true, isLoading: false, isAuthenticated: true, pendingTwoFactor: null, refreshAuth: realRefresh });
  nav.query = new URLSearchParams(); nav.pathname = '/dashboard/settings/wallet';
  window.history.replaceState(null, '', nav.pathname);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it.each(['buyer', 'seller'] as const)('admits a %s through the actual dashboard before and after seller capability resolution', async role => {
  const cap = deferred<{ seller: { effective_status: string } }>();
  capabilities.getCapabilities.mockReturnValue(cap.promise);
  useAuthStore.setState({ user: { ...user, role } });
  render(<DashboardLayout><WalletPage /></DashboardLayout>);
  await ready();
  expect(screen.getByRole('link', { name: 'Settings' }).getAttribute('href')).toBe('/dashboard/settings');
  await act(async () => cap.resolve({ seller: { effective_status: 'inactive' } }));
  expect(screen.getByLabelText('Amount (USD)')).toBeTruthy();
  expect(nav.push).not.toHaveBeenCalled();
  expect(walletCalls()).toHaveLength(2);
});

it('retains restriction of an unrelated seller route', async () => {
  nav.pathname = '/dashboard/listings';
  render(<DashboardLayout><WalletPage /></DashboardLayout>);
  await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/dashboard/inquiries'));
  expect(walletCalls()).toHaveLength(0);
});

it.each([false, true])('resumes the wallet child through existing Login (two factor = %s)', async twoFactor => {
  const destination = '/dashboard/settings/wallet?topup=return';
  nav.query = new URLSearchParams({ redirect: destination });
  useAuthStore.setState({ user: null, token: null, hydrated: true, isAuthenticated: false });
  shared.login.mockResolvedValue(twoFactor ? { requires_2fa: true, pre_auth_token: 'pre-auth', expires_in: 600 } : { access_token: 'token-a' });
  shared.verify2FALogin.mockResolvedValue({ access_token: 'token-a' });
  const login = render(<LoginForm />);
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'buyer@example.test' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-only' } });
  fireEvent.submit(screen.getByLabelText('Password').closest('form')!);
  if (twoFactor) {
    fireEvent.change(await screen.findByLabelText('Verification code'), { target: { value: '123456' } });
    expect(walletCalls()).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Verify and continue' }));
  }
  await waitFor(() => expect(nav.push).toHaveBeenCalledWith(destination));
  login.unmount();
  render(<DashboardLayout><WalletPage /></DashboardLayout>);
  await ready();
  expect(calls('/auth/me')).toHaveLength(1);
});

it('uses existing signed-out dashboard continuation including the return query', async () => {
  window.history.replaceState(null, '', '/dashboard/settings/wallet?topup=cancelled');
  useAuthStore.setState({ isAuthenticated: false, user: null, token: null });
  render(<DashboardLayout><WalletPage /></DashboardLayout>);
  await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/login?redirect=%2Fdashboard%2Fsettings%2Fwallet%3Ftopup%3Dcancelled'));
  expect(net.adapter).not.toHaveBeenCalled();
});

it('waits for hydration, token, user and exact active captured resolution', async () => {
  useAuthStore.setState({ hydrated: false, user: null });
  render(<WalletPage />);
  expect(net.adapter).not.toHaveBeenCalled();
  act(() => useAuthStore.setState({ hydrated: true, isLoading: true }));
  act(() => useAuthStore.setState({ isLoading: false }));
  expect(net.adapter).not.toHaveBeenCalled();
  const owner = deferred<unknown>();
  net.adapter.mockImplementation(async config => response(config, config.url === '/auth/me' ? await owner.promise : defaultData(config)));
  act(() => useAuthStore.setState({ user }));
  expect(walletCalls()).toHaveLength(0);
  await act(async () => owner.resolve({ id: user.id, status: 'active' }));
  await ready();
  expect(walletCalls()).toHaveLength(2);
});

it.each([{ hydrated: false }, { isLoading: true }, { isAuthenticated: false }, { token: null }, { user: null }])('makes no request during admission gap %j', state => {
  useAuthStore.setState(state);
  render(<WalletPage />);
  expect(net.adapter).not.toHaveBeenCalled();
  expect(screen.queryByRole('form', { name: 'Fund wallet' })).toBeNull();
});

it.each([null, {}, { id: 'owner-a', status: 'suspended' }, { id: 'owner-b', status: 'active' }, failure(401)])('blocks invalid/mismatched/expired owner %j without wallet calls', async data => {
  net.adapter.mockImplementation(async config => {
    if (data && 'response' in data) throw data;
    return response(config, data);
  });
  render(<WalletPage />);
  await screen.findByText(/Wallet blocked/);
  expect(walletCalls()).toHaveLength(0);
  expect(shared.refreshAccessToken).not.toHaveBeenCalled();
  expect(screen.queryByText(/signed out/i)).toBeNull();
});

it.each([['5', 500], ['5.01', 501], [' 0005.1 ', 510], ['1000000.00', 100000000]] as const)('submits exact decimal %s as %i cents', async (text, expected) => {
  // Keep the POST pending so jsdom need not navigate.
  net.adapter.mockImplementation(config => config.method === 'post' ? new Promise(() => {}) : Promise.resolve(response(config, defaultData(config))));
  render(<WalletPage />); await ready(); amount(text); submit();
  await waitFor(() => expect(postCalls()).toHaveLength(1));
  expect(JSON.parse(postCalls()[0].data)).toEqual({ amount_cents: expected,
    success_url: `${window.location.origin}/dashboard/settings/wallet?topup=return`,
    cancel_url: `${window.location.origin}/dashboard/settings/wallet?topup=cancelled` });
});
it.each(['', '+5', '-5', '5e2', '5,00', '$5', 'NaN', 'Infinity', '.', '5.', '5.001', '0', '4.99', '1000000.01', '9'.repeat(400), '５', '5\n.00'])('rejects %s without dispatch', async text => {
  render(<WalletPage />); await ready(); amount(text); submit();
  expect(screen.getByText(/Enter a USD amount/)).toBeTruthy();
  expect(postCalls()).toHaveLength(0);
});

it('guards duplicate click, Enter/form events and refresh synchronously before await', async () => {
  net.adapter.mockImplementation(config => config.method === 'post' ? new Promise(() => {}) : Promise.resolve(response(config, defaultData(config))));
  render(<WalletPage />); await ready(); amount();
  act(() => { submit(); submit(); fireEvent.click(screen.getByRole('button', { name: 'Continue to checkout' })); });
  refresh(); await settle();
  expect(postCalls()).toHaveLength(1);
  expect((screen.getByLabelText('Amount (USD)') as HTMLInputElement).disabled).toBe(true);
});

it.each(['timeout', 500, 503, 'abort', 'malformed'])('keeps ambiguous %s blocked through history refresh and explicit auth recovery', async outcome => {
  net.adapter.mockImplementation(async config => {
    if (config.method === 'post') {
      if (outcome === 'malformed') return response(config, { ...checkout, session_id: '' });
      throw typeof outcome === 'number' ? failure(outcome) : new Error(outcome);
    }
    return response(config, defaultData(config));
  });
  render(<WalletPage />); await ready(); amount(); submit();
  await screen.findByText(/couldn't confirm whether checkout/);
  refresh();
  act(() => useAuthStore.setState({ token: 'token-b' }));
  await screen.findByText(/Wallet blocked/);
  fireEvent.click(screen.getByRole('button', { name: 'Recover sign-in' }));
  await ready();
  amount(); submit();
  expect(postCalls()).toHaveLength(1);
  expect(shared.refreshAccessToken).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/couldn't confirm whether checkout/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: /retry|pay again/i })).toBeNull();
});

it.each([400, 401, 403, 422])('allows a new deliberate action after definitive %i rejection and correction/recovery, never replays', async status => {
  let reject = true;
  net.adapter.mockImplementation(async config => {
    if (config.method === 'post') { if (reject) throw failure(status); return new Promise(() => {}); }
    return response(config, defaultData(config));
  });
  render(<WalletPage />); await ready(); amount(); submit(); await settle();
  expect(postCalls()).toHaveLength(1);
  if ([401, 403].includes(status)) {
    fireEvent.click(screen.getByRole('button', { name: 'Recover sign-in' })); await ready();
  }
  reject = false;
  amount('6'); submit();
  await waitFor(() => expect(postCalls()).toHaveLength(2));
  expect(JSON.parse(postCalls()[1].data).amount_cents).toBe(600);
});

it.each(['logout', 'owner', 'rotation', 'gap', 'A-B-A', 'A-logout-A'])('revokes pending POST on %s before React effects and never rearms after recovery', async transition => {
  const post = deferred<unknown>();
  const nextOwner = deferred<unknown>();
  net.adapter.mockImplementation(async config => response(config,
    config.method === 'post' ? await post.promise : config.url === '/auth/me' && calls('/auth/me').length > 1 ? await nextOwner.promise : defaultData(config)));
  const assign = vi.fn();
  const originalWindow = window;
  render(<WalletPage />); await ready(); await screen.findByText('USD 12.01'); amount(); submit();
  await waitFor(() => expect(postCalls()).toHaveLength(1));
  vi.stubGlobal('window', { ...originalWindow, location: { ...originalWindow.location, origin: originalWindow.location.origin, assign } });
  act(() => {
    if (transition === 'logout' || transition === 'A-logout-A') useAuthStore.setState({ token: null, isAuthenticated: false });
    else if (transition === 'owner') useAuthStore.setState({ user: { ...user, id: 'owner-b' }, token: 'token-b' });
    else if (transition === 'gap') useAuthStore.setState({ isLoading: true });
    else useAuthStore.setState({ token: transition === 'rotation' ? 'token-rotated' : 'token-b' });
    // Queue completion in the same call stack as store mutation, before effects.
    post.resolve(checkout);
    if (transition === 'A-B-A' || transition === 'A-logout-A') useAuthStore.setState({ token: 'token-a', user, isAuthenticated: true });
  });
  await settle();
  expect(assign).not.toHaveBeenCalled();
  expect(screen.queryByText('USD 12.01')).toBeNull();
  expect(screen.getByText(/couldn't confirm whether checkout/)).toBeTruthy();
  act(() => useAuthStore.setState({ token: 'token-a', user, isLoading: false, isAuthenticated: true }));
  await act(async () => nextOwner.resolve({ id: 'owner-a', status: 'active' }));
  await ready(); submit();
  expect(postCalls()).toHaveLength(1);
  vi.unstubAllGlobals();
});

it('does not rearm a pending POST when recovery starts before its outcome', async () => {
  const post = deferred<unknown>();
  net.adapter.mockImplementation(async config => response(config, config.method === 'post' ? await post.promise : defaultData(config)));
  render(<WalletPage />); await ready(); amount(); submit();
  await waitFor(() => expect(postCalls()).toHaveLength(1));
  act(() => useAuthStore.setState({ token: 'token-b' }));
  await screen.findByText(/Wallet blocked/);
  fireEvent.click(screen.getByRole('button', { name: 'Recover sign-in' })); await ready();
  await act(async () => post.resolve(checkout));
  amount(); submit();
  expect(postCalls()).toHaveLength(1);
  expect(screen.getByText(/couldn't confirm whether checkout/)).toBeTruthy();
});

it('rejects delayed resolver A after A -> B -> A and ignores shared stale getMe', async () => {
  const old = deferred<unknown>();
  const newest = deferred<unknown>();
  net.adapter.mockImplementation(async config => response(config, config.url === '/auth/me'
    ? await (calls('/auth/me').length === 1 ? old.promise : newest.promise) : defaultData(config)));
  render(<WalletPage />);
  act(() => { useAuthStore.setState({ token: 'token-b' }); useAuthStore.setState({ token: 'token-a' }); });
  await act(async () => old.resolve({ id: 'owner-a', status: 'active' }));
  expect(walletCalls()).toHaveLength(0);
  act(() => useAuthStore.setState({ user: { ...user } })); // stale shared response cannot verify the new association
  expect(walletCalls()).toHaveLength(0);
  await act(async () => newest.resolve({ id: 'owner-a', status: 'active' })); await ready();
  expect(walletCalls()).toHaveLength(2);
});

it.each(['mismatch', 'failure', 'delayed'])('retained A/token B (%s) accepts no wallet work until the exact captured B resolves coherent owner', async mode => {
  render(<WalletPage />); await ready(); await screen.findByText('USD 12.01');
  const owner = deferred<unknown>();
  net.adapter.mockImplementation(async config => {
    if (config.url === '/auth/me') {
      if (mode === 'failure') throw failure(401);
      return response(config, mode === 'delayed' ? await owner.promise : { id: 'owner-b', status: 'active' });
    }
    return response(config, defaultData(config));
  });
  const before = walletCalls().length;
  act(() => useAuthStore.setState({ token: 'token-b' }));
  act(() => useAuthStore.setState({ user: { ...user } }));
  expect(screen.queryByText('USD 12.01')).toBeNull();
  expect(walletCalls()).toHaveLength(before);
  if (mode === 'delayed') await act(async () => owner.resolve({ id: 'owner-b', status: 'active' }));
  await screen.findByText(/Wallet blocked/);
  expect(walletCalls()).toHaveLength(before);
  act(() => useAuthStore.setState({ user: { ...user, id: 'owner-b' } }));
  if (mode !== 'failure') { await ready(); expect(walletCalls()).toHaveLength(before + 2); }
});

it('surfaces GET 401 without replay, rejects old errors/rows after external refresh and freshly resolves rotated owner', async () => {
  const oldHistory = deferred<unknown>();
  net.adapter.mockImplementation(async config => response(config, config.url === '/wallet/transactions' ? await oldHistory.promise : defaultData(config)));
  render(<WalletPage />); await ready();
  await waitFor(() => expect(calls('/wallet/transactions')).toHaveLength(1));
  act(() => { useAuthStore.setState({ token: 'token-b' }); oldHistory.reject(failure(401)); });
  await screen.findByText(/Wallet blocked/);
  expect(calls('/wallet/transactions')).toHaveLength(1);
  expect(shared.refreshAccessToken).not.toHaveBeenCalled();
  expect(screen.queryByText(/Transaction history could not/)).toBeNull();
  expect(calls('/auth/me').map(c => c.headers.get('Authorization'))).toEqual(['Bearer token-a', 'Bearer token-b']);
  expect(calls('/wallet/balance')[0].headers.get('Authorization')).toBe('Bearer token-a');
  expect(calls('/wallet/transactions')[0].headers.get('Authorization')).toBe('Bearer token-a');
});

it('blocks on a current wallet GET 401 then manually refreshes expired credentials once and never replays the failed call', async () => {
  net.adapter.mockImplementation(async config => {
    if (config.url === '/wallet/transactions' && config.headers.get('Authorization') === 'Bearer token-a') throw failure(401);
    return response(config, defaultData(config));
  });
  render(<WalletPage />); await screen.findByText(/Wallet blocked/);
  expect(shared.refreshAccessToken).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Recover sign-in' })); await ready();
  await screen.findByText('<b>Actual credit</b>');
  expect(shared.refreshAccessToken).toHaveBeenCalledTimes(1);
  expect(calls('/wallet/transactions').map(c => c.headers.get('Authorization'))).toEqual(['Bearer token-a', 'Bearer token-rotated']);
  expect(calls('/auth/me').map(c => c.headers.get('Authorization'))).toEqual(['Bearer token-a', 'Bearer token-rotated']);
  expect(postCalls()).toHaveLength(0);
});

it('recovers an expired resolver with one explicit refreshAuth invocation, and resolves the replacement before any wallet GET', async () => {
  const refreshed = deferred<string>();
  const owner = deferred<unknown>();
  shared.refreshAccessToken.mockImplementation(async () => {
    const token = await refreshed.promise;
    useAuthStore.setState({ token });
    return token;
  });
  net.adapter.mockImplementation(async config => {
    if (config.url === '/auth/me') {
      if (config.headers.get('Authorization') === 'Bearer token-a') throw failure(401);
      return response(config, await owner.promise);
    }
    return response(config, defaultData(config));
  });
  render(<WalletPage />); await screen.findByText(/Wallet blocked/);
  expect(walletCalls()).toHaveLength(0);
  expect(shared.refreshAccessToken).not.toHaveBeenCalled();
  act(() => { fireEvent.click(screen.getByRole('button', { name: 'Recover sign-in' })); fireEvent.click(screen.getByRole('button', { name: 'Recover sign-in' })); });
  await act(async () => refreshed.resolve('token-rotated'));
  expect(shared.refreshAccessToken).toHaveBeenCalledTimes(1);
  expect(walletCalls()).toHaveLength(0);
  await act(async () => owner.resolve({ id: user.id, status: 'active' })); await ready();
  expect(walletCalls()).toHaveLength(2);
  expect(calls('/auth/me').map(c => c.headers.get('Authorization'))).toEqual(['Bearer token-a', 'Bearer token-rotated']);
});

it.each(['delayed', 'failed', 'stale'] as const)('blocks token-before-user from actual completeSession with %s shared getMe', async outcome => {
  const sharedOwner = deferred<User>();
  shared.getMe.mockReturnValue(sharedOwner.promise);
  render(<WalletPage />); await ready(); await screen.findByText('USD 12.01');
  const before = walletCalls().length;
  let session!: Promise<void>;
  act(() => { session = useAuthStore.getState().completeSession({ access_token: 'token-b', token_type: 'bearer' }).catch(() => {}); });
  await screen.findByText(/Wallet blocked/);
  expect(walletCalls()).toHaveLength(before);
  expect(screen.queryByText('USD 12.01')).toBeNull();
  if (outcome === 'failed') await act(async () => { sharedOwner.reject(new Error('shared getMe failed')); await session; });
  else if (outcome === 'stale') await act(async () => { sharedOwner.resolve({ ...user }); await session; });
  expect(walletCalls()).toHaveLength(before);
  if (outcome === 'delayed') await act(async () => { sharedOwner.resolve({ ...user, id: 'owner-b' }); await session; });
  else act(() => useAuthStore.setState({ user: { ...user, id: 'owner-b' } }));
  await ready();
  expect(walletCalls()).toHaveLength(before + 2);
});

it('keeps a pending POST uncertain through current GET-401 and external token replacement', async () => {
  const post = deferred<unknown>();
  const read = deferred<unknown>();
  render(<WalletPage />); await ready(); await screen.findByText('<b>Actual credit</b>');
  net.adapter.mockImplementation(async config => {
    if (config.method === 'post') return response(config, await post.promise);
    if (config.url === '/wallet/transactions') return response(config, await read.promise);
    return response(config, defaultData(config));
  });
  amount(); submit(); refresh();
  await act(async () => read.reject(failure(401)));
  await screen.findByText(/Wallet blocked/);
  act(() => useAuthStore.setState({ token: 'token-b' }));
  await act(async () => post.resolve(checkout));
  expect(screen.getByText(/couldn't confirm whether checkout/)).toBeTruthy();
  expect(screen.queryByText('Continuing to checkout…')).toBeNull();
  expect(postCalls()).toHaveLength(1);
  expect(shared.refreshAccessToken).not.toHaveBeenCalled();
});

it('remounts blank until fresh owner resolution; delayed reads cannot populate the new mount', async () => {
  const old = deferred<unknown>();
  net.adapter.mockImplementation(async config => response(config, config.url === '/wallet/balance' ? await old.promise : defaultData(config)));
  const mount = render(<WalletPage />); await ready(); mount.unmount();
  const owner = deferred<unknown>();
  net.adapter.mockImplementation(async config => response(config, config.url === '/auth/me' ? await owner.promise : defaultData(config)));
  render(<WalletPage />);
  await act(async () => old.resolve({ user_id: 'owner-a', currency: 'USD', balance_cents: 99999 }));
  expect(screen.queryByText('USD 999.99')).toBeNull();
  expect(screen.queryByRole('table')).toBeNull();
  await act(async () => owner.resolve({ id: 'owner-a', status: 'active' })); await ready();
  expect(screen.queryByText('USD 999.99')).toBeNull();
});

it('rejects old successful GET and POST even when cancellation cannot stop the transport', async () => {
  const NativeAbortController = AbortController;
  // Model an already accepted server request: cancellation is best effort only.
  vi.stubGlobal('AbortController', class extends NativeAbortController { abort() {} });
  const oldRead = deferred<unknown>();
  const oldPost = deferred<unknown>();
  const owner = deferred<unknown>();
  net.adapter.mockImplementation(async config => response(config,
    config.method === 'post' ? await oldPost.promise
      : config.url === '/wallet/balance' ? await oldRead.promise
        : config.url === '/auth/me' && calls('/auth/me').length > 1 ? await owner.promise : defaultData(config)));
  render(<WalletPage />); await ready(); amount(); submit();
  await waitFor(() => expect(postCalls()).toHaveLength(1));
  act(() => {
    useAuthStore.setState({ token: 'token-rotated' });
    oldRead.resolve({ user_id: 'owner-a', currency: 'USD', balance_cents: 99999 });
    oldPost.resolve(checkout);
  });
  await settle();
  expect(screen.queryByText('USD 999.99')).toBeNull();
  expect(screen.queryByText('Continuing to checkout…')).toBeNull();
  expect(screen.getByText(/couldn't confirm whether checkout/)).toBeTruthy();
  await act(async () => owner.resolve({ id: 'owner-a', status: 'active' })); await ready();
  submit(); expect(postCalls()).toHaveLength(1);
});

it('loads balance and history independently without substituting zero while balance waits', async () => {
  const balance = deferred<unknown>();
  net.adapter.mockImplementation(async config => response(config, config.url === '/wallet/balance' ? await balance.promise : defaultData(config)));
  render(<WalletPage />); await ready(); await screen.findByText('<b>Actual credit</b>');
  expect(screen.getByText('Loading balance…')).toBeTruthy();
  expect(screen.queryByText('USD 0.00')).toBeNull();
  await act(async () => balance.resolve({ user_id: 'owner-a', currency: 'USD', balance_cents: 0 }));
  expect(await screen.findByText('USD 0.00')).toBeTruthy();
  expect(screen.queryByText('Loading balance…')).toBeNull();
});

it.each(['return', 'cancelled', 'success'])('treats forged %s and foreign session/destination/amount hints as generic information only', async hint => {
  window.history.replaceState(null, '', `/dashboard/settings/wallet?topup=${hint}&session_id=foreign&amount=999&checkout_url=https://evil.test&success_url=https://evil.test`);
  render(<WalletPage />); await ready(); await screen.findByText('<b>Actual credit</b>'); refresh(); await settle();
  expect(postCalls()).toHaveLength(0);
  expect(net.adapter.mock.calls.every(([c]) => ['/auth/me', '/wallet/balance', '/wallet/transactions'].includes(c.url))).toBe(true);
  expect(screen.queryByText(/payment succeeded|payment failed|wallet credited/i)).toBeNull();
  if (hint === 'return') expect(screen.getByText('Returned from checkout. Check your wallet history for updates.')).toBeTruthy();
  if (hint === 'cancelled') expect(screen.getByText('Checkout was closed. Payment and wallet credit are not confirmed here.')).toBeTruthy();
});

it('renders real stable rows, signed cents and independent stale/error states; refresh supersedes a late page and resets to zero', async () => {
  render(<WalletPage />); await ready(); await screen.findByText('<b>Actual credit</b>');
  expect(screen.getByText('+USD 5.01')).toBeTruthy();
  expect(screen.getByRole('table').querySelector('[data-transaction-id="tx-1"]')).toBeTruthy();
  expect(screen.getByText(row.created_at)).toBeTruthy();
  const page = deferred<unknown>();
  net.adapter.mockImplementation(async config => {
    if (config.url === '/wallet/transactions' && config.params.offset === 20) return response(config, await page.promise);
    if (config.url === '/wallet/balance') throw new Error('offline');
    return response(config, { transactions: [{ ...row, id: 'debit', amount_cents: -201 }], total: 1, has_more: false });
  });
  act(() => { fireEvent.click(screen.getByRole('button', { name: 'Next' })); fireEvent.click(screen.getByRole('button', { name: 'Next' })); });
  expect(calls('/wallet/transactions').filter(c => c.params.offset === 20)).toHaveLength(1);
  refresh(); await screen.findByText('−USD 2.01');
  await act(async () => page.resolve({ transactions: [{ ...row, description: 'obsolete page' }], total: 21, has_more: false }));
  expect(screen.queryByText('obsolete page')).toBeNull();
  expect(screen.getByText(/Page 1\./)).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText('Balance could not be loaded.')).toBeTruthy();
  expect(screen.getByText(/Stale — Balance last refreshed/)).toBeTruthy();
  expect(within(screen.getByRole('region', { name: 'Balance' })).getByText('USD 12.01')).toBeTruthy();
  expect(calls('/wallet/transactions').every(c => c.params.limit === 20 && c.params.offset >= 0)).toBe(true);
});

it('supports last-page previous navigation and keeps prior history labeled stale on errors', async () => {
  render(<WalletPage />); await ready(); await screen.findByText('<b>Actual credit</b>');
  net.adapter.mockImplementation(async config => response(config, config.url === '/wallet/transactions'
    ? { transactions: [], total: 21, has_more: false } : defaultData(config)));
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByText(/Page 2\./);
  expect(screen.getByText('No recorded transactions on this page.')).toBeTruthy();
  net.adapter.mockRejectedValue(new Error('offline'));
  fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
  await screen.findByText('Transaction history could not be loaded.');
  expect(screen.getByText(/Stale — History last refreshed/)).toBeTruthy();
  expect(screen.getByText(/Page 2\./)).toBeTruthy();
  expect(calls('/wallet/transactions').map(c => c.params.offset)).toEqual([0, 20, 0]);
});

it('shows initial read errors independently without fabricated balance or empty history', async () => {
  net.adapter.mockImplementation(async config => {
    if (config.url?.startsWith('/wallet/')) throw new Error('offline');
    return response(config, defaultData(config));
  });
  render(<WalletPage />); await ready();
  await screen.findByText('Transaction history could not be loaded.');
  expect(screen.getByText('Balance could not be loaded.')).toBeTruthy();
  expect(screen.queryByText('USD 0.00')).toBeNull();
  expect(screen.queryByText('No recorded transactions on this page.')).toBeNull();
});

it.each([null, { user_id: 'foreign', currency: 'USD', balance_cents: 0 }, { user_id: 'owner-a', currency: 'EUR', balance_cents: 0 }, { user_id: 'owner-a', currency: 'USD', balance_cents: 0.1 }])('rejects malformed/wrong-owner balance %j in actual wrapper', async data => {
  net.adapter.mockImplementation(async config => response(config, config.url === '/wallet/balance' ? data : defaultData(config)));
  render(<WalletPage />); await screen.findByText('Balance could not be loaded.');
  expect(screen.queryByText('USD 0.00')).toBeNull();
  expect(await screen.findByText('<b>Actual credit</b>')).toBeTruthy();
});

it.each([null, {}, { ...history, has_more: 'false' }, { ...history, transactions: [row, row] }, { ...history, transactions: [{ ...row, amount_cents: 0.5 }] }, { ...history, transactions: [{ ...row, created_at: 'invalid' }] }])('rejects malformed history %j without inventing an empty success', async data => {
  net.adapter.mockImplementation(async config => response(config, config.url === '/wallet/transactions' ? data : defaultData(config)));
  render(<WalletPage />); await screen.findByText('Transaction history could not be loaded.');
  expect(screen.queryByText('No recorded transactions on this page.')).toBeNull();
});

it('actual wrapper uses explicit captured Bearer for all four operations despite another store token', async () => {
  useAuthStore.setState({ token: 'token-b' });
  const signal = new AbortController().signal;
  await resolveWalletOwner('token-a', signal);
  await getWalletBalance('token-a', 'owner-a', signal);
  await getWalletHistory('token-a', 20, signal);
  await createWalletTopup('token-a', 501, 'https://ai.market', signal);
  expect(net.adapter.mock.calls).toHaveLength(4);
  for (const [config] of net.adapter.mock.calls) {
    expect(config.headers.get('Authorization')).toBe('Bearer token-a');
    expect(config.headers.get('X-API-Key')).toBeUndefined();
  }
  expect(shared.getMe).not.toHaveBeenCalled();
});

it.each(['/auth/me', '/wallet/balance', '/wallet/transactions', '/wallet/topup'])('actual Axios transport never refreshes/replays %s 401', async url => {
  net.adapter.mockRejectedValue(failure(401));
  const signal = new AbortController().signal;
  const request = url === '/auth/me' ? resolveWalletOwner('token-a', signal)
    : url === '/wallet/balance' ? getWalletBalance('token-a', 'owner-a', signal)
    : url === '/wallet/transactions' ? getWalletHistory('token-a', 0, signal)
    : createWalletTopup('token-a', 501, 'https://ai.market', signal);
  await expect(request).rejects.toEqual(failure(401));
  expect(net.adapter).toHaveBeenCalledTimes(1);
  expect(shared.refreshAccessToken).not.toHaveBeenCalled();
});

it.each([null, '/relative', 'javascript:alert(1)', 'data:text/html,x', 'https://checkout.stripe.com.evil.test/a',
  'https://sub.checkout.stripe.com/a', 'https://user@checkout.stripe.com/a', 'https://checkout.stripe.com:444/a',
  'https://checkout.stripe.com/\\a', 'https://checkout.stripe.com/ a'])('blocks invalid actual response URL %s with no one-click retry', async url => {
  net.adapter.mockImplementation(async config => response(config, config.method === 'post' ? { ...checkout, checkout_url: url } : defaultData(config)));
  render(<WalletPage />); await ready(); amount(); submit();
  await screen.findByText(/couldn't confirm whether checkout/);
  submit(); expect(postCalls()).toHaveLength(1);
});

it.each([null, {}, { ...checkout, session_id: '' }, { ...checkout, amount_cents: 500 }, { ...checkout, amount_cents: '501' }])('blocks malformed topup body %j', async data => {
  net.adapter.mockImplementation(async config => response(config, config.method === 'post' ? data : defaultData(config)));
  render(<WalletPage />); await ready(); amount(); submit();
  await screen.findByText(/couldn't confirm whether checkout/);
  expect(postCalls()).toHaveLength(1);
});

it('navigates at the top level only for a validated actual response and fixed request body', async () => {
  render(<WalletPage />); await ready(); amount();
  const assign = vi.fn();
  vi.stubGlobal('window', { location: { origin: 'https://ai.market', assign } });
  submit(); await waitFor(() => expect(assign).toHaveBeenCalledExactlyOnceWith(checkout.checkout_url));
  expect(JSON.parse(postCalls()[0].data)).toEqual({ amount_cents: 501,
    success_url: 'https://ai.market/dashboard/settings/wallet?topup=return', cancel_url: 'https://ai.market/dashboard/settings/wallet?topup=cancelled' });
});

it('parses boundaries without changing the separate Agent amount policy', () => {
  expect(parseWalletAmount('5')).toBe(500);
  expect(parseWalletAmount('1000000.00')).toBe(100000000);
  expect(parseWalletAmount('1')).toBeNull();
  expect(parseWalletAmount('00000000000000000000000005.01')).toBe(501);
});

it.each(['provisioning', 'failed'])('keeps the seller wallet usable when capability resolution is %s', async status => {
  useAuthStore.setState({ user: { ...user, role: 'seller' } });
  const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
  if (status === 'failed') capabilities.getCapabilities.mockRejectedValue(new Error('capabilities unavailable'));
  else capabilities.getCapabilities.mockResolvedValue({ seller: { effective_status: status } });
  render(<DashboardLayout><WalletPage /></DashboardLayout>); await ready();
  await screen.findByText('<b>Actual credit</b>');
  expect(nav.push).not.toHaveBeenCalled();
  errorLog.mockRestore();
});

it.each([401, 422])('does not release an uncertain guard for a stale definitive POST %i rejection', async status => {
  const NativeAbortController = AbortController;
  vi.stubGlobal('AbortController', class extends NativeAbortController { abort() {} });
  const post = deferred<unknown>();
  net.adapter.mockImplementation(async config => response(config, config.method === 'post' ? await post.promise : defaultData(config)));
  render(<WalletPage />); await ready(); amount(); submit();
  act(() => useAuthStore.setState({ token: 'token-rotated' })); await ready();
  await act(async () => post.reject(failure(status)));
  expect(screen.getByText(/couldn't confirm whether checkout/)).toBeTruthy();
  expect(screen.queryByText(/Checkout was rejected/)).toBeNull();
  amount(); submit(); expect(postCalls()).toHaveLength(1);
});
