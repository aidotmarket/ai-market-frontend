import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError } from 'axios';
import { getSellerPublicProfile, updateSellerPublicProfile, SellerProfileError } from './sellerProfile';

const transport = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock('./client', () => ({ api: transport }));
beforeEach(() => vi.resetAllMocks());
const profile = { public_display_name: 'Synthetic Data Co', show_public_display_name: true };
function failure(status: number, detail: unknown) {
  return Object.assign(new AxiosError('Request failed'), { response: { status, data: { detail } } });
}

describe('owner public business name API', () => {
  it('reads only public settings from the owner response and supports cancellation', async () => {
    transport.get.mockResolvedValue({ data: { ...profile, business_name: 'Private legal name', user_id: 'private-owner' } });
    const { signal } = new AbortController();
    expect(await getSellerPublicProfile(signal)).toEqual(profile);
    expect(transport.get).toHaveBeenCalledWith('/profiles/seller/me', { signal });
  });
  it('writes only the two public fields and uses the normalized response immediately', async () => {
    transport.patch.mockResolvedValue({ data: profile });
    const { signal } = new AbortController();
    const request = { ...profile, public_display_name: '  Synthetic Data Co  ', business_name: 'Never write', company_name: 'Never write', stripe_connected: true };
    expect(await updateSellerPublicProfile(request, signal)).toEqual(profile);
    expect(transport.patch).toHaveBeenCalledWith('/profiles/seller/me', {
      public_display_name: '  Synthetic Data Co  ', show_public_display_name: true,
    }, { signal });
  });
  it('supports opt-out while retaining the saved name', async () => {
    transport.patch.mockResolvedValue({ data: { ...profile, show_public_display_name: false } });
    expect((await updateSellerPublicProfile({ ...profile, show_public_display_name: false })).show_public_display_name).toBe(false);
  });
  it.each([
    [{ field: 'public_display_name', message: 'Remove contact information.' }, { public_display_name: 'Remove contact information.' }],
    [[{ loc: ['body', 'public_display_name'], msg: 'At most 255 characters' }], { public_display_name: 'At most 255 characters' }],
    [[{ loc: ['body', 'show_public_display_name'], msg: 'Use a boolean' }], { show_public_display_name: 'Use a boolean' }],
    [{ field: 'business_name', message: 'Other field' }, {}],
  ])('maps validator detail to typed public field errors: %j', async (detail, expected) => {
    transport.patch.mockRejectedValue(failure(422, detail));
    const error = await updateSellerPublicProfile(profile).catch((error) => error);
    expect(error).toBeInstanceOf(SellerProfileError);
    expect(error.status).toBe(422);
    expect(error.fieldErrors).toEqual(expected);
  });
  it.each([403, 404, 503])('preserves HTTP %s failures on reads', async (status) => {
    transport.get.mockRejectedValue(failure(status, 'Try again'));
    await expect(getSellerPublicProfile()).rejects.toMatchObject({ status, message: 'Try again', fieldErrors: {} });
  });
  it('handles network failures without inventing a validation field', async () => {
    transport.patch.mockRejectedValue(new Error('Network unavailable'));
    await expect(updateSellerPublicProfile(profile)).rejects.toMatchObject({ status: undefined, fieldErrors: {} });
  });
});
