// @vitest-environment jsdom
import '@/tests/support-network-trap';
import '@/tests/support-private-network-guard';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
const ports = vi.hoisted(() => ({ adapter: vi.fn() }));
vi.mock('axios', async original => {
  const moduleValue = await original<typeof import('axios')>();
  const actual = moduleValue.default;
  const create = actual.create.bind(actual);
  return { ...moduleValue, default: Object.assign(actual, {
    create: (config: Parameters<typeof actual.create>[0]) => create({ ...config, adapter: ports.adapter }),
  }) };
});
import SupportMailboxAccount from './page';
import { useAuthStore } from '@/store/auth';
import { advanceAuthSessionOwner } from '@/lib/auth-session-owner';
import { deferred, principal } from '@/tests/support-fixtures';
import type { User } from '@/types';
const jwt = (seconds = 3600, suffix = 'same-session') => `e30.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + seconds }))}.${suffix}`;
const linkSecret = Array(44).join('f');
const result = (data: unknown) => ({ data, status: 200, statusText: 'OK', headers: {}, config: {} });
const user = (id = 'buyer-fixture') => ({ id, role: 'buyer' } as User);
const button = () => screen.getByRole('button', { name: 'Confirm support delivery' });
const consumption = () => ports.adapter.mock.calls.filter(([config]) => config.url === '/support/mailbox-confirm/account');
let refresh: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  ports.adapter.mockReset(); principal();
  useAuthStore.setState({ hydrated: true, token: jwt() });
  history.replaceState(null, '', '/support/mailbox-account#' + linkSecret);
  refresh = vi.spyOn(axios, 'post').mockResolvedValue({ data: { access_token: jwt(3600, 'rotated') } });
  ports.adapter.mockImplementation(async config => result(config.url === '/auth/me' ? user() : { confirmed: true, conversation_url: null }));
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Private page cannot persist'); });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it('captures and clears once, never consumes on GET, and uses a valid current principal with exact bearer/CSRF and no extra auth', async () => {
  const admittedToken = useAuthStore.getState().token!;
  const replace = vi.spyOn(history, 'replaceState');
  render(<SupportMailboxAccount />);
  expect(location.hash).toBe(''); expect(location.search).toBe('');
  expect(replace).toHaveBeenCalledExactlyOnceWith(null, '', '/support/mailbox-account');
  expect(consumption()).toHaveLength(0);
  fireEvent.click(button());
  await screen.findByText('Mailbox confirmed. Delivery and message receipt remain separate.');
  expect(consumption()).toHaveLength(1); expect(refresh).not.toHaveBeenCalled();
  const config = consumption()[0][0] as InternalAxiosRequestConfig;
  expect(config.url).toBe('/support/mailbox-confirm/account');
  expect(config.withCredentials).toBe(true);
  expect(JSON.parse(config.data)).toEqual({ secret: linkSecret });
  expect(config.headers.Authorization).toBe(`Bearer ${admittedToken}`);
  expect(config.headers['X-CSRF-Token']).toBe(createHash('sha256').update('aim.pending.csrf.v1\0' + admittedToken).digest('hex'));
  expect(config.headers.Origin).toBeUndefined(); // Browser origin must not be forged.
  expect(ports.adapter.mock.calls.map(([c]) => c.url)).toEqual(['/support/mailbox-confirm/account']);
  expect(Storage.prototype.setItem).not.toHaveBeenCalled();
});
it('uses actual hydrate, API-host refresh and /me once before the explicit single consume', async () => {
  useAuthStore.setState({ hydrated: false, user: null, token: null, isAuthenticated: false });
  const restore = deferred<{ data: { access_token: string } }>(); refresh.mockReturnValue(restore.promise);
  render(<SupportMailboxAccount />);
  fireEvent.click(button()); fireEvent.click(button());
  await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  expect(consumption()).toHaveLength(0);
  expect(refresh.mock.calls[0]).toEqual([expect.stringMatching(/\/api\/v1\/auth\/refresh$/), {}, { headers: { 'Content-Type': 'application/json' }, withCredentials: true }]);
  await act(async () => restore.resolve({ data: { access_token: jwt() } }));
  await screen.findByText('Mailbox confirmed. Delivery and message receipt remain separate.');
  expect(ports.adapter.mock.calls.map(([c]) => c.url)).toEqual(['/auth/me', '/support/mailbox-confirm/account']);
  expect(consumption()).toHaveLength(1);
});
it('admits same-principal preflight rotation and derives CSRF from the refreshed token', async () => {
  useAuthStore.setState({ token: jwt(-60) });
  const restore = deferred<{ data: { access_token: string } }>(); refresh.mockReturnValue(restore.promise);
  render(<SupportMailboxAccount />); fireEvent.click(button());
  await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  expect(consumption()).toHaveLength(0);
  const fresh = jwt(3600, 'new');
  await act(async () => restore.resolve({ data: { access_token: fresh } }));
  await screen.findByText('Mailbox confirmed. Delivery and message receipt remain separate.');
  expect(consumption()[0][0].headers['X-CSRF-Token']).toBe(createHash('sha256').update('aim.pending.csrf.v1\0' + fresh).digest('hex'));
});
it.each(['logout', 'replacement', 'principal'] as const)('blocks consumption after %s during actual shared refresh admission', async kind => {
  useAuthStore.setState({ token: jwt(-60) });
  const restore = deferred<{ data: { access_token: string } }>(); refresh.mockReturnValue(restore.promise);
  render(<SupportMailboxAccount />); fireEvent.click(button());
  await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  await act(async () => {
    if (kind === 'logout') { advanceAuthSessionOwner(); useAuthStore.setState({ token: null, user: null, isAuthenticated: false }); }
    if (kind === 'replacement') { advanceAuthSessionOwner(); useAuthStore.setState({ token: jwt(3600, 'replacement') }); }
    if (kind === 'principal') useAuthStore.setState({ user: user('other-principal') });
    restore.resolve({ data: { access_token: jwt(3600, 'late') } });
  });
  expect(consumption()).toHaveLength(0);
  expect(screen.getByRole('status').textContent).toMatch(/session changed/);
  expect(screen.queryByText(/^Mailbox confirmed/)).toBeNull();
});
it('blocks POST when the original principal changes during deferred hydration /me', async () => {
  useAuthStore.setState({ hydrated: false });
  const me = deferred<ReturnType<typeof result>>();
  ports.adapter.mockReturnValue(me.promise);
  render(<SupportMailboxAccount />); fireEvent.click(button());
  await waitFor(() => expect(ports.adapter).toHaveBeenCalledOnce());
  await act(async () => { useAuthStore.setState({ user: user('other-principal') }); me.resolve(result(user())); });
  expect(consumption()).toHaveLength(0); expect(screen.getByRole('status').textContent).toMatch(/session changed/);
});
it.each(['logout', 'principal', 'token'] as const)('quarantines late success and clears confirmed status on %s', async kind => {
  const response = deferred<ReturnType<typeof result>>(); ports.adapter.mockReturnValue(response.promise);
  render(<SupportMailboxAccount />); fireEvent.click(button());
  await waitFor(() => expect(consumption()).toHaveLength(1));
  await act(async () => {
    if (kind === 'logout') { advanceAuthSessionOwner(); useAuthStore.setState({ user: null, token: null, isAuthenticated: false }); }
    if (kind === 'principal') useAuthStore.setState({ user: user('other-principal') });
    if (kind === 'token') useAuthStore.setState({ token: jwt(3600, 'replacement') });
    response.resolve(result({ confirmed: true, conversation_url: null }));
  });
  expect(screen.queryByText(/^Mailbox confirmed/)).toBeNull(); expect(consumption()).toHaveLength(1);
});
it('retires a previously confirmed status when its account owner leaves', async () => {
  render(<SupportMailboxAccount />); fireEvent.click(button());
  await screen.findByText('Mailbox confirmed. Delivery and message receipt remain separate.');
  act(() => advanceAuthSessionOwner());
  expect(screen.queryByText(/^Mailbox confirmed/)).toBeNull();
});
it.each(['', '#short', '#bad%20fragment', '#' + Array(45).join('x')])('refuses absent/invalid fragment %s without hydration or consume', fragment => {
  history.replaceState(null, '', '/support/mailbox-account' + fragment);
  render(<SupportMailboxAccount />); fireEvent.click(button());
  expect(location.hash).toBe(''); expect((button() as HTMLButtonElement).disabled).toBe(true);
  expect(consumption()).toHaveLength(0); expect(refresh).not.toHaveBeenCalled();
});
it.each(['network', 'refusal', 'malformed'] as const)('keeps %s outcome unavailable after duplicate clicks, remount and fresh fragment replacement', async kind => {
  const pending = deferred<ReturnType<typeof result>>(); ports.adapter.mockReturnValue(pending.promise);
  const mounted = render(<SupportMailboxAccount />); fireEvent.click(button()); fireEvent.click(button());
  await waitFor(() => expect(consumption()).toHaveLength(1));
  // Duplicate clicks cannot capture another fragment or logical consume.
  await act(async () => {
    if (kind === 'malformed') pending.resolve(result({ confirmed: false }));
    else pending.reject(kind === 'network' ? new Error('synthetic unknown') : new AxiosError('refused', 'ERR_BAD_RESPONSE', undefined, undefined, { data: {}, status: 401, statusText: '', headers: {}, config: {} as InternalAxiosRequestConfig }));
  });
  expect(screen.getByRole('status').textContent).toMatch(/outcome unavailable/);
  fireEvent.click(button()); expect(consumption()).toHaveLength(1); expect(refresh).not.toHaveBeenCalled();
  // A cleared URL remount cannot rediscover or replay the consumed capability.
  history.replaceState(null, '', '/support/mailbox-account'); mounted.unmount(); render(<SupportMailboxAccount />);
  fireEvent.click(button()); expect(consumption()).toHaveLength(1);
});
it('does not redirect to login after a terminal retained-session refresh refusal', async () => {
  useAuthStore.setState({ hydrated: false });
  refresh.mockRejectedValue(new AxiosError('refused', 'ERR_BAD_RESPONSE', undefined, undefined, { data: {}, status: 401, statusText: '', headers: {}, config: {} as InternalAxiosRequestConfig }));
  render(<SupportMailboxAccount />); fireEvent.click(button());
  await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/session changed/));
  expect(location.pathname).toBe('/support/mailbox-account'); expect(location.hash).toBe(''); expect(consumption()).toHaveLength(0);
});

