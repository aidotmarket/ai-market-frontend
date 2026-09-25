// @vitest-environment jsdom

import React from 'react';
import { webcrypto } from 'node:crypto';
import { renderToStaticMarkup } from 'react-dom/server';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateRedirect } from '@/lib/redirect';
import BuyButton, { parseCheckoutRefusal, SignedOutPurchase } from './BuyButton';
import { useAuthStore } from '@/store/auth';
import { ToastProvider } from './Toast';
import { AxiosError } from 'axios';
import { api } from '@/api/client';
import { hashLicenseComponentBytes } from './ListingLicenseDisclosure';
import {sha256} from '@/lib/customLicenseVerification';
import { readFileSync } from 'node:fs';

const ordersApi = vi.hoisted(() => ({ getMyOrders: vi.fn() }));
vi.mock('@/api/orders', () => ordersApi);
vi.mock('@/api/checkout', () => ({ createCheckout: vi.fn() }));

const structuredLicense = {
  code: 'standard' as const, version: '1.0', params: { ai_training: true },
  summary: ['Not the contract — read the full licence before accepting.'],
  full_text_url: '/licenses/standard/1.0/ai-training',
  download_url: '/licenses/standard/1.0/ai-training?download=1',
  sha256: 'a'.repeat(64), covenant_sha256: 'b'.repeat(64), rider_sha256: null,
};

const verifiedLicense = {
  ...structuredLicense,
  sha256: 'f91f4e012a318e5e709e8fe0b830b903bf8fbc05f17beab7bba2bb329af104e8',
  covenant_sha256: '2d900715ffc29f256a556f44b3ecf2e0efa01916e4a467d8add9a3ff124ea17e',
};

function documentResponse(text: string) {
  const bytes = new TextEncoder().encode(text);
  return { ok: true, arrayBuffer: async () => bytes.buffer, headers: new Headers({ 'content-type': 'text/plain' }) };
}

