// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SellerPreviewConsent, { PREVIEW_CONSENT_WORDING } from './SellerPreviewConsent';
import { readPreview, reviewRevokePreview, revokePreview } from '@/api/connector-seller-settings';
import { useSellerSwitches } from '@/hooks/useSellerSwitches';
import { useAuthStore } from '@/store/auth';
import { submitReauth } from '@/api/auth';
import { checkCompanySignIn } from '@/lib/company-sign-in';
import type { User } from '@/types';
import { id, preview, hash } from '@/tests/fixtures/seller-authority';
vi.mock('@/hooks/useSellerSwitches', () => ({ useSellerSwitches: vi.fn() }));
vi.mock('@/api/connector-seller-settings', async original => ({ ...await original<typeof import('@/api/connector-seller-settings')>(), readPreview: vi.fn(), reviewRevokePreview: vi.fn(), revokePreview: vi.fn() }));
vi.mock('@/api/auth', async original => ({ ...await original<typeof import('@/api/auth')>(), submitReauth: vi.fn() }));
vi.mock('@/lib/company-sign-in', async original => ({ ...await original<typeof import('@/lib/company-sign-in')>(), checkCompanySignIn: vi.fn() }));
beforeEach(() => { vi.resetAllMocks(); useAuthStore.setState({ user: { id: id(99) } as User, token: 'retained-session' }); vi.mocked(useSellerSwitches).mockReturnValue({ seller: true, effects: false, bulk: false }); vi.mocked(readPreview).mockResolvedValue(preview); vi.mocked(reviewRevokePreview).mockImplementation(async body => { const { csrf: _csrf, reauth_token: _token, review_hash: _hash, ...decision } = body; return { action: 'aim.listing.ai_preview_consent.revoke', decision, review_hash: hash }; }); vi.mocked(revokePreview).mockResolvedValue({ decision_id: id(90), version: 4, enabled: false }); });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });
it('defaults both independent consent controls off and disabled with adapter absent', async () => {
  render(<SellerPreviewConsent listingId={id(10)} />); await screen.findByText(/Saved consent/);
  for (const checkbox of screen.getAllByRole('checkbox') as HTMLInputElement[]) { expect(checkbox.checked).toBe(false); expect(checkbox.disabled).toBe(true); }
  expect(screen.getByText(PREVIEW_CONSENT_WORDING)).toBeTruthy(); expect(screen.getByText(/Preview values withheld/)).toBeTruthy();
});
it('withholds values honestly even when backend reports saved consent on', async () => {
  vi.mocked(readPreview).mockResolvedValue({ ...preview, enabled: true, sample_available: true }); render(<SellerPreviewConsent listingId={id(10)} />);
  await screen.findByText(/On for the current sample/); expect(screen.getByText(/verified native sample adapter is unavailable/)).toBeTruthy();
  expect((screen.getByLabelText(PREVIEW_CONSENT_WORDING) as HTMLInputElement).checked).toBe(false);
});
it('revokes stale consent against its saved publication/digest even with effects off', async () => {
  render(<SellerPreviewConsent listingId={id(10)} />); await screen.findByText(/Saved consent/); fireEvent.click(screen.getByRole('button', { name: 'Revoke AI preview consent' }));
  expect(revokePreview).not.toHaveBeenCalled(); fireEvent.click(await screen.findByRole('button', { name: 'Confirm revoke AI preview consent' }));
  await waitFor(() => expect(revokePreview).toHaveBeenCalledTimes(1)); expect(vi.mocked(revokePreview).mock.calls[0][0]).toMatchObject({ listing_id: id(10), publication_version_id: preview.consent_publication_version_id, sample_set_hash: preview.consent_sample_set_hash, expected_version: 3, review_hash: hash, csrf: expect.any(String) });
});
it('keeps consent withdrawal reachable without seller reporting', async () => {
  vi.mocked(useSellerSwitches).mockReturnValue(null); render(<SellerPreviewConsent listingId={id(10)} />);
  await screen.findByRole('button', { name: 'Revoke AI preview consent' }); expect(readPreview).toHaveBeenCalled();
});
it.each(['review', 'submit'])('retains saved consent withdrawal through native TOTP before explicit confirmation (%s)', async stage => {
  useAuthStore.setState({ user: { id: id(99), sso_enforced: true, totp_enabled: true } as User });
  vi.mocked(submitReauth).mockResolvedValue({ token: 'native-totp-proof' } as never);
  vi.mocked(stage === 'review' ? reviewRevokePreview : revokePreview).mockRejectedValueOnce({ response: { status: 403, data: { detail: 'SECOND_FACTOR_REQUIRED' } } });
  render(<SellerPreviewConsent listingId={id(10)} />); await screen.findByText(/Saved consent/);
  fireEvent.click(screen.getByRole('button', { name: 'Revoke AI preview consent' }));
  if (stage === 'submit') fireEvent.click(await screen.findByRole('button', { name: 'Confirm revoke AI preview consent' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Verify authenticator code' }));
  fireEvent.change(screen.getByPlaceholderText('Enter code'), { target: { value: '123456' } }); fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  const confirm = await screen.findByRole('button', { name: 'Confirm revoke AI preview consent' });
  const calls = vi.mocked(reviewRevokePreview).mock.calls;
  expect(calls[1][0]).toEqual({ ...calls[0][0], reauth_token: 'native-totp-proof' }); expect(revokePreview).toHaveBeenCalledTimes(stage === 'submit' ? 1 : 0);
  fireEvent.click(confirm); await waitFor(() => expect(revokePreview).toHaveBeenCalledWith({ ...calls[1][0], review_hash: hash }));
});

it.each(['oidc', 'saml'])('preserves withdrawal through %s SSO_REQUIRED and waits for explicit consent', async method => {
  vi.stubEnv('NEXT_PUBLIC_ORG_SSO_WEB_RETURN_ENABLED', 'true');
  useAuthStore.setState({ user: { id: id(99), sso_enforced: true, totp_enabled: true, auth_methods: [method] } as User });
  vi.mocked(reviewRevokePreview).mockRejectedValueOnce({ response: { status: 403, data: { detail: 'SSO_REQUIRED' } } });
  vi.mocked(checkCompanySignIn).mockImplementation(async () => { useAuthStore.setState({ token: 'fresh-company-session' }); });
  vi.mocked(submitReauth).mockResolvedValue({ token: 'fresh-company-totp' } as never);
  vi.mocked(reviewRevokePreview).mockRejectedValueOnce({ response: { status: 403, data: { detail: 'SECOND_FACTOR_REQUIRED' } } });
  render(<SellerPreviewConsent listingId={id(10)} />); await screen.findByText(/Saved consent/);
  fireEvent.click(screen.getByRole('button', { name: 'Revoke AI preview consent' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Check company sign-in' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Verify authenticator code' }));
  fireEvent.change(screen.getByPlaceholderText('Enter code'), { target: { value: '123456' } }); fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByRole('button', { name: 'Confirm revoke AI preview consent' });
  expect(checkCompanySignIn).toHaveBeenCalledTimes(1);
  const calls = vi.mocked(reviewRevokePreview).mock.calls;
  expect(calls[1][0].idempotency_key).toBe(calls[0][0].idempotency_key);
  expect(calls[2][0].csrf).not.toBe(calls[0][0].csrf);
  expect(calls[2][0].reauth_token).toBe('fresh-company-totp');
  expect(calls[2][0].idempotency_key).toBe(calls[0][0].idempotency_key);
  expect(revokePreview).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm revoke AI preview consent' }));
  await waitFor(() => expect(revokePreview).toHaveBeenCalledWith({ ...calls[2][0], review_hash: hash }));
});
