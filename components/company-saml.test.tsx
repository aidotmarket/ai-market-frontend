// @vitest-environment jsdom
import { createHash } from 'node:crypto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/store/auth';
import type { User } from '@/types';
const mocks = vi.hoisted(() => ({ post: vi.fn(), me: vi.fn(), refresh: vi.fn(), push: vi.fn() }));
vi.mock('axios', () => ({ default: { create: () => ({ post: mocks.post }) } }));
vi.mock('@/api/auth', () => ({ getMe: mocks.me }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/components/onboarding/SellerSetupProgressBar', () => ({ notifyCapabilitiesChanged: vi.fn() }));
vi.mock('qrcode', () => ({ default: { toDataURL: async () => 'data:image/png;base64,cG5n' } }));
import CompanyAuthenticator from './CompanyAuthenticator';
const user = { id: 'saml-owner', sso_enforced: true, auth_methods: ['saml'], totp_enabled: false,
  two_factor_setup_eligible: false, seller_binding_factor_readiness: { code: 'SECOND_FACTOR_ENROLLMENT_REQUIRED', path: '/dashboard/settings' } } as User;
let open: ReturnType<typeof vi.spyOn>;
let storage: ReturnType<typeof vi.spyOn>;
let url: string;
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('NEXT_PUBLIC_ORG_SSO_WEB_RETURN_ENABLED', 'true');
  window.history.replaceState(null, '', '/dashboard/settings'); url = window.location.href;
  useAuthStore.setState({ user, token: 'old-session', refreshAuth: mocks.refresh });
  mocks.refresh.mockImplementation(async () => { useAuthStore.setState({ token: 'fresh-saml-session' }); });
  mocks.me.mockResolvedValue({ ...user, two_factor_setup_eligible: true });
  open = vi.spyOn(window, 'open'); storage = vi.spyOn(Storage.prototype, 'setItem');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });
const headers = { Authorization: 'Bearer fresh-saml-session',
  'X-CSRF-Token': createHash('sha256').update('aim.pending.csrf.v1\0fresh-saml-session').digest('hex') };
const check = async () => {
  expect(screen.queryByLabelText('Company sign-in ID')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Sign in through your company' })).toBeNull();
  expect(screen.getByText(/then return here and check this page/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Check company sign-in' }));
  await waitFor(() => expect(mocks.me).toHaveBeenCalledOnce());
};
const privateFlow = () => {
  expect(open).not.toHaveBeenCalled(); expect(storage).not.toHaveBeenCalled();
  expect(window.location.href).toBe(url); expect(mocks.push).not.toHaveBeenCalled();
  expect(mocks.post.mock.calls.every(([path]) => !path.includes('/sso/oidc/authorize'))).toBe(true);
};
it('flag-on SAML enrollment retains external company check and uses strict setup and verification after fresh session', async () => {
  mocks.post.mockResolvedValueOnce({ data: { secret: 'SAMLSECRET', qr_uri: 'otpauth://fixture', expires_in: 600 } })
    .mockResolvedValueOnce({ data: { backup_codes: ['saml-backup'] } });
  render(<CompanyAuthenticator />); expect(mocks.post).not.toHaveBeenCalled();
  await check(); await screen.findByText('SAMLSECRET');
  expect(mocks.post).toHaveBeenNthCalledWith(1, '/auth/2fa/setup', { reauth_token: '' }, { headers });
  fireEvent.change(screen.getByLabelText('Authenticator code'), { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify and enable' }));
  await screen.findByText('saml-backup');
  expect(mocks.post).toHaveBeenNthCalledWith(2, '/auth/2fa/verify-setup', { reauth_token: '', code: '123456' }, { headers });
  privateFlow();
});
it('flag-on SAML recovery asks for external company check only on freshness refusal then uses strict disable', async () => {
  useAuthStore.setState({ user: { ...user, totp_enabled: true } });
  mocks.me.mockResolvedValue({ ...user, totp_enabled: true });
  mocks.post.mockRejectedValueOnce({ response: { status: 403, data: { detail: 'RECENT_LOGIN_REQUIRED' } } }).mockResolvedValueOnce({ data: {} });
  render(<CompanyAuthenticator recovery />);
  fireEvent.change(screen.getByLabelText('Backup code'), { target: { value: 'retained-backup' } });
  fireEvent.click(screen.getByRole('button', { name: 'Disable lost authenticator' }));
  await screen.findByRole('button', { name: 'Check company sign-in' });
  expect(screen.queryByLabelText('Backup code')).toBeNull();
  await check(); await screen.findByLabelText('Backup code');
  expect(mocks.post).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByLabelText('Backup code'), { target: { value: 'retained-backup' } });
  fireEvent.click(screen.getByRole('button', { name: 'Disable lost authenticator' }));
  await screen.findByText(/Authenticator disabled/);
  expect(mocks.post).toHaveBeenNthCalledWith(2, '/auth/2fa/disable', { reauth_token: '', code: 'retained-backup' }, { headers });
  privateFlow();
});