import { renderToString } from 'react-dom/server';
it('renders the pre-capture framework shell with consumption disabled and no auth requests', () => {
  const markup = renderToString(<SupportMailboxAccount />);
  expect(markup).toContain('disabled=""'); expect(consumption()).toHaveLength(0); expect(refresh).not.toHaveBeenCalled();
});

it('retires an ownerless token replacement while a real preflight refresh is pending', async () => {
  useAuthStore.setState({ token: jwt(-60) });
  const pending = deferred<{ data: { access_token: string } }>(); refresh.mockReturnValue(pending.promise);
  render(<SupportMailboxAccount />); fireEvent.click(button());
  await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  await act(async () => {
    useAuthStore.setState({ token: jwt(3600, 'replacement-without-owner') });
    pending.resolve({ data: { access_token: jwt(3600, 'late-rotation') } });
  });
  expect(consumption()).toHaveLength(0); expect(screen.getByRole('status').textContent).toMatch(/session changed/);
});
it('never recaptures a replacement fragment or lets it linger in the URL', () => {
  render(<SupportMailboxAccount />);
  history.replaceState(null, '', '/support/mailbox-account#' + Array(44).join('z'));
  fireEvent.click(button());
  expect(location.hash).toBe(''); expect(consumption()).toHaveLength(0); expect(refresh).not.toHaveBeenCalled();
  expect(screen.getByRole('status').textContent).toMatch(/session changed/);
});
it('retires on hashchange before any click and clears the new fragment', () => {
  render(<SupportMailboxAccount />);
  history.replaceState(null, '', '/support/mailbox-account#' + Array(44).join('z'));
  act(() => window.dispatchEvent(new HashChangeEvent('hashchange')));
  expect(location.hash).toBe(''); fireEvent.click(button()); expect(consumption()).toHaveLength(0);
});