function completeAcceptanceForm() {
  fireEvent.change(screen.getByLabelText('Typed full name'), { target: { value: 'Ada Buyer' } });
  fireEvent.change(screen.getByLabelText('Signer title'), { target: { value: 'Director' } });
  fireEvent.change(screen.getByLabelText('Business legal name'), { target: { value: 'Buyer Ltd' } });
  fireEvent.change(screen.getByLabelText('Jurisdiction (2-letter country code)'), { target: { value: 'gb' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Confirm licence authority' }));
}

describe('BuyButton licence acceptance', () => {
  beforeEach(() => {
    ordersApi.getMyOrders.mockResolvedValue([]);
    useAuthStore.setState({ isAuthenticated: true, user: { id: 'buyer-1' } as never });
    vi.stubGlobal('crypto', webcrypto);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
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

  it('enables acceptance only after the real disclosure matches every fetched document byte hash', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => String(input).includes('marketplace-listing')
      ? documentResponse('Exact covenant text\n')
      : documentResponse('Exact licence text\n'));
    vi.stubGlobal('fetch', fetchMock);

    render(<ToastProvider><BuyButton listingId="listing-1" slug="listing" price={20} pricingType="one_time" licenseDetails={verifiedLicense} /></ToastProvider>);
    completeAcceptanceForm();

    await waitFor(() => expect(screen.getAllByText('Fetched bytes match the server hash')).toHaveLength(2));
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      '/licenses/standard/1.0/ai-training?download=1',
      '/licenses/marketplace-listing/1.0?download=1',
    ]);
    expect((screen.getByRole('button', { name: 'Accept and continue to payment' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it.each([
    ['byte mismatch', async () => documentResponse('tampered licence bytes\n'), 'Hash mismatch — do not accept'],
    ['fetch failure', async () => { throw new Error('network unavailable'); }, 'Could not verify — do not accept'],
  ])('keeps acceptance disabled on %s', async (_case, licenseFetch, expectedStatus) => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input).includes('marketplace-listing')
      ? documentResponse('Exact covenant text\n')
      : licenseFetch()));

    render(<ToastProvider><BuyButton listingId="listing-1" slug="listing" price={20} pricingType="one_time" licenseDetails={verifiedLicense} /></ToastProvider>);
    completeAcceptanceForm();

    await waitFor(() => expect(screen.getByText(expectedStatus)).not.toBeNull());
    expect((screen.getByRole('button', { name: 'Accept and continue to payment' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows both conflicting legal identities and the reconciliation link', () => {
    const error = new AxiosError('conflict');
    error.response = {
      data: { detail: {
        code: 'LEGAL_IDENTITY_CONFLICT',
        sources: [
          { source: 'billing_entity', legal_name: 'Buyer Holdings Ltd', jurisdiction: 'GB' },
          { source: 'typed', legal_name: 'Buyer Data Ltd', jurisdiction: 'IE' },
        ],
        reconciliation_url: '/settings/organization/legal-identity?org=org-1',
      } },
      status: 409, statusText: 'Conflict', headers: {}, config: {} as never,
    };

    expect(parseCheckoutRefusal(error)).toEqual({
      code: 'LEGAL_IDENTITY_CONFLICT',
      message: 'Your legal identity records conflict — billing_entity: Buyer Holdings Ltd (GB) versus typed: Buyer Data Ltd (IE). Reconcile them before purchasing.',
      reconciliationUrl: '/settings/organization/legal-identity?org=org-1',
    });
  });

  it('explains the inherited listing terms refusal in plain words', () => {
    const error = new AxiosError('conflict');
    error.response = {
      data: { detail: { code: 'SELLER_TERMS_ACCEPTANCE_PENDING' } },
      status: 409, statusText: 'Conflict', headers: {}, config: {} as never,
    };
    expect(parseCheckoutRefusal(error).message).toBe('This listing cannot be purchased until the seller accepts the current terms.');
  });

  const customText = '<script>alert(1)</script> **bold**\n\tCafé\n';
  const covenantText = 'Exact covenant text\n';
  const riderText = readFileSync('tests/fixtures/s1735_rider_true.txt', 'utf8');
  const componentTexts = { license: customText, covenant: covenantText, rider: riderText };

  async function customLicense() {
    const bytes = (text: string) => new TextEncoder().encode(text);
    const source_sha256 = await sha256(bytes(customText));
    return {
      code: 'custom' as const, version: '1',
      params: { ai_training: true, source_sha256 },
      summary: ['Seller terms — read the full licence.'],
      full_text_url: '/api/v1/listings/listing-1/license-document',
      download_url: '/api/v1/listings/listing-1/license-document?download=1',
      sha256: await hashLicenseComponentBytes(bytes(customText), { kind: 'license', code: 'custom', version: '1', params: { ai_training: true, source_sha256 } }),
      covenant_sha256: await hashLicenseComponentBytes(bytes(covenantText), { kind: 'covenant', code: 'marketplace-listing', version: '1.0', params: {} }),
      rider_sha256: await hashLicenseComponentBytes(bytes(riderText), { kind: 'rider', code: 'ai-training', version: '1.0', params: { ai_training: true } }),
    };
  }

  async function renderCustom(failing?: keyof typeof componentTexts, failure?: 'mismatch' | 'error') {
    const priorAdapter = api.defaults.adapter;
    const priorBaseUrl = api.defaults.baseURL;
    const priorApiUrl = process.env.NEXT_PUBLIC_API_URL;
    process.env.NEXT_PUBLIC_API_URL = 'https://api.ai.market';
    api.defaults.baseURL = 'https://api.ai.market/api/v1';
    const calls: string[] = [];
    const createdBlobs = new Map<string, Blob>();
    const createObjectURL = vi.fn((blob: Blob) => {
      const url = `blob:https://ai.market/verified-${createdBlobs.size + 1}`;
      createdBlobs.set(url, blob);
      return url;
    });
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', class extends URL {
      static createObjectURL = createObjectURL;
      static revokeObjectURL = revokeObjectURL;
    });
    api.defaults.adapter = async (config) => {
      calls.push(config.url ?? '');
      expect(config.baseURL).toBe('https://api.ai.market/api/v1');
      expect(config.headers.Authorization).toBe('Bearer buyer-token');
      if (failing === 'license' && failure === 'error') throw new Error('document unavailable');
      const text = failing === 'license' && failure === 'mismatch' ? 'tampered custom text\n' : customText;
      return { data: new TextEncoder().encode(text).buffer, status: 200, statusText: 'OK', headers: { 'content-type': 'text/plain' }, config };
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const kind = url.includes('marketplace-listing') ? 'covenant' : 'rider';
      if (failing === kind && failure === 'error') throw new Error('document unavailable');
      return documentResponse(failing === kind && failure === 'mismatch' ? 'tampered document\n' : componentTexts[kind]);
    });
    vi.stubGlobal('fetch', fetchMock);
    useAuthStore.setState({ token: 'buyer-token' });
    const license = await customLicense();
    const view = render(<ToastProvider><BuyButton listingId="listing-1" slug="listing" price={20} pricingType="one_time" licenseDetails={license} /></ToastProvider>);
    completeAcceptanceForm();
    return { calls, fetchMock, createdBlobs, createObjectURL, revokeObjectURL, license, unmount: view.unmount, restore: () => {
      api.defaults.adapter = priorAdapter;
      api.defaults.baseURL = priorBaseUrl;
      if (priorApiUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL;
      else process.env.NEXT_PUBLIC_API_URL = priorApiUrl;
    } };
  }

  it('activates both custom document links using the exact authenticated, verified bytes', async () => {
    const { calls, fetchMock, createdBlobs, createObjectURL, revokeObjectURL, license, unmount, restore } = await renderCustom();
    try {
      await waitFor(() => expect(screen.getAllByText('Fetched bytes match the server hash')).toHaveLength(3));
      expect(calls).toEqual(['/listings/listing-1/license-document?download=1']);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const canonical = screen.getByRole('link', { name: '/api/v1/listings/listing-1/license-document' }) as HTMLAnchorElement;
      const download = screen.getAllByRole('link', { name: 'Download exact document' })[0] as HTMLAnchorElement;
      const activated: string[] = [];
      for (const link of [canonical, download]) {
        link.addEventListener('click', (event) => {
          activated.push((event.currentTarget as HTMLAnchorElement).href);
          event.preventDefault();
        });
        fireEvent.click(link);
      }
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(activated).toEqual([createObjectURL.mock.results[0].value, createObjectURL.mock.results[0].value]);
      expect(canonical.textContent).toBe('/api/v1/listings/listing-1/license-document');
      expect(download.hasAttribute('download')).toBe(true);
      expect(document.querySelector('a[href*="/api/v1/"]')).toBeNull();
      const blob = createdBlobs.get(activated[0]);
      expect(blob?.type).toBe('text/plain');
      const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(blob!);
      });
      expect(Array.from(new Uint8Array(bytes))).toEqual(Array.from(new TextEncoder().encode(customText)));
      expect(await sha256(new Uint8Array(bytes))).toBe(license.params.source_sha256);
      expect(await hashLicenseComponentBytes(new Uint8Array(bytes),{kind:'license',code:'custom',version:'1',params:license.params})).toBe(license.sha256);
      expect(document.querySelector('script')).toBeNull();
      expect(screen.getByText(/<script>alert\(1\)<\/script>/).textContent).toContain('**bold**');
      expect((screen.getByRole('button', { name: 'Accept and continue to payment' }) as HTMLButtonElement).disabled).toBe(false);
      unmount();
      expect(revokeObjectURL).toHaveBeenCalledWith(activated[0]);
    } finally { restore(); }
  });

  it.each([
    ['license', 'mismatch'], ['license', 'error'],
    ['covenant', 'mismatch'], ['covenant', 'error'],
    ['rider', 'mismatch'], ['rider', 'error'],
  ] as const)('keeps acceptance disabled when %s has %s', async (kind, failure) => {
    const { restore } = await renderCustom(kind, failure);
    try {
      await waitFor(() => expect(screen.getByText(failure === 'mismatch' ? 'Hash mismatch — do not accept' : 'Could not verify — do not accept')).not.toBeNull());
      expect((screen.getByRole('button', { name: 'Accept and continue to payment' }) as HTMLButtonElement).disabled).toBe(true);
    } finally { restore(); }
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
