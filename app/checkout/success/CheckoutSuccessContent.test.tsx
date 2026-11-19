// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import CheckoutSuccessContent from './CheckoutSuccessContent';

const mocks = vi.hoisted(() => ({ sessionId: null as string | null, verifyCheckout: vi.fn() }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(mocks.sessionId ? { session_id: mocks.sessionId } : {}) }));
vi.mock('@/api/checkout', () => ({ verifyCheckout: mocks.verifyCheckout }));
beforeEach(() => { mocks.sessionId = null; mocks.verifyCheckout.mockReset(); });
afterEach(cleanup);

function expectRecoveryLinks() {
  expect(screen.getByRole('link', { name: 'My purchases' }).getAttribute('href')).toBe('/dashboard/orders');
  expect(screen.getByRole('link', { name: 'Contact support' }).getAttribute('href')).toBe('mailto:support@ai.market');
}

it('explains a missing checkout and offers purchase and support links without a verification call', async () => {
  render(<CheckoutSuccessContent />);
  expect(await screen.findByRole('heading', { name: "We couldn't find this checkout" })).toBeTruthy();
  expect(screen.getByText("If you paid, your purchase will appear in My purchases shortly. If it doesn't, contact support.")).toBeTruthy();
  expectRecoveryLinks();
  expect(mocks.verifyCheckout).not.toHaveBeenCalled();
});

it('shows safe recovery copy for genuine verification failures without exposing server text', async () => {
  mocks.sessionId = 'checkout-1';
  mocks.verifyCheckout.mockRejectedValue(new Error('Private server failure'));
  render(<CheckoutSuccessContent />);
  expect(await screen.findByRole('heading', { name: "We couldn't confirm this payment yet" })).toBeTruthy();
  expect(screen.getByText("If you paid, your purchase will appear in My purchases shortly. If it doesn't, contact support.")).toBeTruthy();
  expect(screen.queryByText('Private server failure')).toBeNull();
  expectRecoveryLinks();
  expect(mocks.verifyCheckout).toHaveBeenCalledOnce();
});