import { StrictMode } from 'react';
it('retains one capture and one explicit consumption across strict effect setup/cleanup', async () => {
  const replace = vi.spyOn(history, 'replaceState');
  render(<StrictMode><SupportMailboxAccount /></StrictMode>);
  expect(replace).toHaveBeenCalledExactlyOnceWith(null, '', '/support/mailbox-account');
  fireEvent.click(button()); fireEvent.click(button());
  await screen.findByText('Mailbox confirmed. Delivery and message receipt remain separate.');
  expect(consumption()).toHaveLength(1);
});
it('blocks a changed principal before the explicit click', () => {
  render(<SupportMailboxAccount />);
  act(() => useAuthStore.setState({ user: user('other-principal') }));
  fireEvent.click(button()); expect(consumption()).toHaveLength(0); expect(refresh).not.toHaveBeenCalled();
});
it('does not admit a late old-page response after unmount', async () => {
  const pending = deferred<ReturnType<typeof result>>(); ports.adapter.mockReturnValue(pending.promise);
  const mounted = render(<SupportMailboxAccount />); fireEvent.click(button());
  await waitFor(() => expect(consumption()).toHaveLength(1));
  mounted.unmount();
  await act(async () => pending.resolve(result({ confirmed: true, conversation_url: null })));
  render(<SupportMailboxAccount />); expect(screen.queryByText(/^Mailbox confirmed/)).toBeNull();
  fireEvent.click(button()); expect(consumption()).toHaveLength(1);
});
