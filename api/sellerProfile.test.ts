import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError } from 'axios';
import { COMPANY_NAME_SAVE_FAILED } from '@/components/listings/publisherStrings';
import { getSellerPublicProfile, updateSellerPublicProfile, updateSellerCompanyName, SellerProfileError } from './sellerProfile';

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

describe('company name API', () => {
  it.each([true, false, null, undefined, 'true', 1])('projects only boolean company settings (%s)', async value => {
    transport.get.mockResolvedValue({ data: { ...profile, show_company_name: value, company_name: 'Private', business_name: 'Legal', user_id: 'Owner' } });
    const result = await getSellerPublicProfile();
    expect(result).toEqual({ ...profile, ...(typeof value === 'boolean' ? { show_company_name: value } : {}) });
    expect(Object.hasOwn(result, 'show_company_name')).toBe(typeof value === 'boolean');
  });
  it.each([true, false])('patches only show_company_name=%s with cancellation', async show => {
    transport.patch.mockResolvedValue({ data: { ...profile, show_company_name: show, company_name: 'Private' } });
    const { signal } = new AbortController();
    expect(await updateSellerCompanyName(show, signal)).toEqual({ ...profile, show_company_name: show });
    expect(transport.patch).toHaveBeenCalledExactlyOnceWith('/profiles/seller/me', { show_company_name: show }, { signal });
  });
  it.each([
    [422, { field: 'show_company_name', message: 'Verify your company email.' }, 'Verify your company email.', { show_company_name: 'Verify your company email.' }],
    [422, { field: 'show_company_name' }, COMPANY_NAME_SAVE_FAILED, {}],
    [422, { field: 'show_company_name', message: null }, COMPANY_NAME_SAVE_FAILED, {}],
    [422, [{ loc: ['body', 'show_company_name'], msg: 'Extra input' }], COMPANY_NAME_SAVE_FAILED, {}],
    [422, { field: 'other', message: 'Other error' }, COMPANY_NAME_SAVE_FAILED, {}],
    [422, 'Invalid', COMPANY_NAME_SAVE_FAILED, {}],
    [422, { field: 'show_company_name', message: 42 }, COMPANY_NAME_SAVE_FAILED, {}],
    [404, 'Not found', COMPANY_NAME_SAVE_FAILED, {}],
    [403, 'Forbidden', COMPANY_NAME_SAVE_FAILED, {}],
    [500, 'Internal', COMPANY_NAME_SAVE_FAILED, {}],
    [503, 'Unavailable', COMPANY_NAME_SAVE_FAILED, {}],
  ])('maps company failure %s %j', async (status, detail, message, fieldErrors) => {
    transport.patch.mockRejectedValue(failure(status as number, detail));
    await expect(updateSellerCompanyName(true)).rejects.toMatchObject({ status, message, fieldErrors });
  });
  it('maps network failure to retry copy', async () => {
    transport.patch.mockRejectedValue(new Error('Network unavailable'));
    await expect(updateSellerCompanyName(true)).rejects.toMatchObject({ status: undefined, message: COMPANY_NAME_SAVE_FAILED, fieldErrors: {} });
  });
});
