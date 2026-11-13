// @vitest-environment jsdom
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import SettingsPage from './page';
import SellerPublicName from './SellerPublicName';
import { AuthorityScreen } from './SellerAuthority';
import { PendingProfileChanges } from '@/components/PendingProfileChanges';
import { api, refreshAccessToken } from '@/api/client';
import { nativeClient } from '@/api/connector-seller-settings';
import { useAuthStore } from '@/store/auth';
import { advanceAuthSessionOwner } from '@/lib/auth-session-owner';
import { authority, id } from '@/tests/fixtures/seller-authority';
import type { User } from '@/types';

// Only unrelated UI dependencies are replaced. All section reads, controllers,
// auth store, coordinator, interceptors, and API error mapping are real.
vi.mock('next/navigation', () => ({ useRouter: () => ({}), usePathname: () => '/dashboard/settings', useSearchParams: () => new URLSearchParams() }));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('./ConnectedApps', () => ({ default: () => null }));
vi.mock('@/hooks/useSellerSwitches', () => ({ useSellerSwitches: () => null }));

const user = { id: id(99), role: 'buyer', email: 'fixture@example.test', created_at: '2026-01-01T00:00:00Z' } as User;
const token = (generation: number) => `e30.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, generation }))}.sig`;
const ownOperation = () => () => true;
const row = { id: id(1), revision: 1, created_at: '2026-01-01T00:00:00Z', state: 'pending', ready_to_reconfirm: true, intent: { kind: 'profile_email', email: 'pending@example.test' } };
const cases = [
  { name: 'public name', path: '/profiles/seller/me', view: () => <SellerPublicName ownOperation={ownOperation} />, data: { public_display_name: 'Recovered name', show_public_display_name: true }, success: () => expect((screen.getByLabelText('Public business name') as HTMLInputElement).value).toBe('Recovered name') },
  { name: 'capabilities', path: '/auth/capabilities', view: () => <SettingsPage />, data: { seller: { effective_status: 'not_requested' } }, success: () => expect(screen.getByText('Buyer')).toBeTruthy() },
  { name: 'authority', path: '/connector-seller-settings', view: () => <AuthorityScreen switches={null} />, data: authority, success: () => expect(screen.getByText(/Authority version 4/)).toBeTruthy() },
  { name: 'pending changes', path: '/support/pending-profile-changes', view: () => <PendingProfileChanges />, data: [row], success: () => expect(screen.getByText('pending@example.test')).toBeTruthy() },
];
const original = [api.defaults.adapter, nativeClient.defaults.adapter];
beforeEach(() => {
  advanceAuthSessionOwner();
  useAuthStore.setState({ user, token: token(0), hydrated: true, isLoading: false, isAuthenticated: true });
});
afterEach(() => {
  cleanup();
  [api.defaults.adapter, nativeClient.defaults.adapter] = original;
  vi.restoreAllMocks();
});
function transport(path: string, data: unknown, status: (read: number) => number) {
  let reads = 0, generation = 0;
  const refresh = vi.spyOn(axios, 'post').mockImplementation(async url => {
    expect(String(url)).toMatch(/\/auth\/refresh$/);
    return { data: { access_token: token(++generation) } };
  });
  const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
    const response = { config, data, status: 200, statusText: 'OK', headers: {} };
    // Settings also mounts authority; it must not add a failing sibling here.
    if (config.url !== path) return { ...response, data: authority };
    const code = status(++reads);
    if (code !== 200) throw new AxiosError('Section refusal', 'ERR_BAD_RESPONSE', config, undefined, { ...response, status: code });
    return response;
  });
  api.defaults.adapter = adapter; nativeClient.defaults.adapter = adapter;
  return { refresh, reads: () => reads };
}
async function retryButton() {
  const button = await screen.findByRole('button', { name: /Try again/ });
  await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
  return button;
}
async function settle() {
  // Give token subscriptions, trailing focus reads (250 ms), and React effects
  // time to dispatch any forbidden follow-up requests.
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 350)); });
}

it.each(cases)('$name stops persistent 401s after one refresh/replay, retains an error and permits manual retry', async section => {
  const network = transport(section.path, section.data, () => 401);
  render(section.view());
  await retryButton();
  await settle();
  expect(network.reads()).toBe(2);
  expect(network.refresh).toHaveBeenCalledTimes(1);
  // Even a successful sibling refresh and window focus must not restart a
  // section whose request already received 401 after replay.
  await act(async () => { await refreshAccessToken(); window.dispatchEvent(new Event('focus')); });
  await settle();
  expect(network.reads()).toBe(2);
  expect(network.refresh).toHaveBeenCalledTimes(2);
  fireEvent.click(await retryButton());
  await waitFor(() => expect(network.reads()).toBe(4));
  await retryButton(); await settle();
  expect(network.reads()).toBe(4);
  expect(network.refresh).toHaveBeenCalledTimes(3);
});

it.each(cases)('$name allows one session recovery re-read and then stops', async section => {
  const network = transport(section.path, section.data, read => read === 1 ? 503 : 401);
  render(section.view()); await retryButton();
  await act(async () => { await refreshAccessToken(); });
  await waitFor(() => expect(network.reads()).toBe(3));
  await retryButton(); await settle();
  expect(network.reads()).toBe(3);
  expect(network.refresh).toHaveBeenCalledTimes(2);
});

it.each(cases)('$name spends at most one automatic re-read across repeated external rotations', async section => {
  const network = transport(section.path, section.data, () => 503);
  render(section.view()); await retryButton();
  await act(async () => { await refreshAccessToken(); });
  await waitFor(() => expect(network.reads()).toBe(2));
  await retryButton();
  await act(async () => { await refreshAccessToken(); await refreshAccessToken(); });
  await settle();
  expect(network.reads()).toBe(2);
  expect(network.refresh).toHaveBeenCalledTimes(3);
});

it.each(cases)('$name does not re-read because its own refresh preceded a replayed 503', async section => {
  const network = transport(section.path, section.data, read => read === 1 ? 401 : 503);
  render(section.view()); await retryButton(); await settle();
  expect(network.reads()).toBe(2);
  expect(network.refresh).toHaveBeenCalledTimes(1);
});

it.each(cases)('$name recovers its first 401 through the real refresh/replay without manual retry', async section => {
  const network = transport(section.path, section.data, read => read === 1 ? 401 : 200);
  render(section.view());
  await waitFor(section.success);
  await settle();
  expect(network.reads()).toBe(2);
  expect(network.refresh).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', { name: /Try again/ })).toBeNull();
});
