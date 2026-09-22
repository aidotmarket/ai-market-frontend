// @vitest-environment jsdom

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateRedirect } from '@/lib/redirect';
import BuyButton, { parseCheckoutRefusal, SignedOutPurchase } from './BuyButton';
import { useAuthStore } from '@/store/auth';
import { ToastProvider } from './Toast';
import { AxiosError } from 'axios';

const ordersApi = vi.hoisted(() => ({ getMyOrders: vi.fn() }));
vi.mock('@/api/orders', () => ordersApi);
vi.mock('@/api/checkout', () => ({ createCheckout: vi.fn() }));
vi.mock('@/components/ListingLicenseDisclosure', async () => {
  const ReactModule = await import('react');
  return {
    default: ({ onVerificationChange }: { onVerificationChange?: (verified: boolean) => void }) => {
      ReactModule.useEffect(() => onVerificationChange?.(true), [onVerificationChange]);
      return <div>Verified licence materials</div>;
    },
  };
});

const structuredLicense = {
  code: 'standard' as const, version: '1.0', params: { ai_training: true },
  summary: ['Not the contract — read the full licence before accepting.'],
  full_text_url: '/licenses/standard/1.0/ai-training',
  download_url: '/licenses/standard/1.0/ai-training?download=1',
  sha256: 'a'.repeat(64), covenant_sha256: 'b'.repeat(64), rider_sha256: null,
};

describe('BuyButton licence acceptance', () => {
  beforeEach(() => {
    ordersApi.getMyOrders.mockResolvedValue([]);
    useAuthStore.setState({ isAuthenticated: true, user: { id: 'buyer-1' } as never });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    useAuthStore.setState({ isAuthenticated: false, user: null });
  });

  it('starts authority unchecked and shows the exact acceptance fields under flag-on data', async () => {
    render(<ToastProvider><BuyButton listingId="listing-1" slug="listing" price={20} pricingType="one_time" licenseDetails={structuredLicense} /></ToastProvider>);

    const authority = screen.getByRole('checkbox', { name: 'Confirm licence authority' }) as HTMLInputElement;
    expect(authority.checked).toBe(false);
    expect(screen.getByLabelText('Typed full name')).not.toBeNull();
    expect(screen.getByLabelText('Signer title')).not.toBeNull();
    expect(screen.getByLabelText('Business legal name')).not.toBeNull();
    expect(screen.getByLabelText('Jurisdiction (2-letter country code)')).not.toBeNull();
    expect((screen.getByRole('button', { name: 'Accept and continue to payment' }) as HTMLButtonElement).disabled).toBe(true);
    await waitFor(() => expect(ordersApi.getMyOrders).toHaveBeenCalled());
  });

  it('keeps all new acceptance fields hidden when structured flag-on data is absent', async () => {
    render(<ToastProvider><BuyButton listingId="listing-1" slug="listing" price={20} pricingType="one_time" license="legacy" /></ToastProvider>);

    expect(screen.queryByLabelText('Typed full name')).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Confirm licence authority' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Buy Now - $20.00' })).not.toBeNull();
    await waitFor(() => expect(ordersApi.getMyOrders).toHaveBeenCalled());
  });

  it('shows both conflicting legal identities and the reconciliation link', () => {
    const error = new AxiosError('conflict');
    error.response = {
      data: { detail: {
        code: 'LEGAL_IDENTITY_CONFLICT',
        billing: { source: 'stripe', legal_name: 'Buyer Holdings Ltd', jurisdiction: 'GB' },
        typed: { source: 'platform_terms', legal_name: 'Buyer Data Ltd', jurisdiction: 'IE' },
        reconciliation_link: '/dashboard/settings/legal-identity',
      } },
      status: 409, statusText: 'Conflict', headers: {}, config: {} as never,
    };

    expect(parseCheckoutRefusal(error)).toEqual({
      code: 'LEGAL_IDENTITY_CONFLICT',
      message: 'Your legal identity records conflict — stripe: Buyer Holdings Ltd (GB) versus platform_terms: Buyer Data Ltd (IE). Reconcile them before purchasing.',
      reconciliationUrl: '/dashboard/settings/legal-identity',
    });
  });
});

describe('SignedOutPurchase', () => {
  it('keeps Buy Now available and explains that sign-in does not charge the buyer', () => {
    const html = renderToStaticMarkup(
      <SignedOutPurchase
        slug="signed-out-dataset"
        price={49}
        pricingType="one_time"
        versionLabel="v2"
        accessWindowDays={30}
      />,
    );

    expect(html).toContain('href="/login?redirect=/listings/signed-out-dataset"');
    expect(html).toContain('href="/register?redirect=%2Flistings%2Fsigned-out-dataset"');
    expect(validateRedirect('/listings/signed-out-dataset')).toBe('/listings/signed-out-dataset');
    expect(validateRedirect('%2Flistings%2Fsigned-out-dataset')).toBe('/listings/signed-out-dataset');
    expect(html).toContain('Buy Now - $49.00');
    expect(html).not.toContain('disabled');
    expect(html).toContain('Following the sign-in link does not charge you.');
    expect(html).toContain('continue from the listing to review the checkout details and choose whether to confirm');
    expect(html).not.toContain('you will return here');
  });

  it('previews known purchase facts and omits unavailable facts', () => {
    const knownFacts = renderToStaticMarkup(
      <SignedOutPurchase
        slug="versioned-dataset"
        price={125.5}
        pricingType="subscription"
        versionLabel="2026-Q3"
        accessWindowDays={14}
        license="CC-BY-4.0"
        dataFormat="json_lines"
        fulfillmentType="file_download"
      />,
    );
    const unavailableFacts = renderToStaticMarkup(
      <SignedOutPurchase
        slug="legacy-dataset"
        price={10}
        pricingType="one_time"
        license={null}
        dataFormat={null}
        fulfillmentType={null}
      />,
    );

    expect(knownFacts).toContain('Listing price</dt><dd class="font-medium text-gray-900">$125.50');
    expect(knownFacts).toContain('Purchase type</dt><dd class="font-medium text-gray-900">Subscription');
    expect(knownFacts).toContain('Selected version</dt><dd class="font-medium text-gray-900">2026-Q3');
    expect(knownFacts).toContain('Download window</dt><dd class="font-medium text-gray-900">14 days after purchase');
    expect(knownFacts).toContain('License</dt><dd class="font-medium text-gray-900">CC-BY-4.0');
    expect(knownFacts).toContain('Data format</dt><dd class="font-medium text-gray-900">Json lines');
    expect(knownFacts).toContain('Fulfillment type</dt><dd class="font-medium text-gray-900">File download');
    expect(unavailableFacts).not.toContain('Selected version');
    expect(unavailableFacts).not.toContain('Download window');
    expect(unavailableFacts).not.toContain('License');
    expect(unavailableFacts).not.toContain('Data format');
    expect(unavailableFacts).not.toContain('Fulfillment type');
  });
});
