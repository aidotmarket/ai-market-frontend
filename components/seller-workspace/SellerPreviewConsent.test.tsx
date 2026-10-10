// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SellerPreviewConsent, { PREVIEW_CONSENT_WORDING } from './SellerPreviewConsent';
import { readPreview, revokePreview } from '@/api/connector-seller-settings';
import { useSellerSwitches } from '@/hooks/useSellerSwitches';
import { useAuthStore } from '@/store/auth';
import type { User } from '@/types';
import { id, preview } from '@/tests/fixtures/seller-authority';
vi.mock('@/hooks/useSellerSwitches', () => ({ useSellerSwitches: vi.fn() }));
vi.mock('@/api/connector-seller-settings', async original => ({ ...await original<typeof import('@/api/connector-seller-settings')>(), readPreview: vi.fn(), revokePreview: vi.fn() }));
beforeEach(() => { vi.resetAllMocks(); useAuthStore.setState({ user: { id: id(99) } as User, token: 'retained-session' }); vi.mocked(useSellerSwitches).mockReturnValue({ seller: true, effects: false, bulk: false }); vi.mocked(readPreview).mockResolvedValue(preview); vi.mocked(revokePreview).mockResolvedValue({ decision_id: id(90), version: 4, enabled: false }); });
afterEach(cleanup);
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
  await waitFor(() => expect(revokePreview).toHaveBeenCalledTimes(1)); expect(vi.mocked(revokePreview).mock.calls[0][0]).toMatchObject({ listing_id: id(10), publication_version_id: preview.consent_publication_version_id, sample_set_hash: preview.consent_sample_set_hash, expected_version: 3, csrf: expect.any(String) });
});
it('stays hidden and performs no consent reads without seller reporting', () => {
  vi.mocked(useSellerSwitches).mockReturnValue(null); render(<SellerPreviewConsent listingId={id(10)} />); expect(readPreview).not.toHaveBeenCalled(); expect(screen.queryByRole('region')).toBeNull();
});
