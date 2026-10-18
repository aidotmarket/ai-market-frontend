// @vitest-environment jsdom

import type { AnchorHTMLAttributes } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DataVerificationPaymentMethod from './DataVerificationPaymentMethod';
import { getVerificationReturn, saveVerificationReturn } from '@/lib/dataVerificationReturn';

const calls = vi.hoisted(() => ({
  readiness: vi.fn(),
  create: vi.fn(),
  navigate: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: calls.replace }) }));
vi.mock('next/link', () => ({
  default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />,
}));
vi.mock('@/store/auth', () => ({
  useAuthStore: (select: (state: unknown) => unknown) =>
    select({ user: { id: 'seller', reauth_method: 'totp' } }),
}));
// Exercise the actual component's handoff callback without loading auth modules.
vi.mock('@/app/dashboard/settings/ReauthModal', () => ({
  default: ({ isOpen, onSuccess }: { isOpen: boolean; onSuccess: (token: string) => Promise<void> }) =>
    isOpen ? <button onClick={() => void onSuccess('test-reauth-token')}>Confirm test reauth</button> : null,
}));
vi.mock('@/api/dataVerificationPayin', () => ({
  getDataVerificationPayInReadiness: calls.readiness,
  createDataVerificationPayInSetupSession: calls.create,
  navigateToDataVerificationPayInSetup: calls.navigate,
  isDataVerificationPayInUnavailable: () => false,
  isOpaqueCheckoutSessionId: () => false,
  isOpaqueSetupAttemptId: () => false,
  reconcileDataVerificationPayInSetupSession: vi.fn(),
}));

const key = 'data-verification:listing-return';
const destination = { sellerId: 'seller', listingId: 'listing/with ?#%' };
const checkoutUrl = 'https://checkout.stripe.com/mock';

beforeEach(() => {
  vi.resetAllMocks();
  window.sessionStorage.clear();
  calls.readiness.mockResolvedValue({ state: 'setup_required' });
  calls.create.mockResolvedValue({ checkout_url: checkoutUrl, setup_attempt_id: 'test-attempt' });
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network forbidden'); }));
});

afterEach(() => {
  cleanup();
  expect(fetch).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function startSetup() {
  fireEvent.click(await screen.findByRole('button', { name: 'Add payment method' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm test reauth' }));
  await waitFor(() => expect(calls.create).toHaveBeenCalledExactlyOnceWith('test-reauth-token'));
}

async function expectHandoff() {
  await waitFor(() => expect(calls.navigate).toHaveBeenCalledExactlyOnceWith(checkoutUrl));
  expect(screen.getByRole('alert', { name: 'Payment-method error' }).textContent).toBe('');
}

describe('optional listing-return storage during hosted setup', () => {
  it.each(['setItem', 'removeItem'] as const)('continues when sessionStorage.%s throws', async method => {
    saveVerificationReturn(destination);
    const blocked = vi.spyOn(Storage.prototype, method).mockImplementation(() => {
      throw new DOMException('Storage disabled', 'SecurityError');
    });
    render(<DataVerificationPaymentMethod returnToListing={method === 'setItem' ? destination : undefined} />);

    await startSetup();
    await expectHandoff();
    expect(blocked).toHaveBeenCalledExactlyOnceWith(
      ...(method === 'setItem' ? [key, JSON.stringify(destination)] : [key])
    );
  });

  it('stores exactly the listing destination when storage works', async () => {
    render(<DataVerificationPaymentMethod returnToListing={destination} />);
    await startSetup();
    await expectHandoff();
    expect(window.sessionStorage.getItem(key)).toBe(JSON.stringify(destination));
    expect(getVerificationReturn('seller')).toBe('/dashboard/listings/listing%2Fwith%20%3F%23%25');
    expect(getVerificationReturn('another-seller')).toBeNull();
  });

  it('clears a previous destination when setup has no listing destination', async () => {
    saveVerificationReturn(destination);
    render(<DataVerificationPaymentMethod />);
    await startSetup();
    await expectHandoff();
    expect(window.sessionStorage.getItem(key)).toBeNull();
    expect(getVerificationReturn('seller')).toBeNull();
  });

  it.each([destination, undefined])('does not navigate or change storage when setup rejects (%j)', async returnToListing => {
    saveVerificationReturn(destination);
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const clear = vi.spyOn(Storage.prototype, 'removeItem');
    calls.create.mockRejectedValueOnce(new Error('Private setup failure'));
    render(<DataVerificationPaymentMethod returnToListing={returnToListing} />);

    await startSetup();
    await screen.findByText('We could not confirm your payment method. No verification charge was made. Select Back to verification to start again.');
    expect(calls.navigate).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(key)).toBe(JSON.stringify(destination));
    expect(document.body.textContent).not.toContain('Private setup failure');
  });
});
