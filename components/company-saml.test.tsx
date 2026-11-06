// @vitest-environment jsdom
import { createHash } from 'node:crypto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/store/auth';
import type { User } from '@/types';
const mocks = vi.hoisted(() => ({ post: vi.fn(), me: vi.fn(), refresh: vi.fn(), push: vi.fn() }));
vi.mock('@/api/client', () => ({ refreshAccessToken: vi.fn() }));
vi.mock('axios', () => ({ default: { create: () => ({ post: mocks.post }) } }));
vi.mock('@/api/auth', () => ({ getMe: mocks.me }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/components/onboarding/SellerSetupProgressBar', () => ({ notifyCapabilitiesChanged: vi.fn() }));
vi.mock('qrcode', () => ({ default: { toDataURL: async () => 'data:image/png;base64,cG5n' } }));
import CompanyAuthenticator from './CompanyAuthenticator';
const token = `e30.${btoa(JSON.stringify({ exp: 4_000_000_000 }))}.sig`;
const user = { id: 'saml-owner', sso_enforced: true, auth_methods: ['saml'], totp_enabled: false,
  two_factor_setup_eligible: true } as User;
let open: ReturnType<typeof vi.spyOn>;
let storage: ReturnType<typeof vi.spyOn>;
let url: string;
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('NEXT_PUBLIC_ORG_SSO_WEB_RETURN_ENABLED', 'true');
  window.history.replaceState(null, '', '/dashboard/settings'); url = window.location.href;
  useAuthStore.setState({ user, token, refreshAuth: mocks.refresh });
  mocks.refresh.mockImplementation(async () => { useAuthStore.setState({ token }); });
  mocks.me.mockResolvedValue({ ...user, two_factor_setup_eligible: true });
  open = vi.spyOn(window, 'open'); storage = vi.spyOn(Storage.prototype, 'setItem');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });
const headers = { Authorization: `Bearer ${token}`,
  'X-CSRF-Token': createHash('sha256').update('aim.pending.csrf.v1\0' + token).digest('hex') };
const privateFlow = () => {
  expect(open).not.toHaveBeenCalled(); expect(storage).not.toHaveBeenCalled();
  expect(window.location.href).toBe(url); expect(mocks.push).not.toHaveBeenCalled();
  expect(mocks.post.mock.calls.every(([path]) => !path.includes('/sso/oidc/authorize'))).toBe(true);
};
it('SAML enrollment uses the retained session and CSRF without company sign-in', async () => {
  mocks.post.mockResolvedValueOnce({ data: { secret: 'SAMLSECRET', qr_uri: 'otpauth://fixture', expires_in: 600 } })
    .mockResolvedValueOnce({ data: { backup_codes: ['saml-backup'] } });
  render(<CompanyAuthenticator />); expect(mocks.post).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Set up company authenticator' }));
  await screen.findByText('SAMLSECRET');
  expect(mocks.post).toHaveBeenNthCalledWith(1, '/auth/2fa/setup', {}, { headers });
  fireEvent.change(screen.getByLabelText('Authenticator code'), { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify and enable' }));
  await screen.findByText('saml-backup');
  expect(mocks.post).toHaveBeenNthCalledWith(2, '/auth/2fa/verify-setup', { code: '123456' }, { headers });
  privateFlow();
});
it('SAML recovery sends no backup code and never starts a company sign-in flow', async () => {
  useAuthStore.setState({ user: { ...user, totp_enabled: true } });
  mocks.post.mockResolvedValueOnce({ data: { access_token: 'saml-replacement', token_type: 'bearer' } });
  render(<CompanyAuthenticator recovery />);
  expect(screen.queryByLabelText('Backup code')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Check company sign-in' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Disable lost authenticator' }));
  await screen.findByText(/Authenticator disabled/);
  expect(useAuthStore.getState().token).toBe('saml-replacement');
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(mocks.post).toHaveBeenCalledExactlyOnceWith('/auth/2fa/disable', {}, { headers });
  privateFlow();
});
