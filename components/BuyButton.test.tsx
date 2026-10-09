// @vitest-environment jsdom

import React from 'react';
import { webcrypto } from 'node:crypto';
import { renderToStaticMarkup } from 'react-dom/server';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateRedirect } from '@/lib/redirect';
import BuyButton, { parseCheckoutRefusal, SignedOutPurchase } from './BuyButton';
import { useAuthStore } from '@/store/auth';
import { ToastProvider } from './Toast';
import { AxiosError } from 'axios';
import { api } from '@/api/client';
import { createCheckout } from '@/api/checkout';
import { hashLicenseComponentBytes } from './ListingLicenseDisclosure';
import { checkoutReplayKey } from '@/lib/checkout-replay';
import {sha256} from '@/lib/customLicenseVerification';
import { readFileSync } from 'node:fs';

const listingsApi = vi.hoisted(() => ({ getListingOwnership: vi.fn() }));
vi.mock('@/api/listings', () => listingsApi);
beforeEach(() => {
  listingsApi.getListingOwnership.mockResolvedValue(false);
  useAuthStore.setState({ hydrated: true, isLoading: false });
});

async function renderBuyer(ui: React.ReactNode) {
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(ui); });
  return view;
}

const ordersApi = vi.hoisted(() => ({ getMyOrders: vi.fn() }));
const legalApi = vi.hoisted(() => ({ getTermsAcceptanceStatus: vi.fn(), getCurrentTerms: vi.fn(), acceptTerms: vi.fn() }));
vi.mock('@/api/orders', () => ordersApi);
vi.mock('@/api/legal', () => legalApi);
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
  fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'GB' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Confirm licence authority' }));
}

describe('BuyButton listing ownership', () => {
  beforeEach(() => {
    ordersApi.getMyOrders.mockResolvedValue([]);
    useAuthStore.setState({ isAuthenticated: true, user: { id: 'seller-1' } as never });
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
    useAuthStore.setState({ isAuthenticated: false, user: null });
  });
  const props = { listingId: 'listing-1', slug: 'listing', price: 20, pricingType: 'one_time' };

  it('hides all purchase controls while pending and shows the owner panel without licence acceptance', async () => {
    let resolve!: (value: boolean) => void;
    listingsApi.getListingOwnership.mockReturnValue(new Promise((done) => { resolve = done; }));
    const view = render(<React.StrictMode><ToastProvider><BuyButton {...props} licenseDetails={structuredLicense} /></ToastProvider></React.StrictMode>);
    expect(view.container.textContent).toBe('');
    expect(screen.queryByRole('button')).toBeNull();
    await act(async () => resolve(true));
    expect(screen.getByText('This is your listing')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByLabelText('Typed full name')).toBeNull();
    expect(ordersApi.getMyOrders).not.toHaveBeenCalled();
    view.rerender(<React.StrictMode><ToastProvider><BuyButton {...props} price={25} /></ToastProvider></React.StrictMode>);
    expect(listingsApi.getListingOwnership).toHaveBeenCalledOnce();
  });

  it('shows Buy for a non-owner, including a nonmatching sellerId', async () => {
    listingsApi.getListingOwnership.mockResolvedValue(false);
    await renderBuyer(<ToastProvider><BuyButton {...props} sellerId="another-seller" /></ToastProvider>);
    expect(screen.getByRole('button', { name: 'Buy Now - $20.00' })).toBeTruthy();
    expect(screen.queryByText('This is your listing')).toBeNull();
  });

  it('makes no ownership call for an anonymous viewer', () => {
    useAuthStore.setState({ isAuthenticated: false, user: null });
    render(<ToastProvider><BuyButton {...props} /></ToastProvider>);
    expect(screen.getByRole('link', { name: 'Buy Now - $20.00' })).toBeTruthy();
    expect(listingsApi.getListingOwnership).not.toHaveBeenCalled();
  });

  it.each([new Error('Network unavailable'), { response: { status: 404 } }])('falls back to Buy on an ownership API failure: %s', async (error) => {
    listingsApi.getListingOwnership.mockRejectedValue(error);
    await renderBuyer(<ToastProvider><BuyButton {...props} /></ToastProvider>);
    expect(screen.getByRole('button', { name: 'Buy Now - $20.00' })).toBeTruthy();
    expect(listingsApi.getListingOwnership).toHaveBeenCalledOnce();
  });

  it('recovers after three seconds and ignores a late owner response', async () => {
    vi.useFakeTimers();
    let resolve!: (value: boolean) => void;
    listingsApi.getListingOwnership.mockReturnValue(new Promise((done) => { resolve = done; }));
    const view = render(<ToastProvider><BuyButton {...props} /></ToastProvider>);
    expect(view.container.textContent).toBe('');
    await act(async () => { await vi.advanceTimersByTimeAsync(2999); });
    expect(screen.queryByRole('button')).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(screen.getByRole('button', { name: 'Buy Now - $20.00' })).toBeTruthy();
    await act(async () => resolve(true));
    expect(screen.queryByText('This is your listing')).toBeNull();
    expect(screen.getByRole('button', { name: 'Buy Now - $20.00' })).toBeTruthy();
  });

  it('keeps purchase and licence controls hidden from identity loading through owner resolution', async () => {
    useAuthStore.setState({ user: null });
    let resolve!: (value: boolean) => void;
    listingsApi.getListingOwnership.mockReturnValue(new Promise((done) => { resolve = done; }));
    const view = render(<ToastProvider><BuyButton {...props} licenseDetails={structuredLicense} /></ToastProvider>);
    expect(view.container.textContent).toBe('');
    expect(listingsApi.getListingOwnership).not.toHaveBeenCalled();
    await act(async () => useAuthStore.setState({ user: { id: 'seller-1' } as never }));
    expect(view.container.textContent).toBe('');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByLabelText('Typed full name')).toBeNull();
    await act(async () => resolve(true));
    expect(screen.getByText('This is your listing')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByLabelText('Typed full name')).toBeNull();
    expect(ordersApi.getMyOrders).not.toHaveBeenCalled();
  });

  it('bounds identity loading and does not restart the deadline when the user arrives', async () => {
    vi.useFakeTimers();
    useAuthStore.setState({ user: null });
    let resolve!: (value: boolean) => void;
    listingsApi.getListingOwnership.mockReturnValue(new Promise((done) => { resolve = done; }));
    render(<ToastProvider><BuyButton {...props} /></ToastProvider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
    await act(async () => useAuthStore.setState({ user: { id: 'seller-1' } as never }));
    expect(screen.queryByRole('button')).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(screen.getByRole('button', { name: 'Buy Now - $20.00' })).toBeTruthy();
    await act(async () => resolve(true));
    expect(screen.queryByText('This is your listing')).toBeNull();
  });

  it('falls back when the user record never loads, including after a late identity arrives', async () => {
    vi.useFakeTimers();
    useAuthStore.setState({ user: null });
    render(<ToastProvider><BuyButton {...props} /></ToastProvider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(screen.getByRole('button', { name: 'Buy Now - $20.00' })).toBeTruthy();
    await act(async () => useAuthStore.setState({ user: { id: 'seller-1' } as never }));
    expect(screen.getByRole('button', { name: 'Buy Now - $20.00' })).toBeTruthy();
    expect(listingsApi.getListingOwnership).not.toHaveBeenCalled();
  });

  it.each([
    { hydrated: false, isLoading: false },
    { hydrated: false, isLoading: true },
    { hydrated: true, isLoading: true },
  ])('hides controls on the first render and bounds stalled hydration: %s', async (authState) => {
    vi.useFakeTimers();
    useAuthStore.setState({ isAuthenticated: false, user: null, ...authState });
    const initialMarkup = renderToStaticMarkup(<ToastProvider><BuyButton {...props} licenseDetails={structuredLicense} /></ToastProvider>);
    expect(initialMarkup).not.toContain('Buy Now');
    expect(initialMarkup).not.toContain('Typed full name');
    const view = render(<ToastProvider><BuyButton {...props} sellerId="seller-1" licenseDetails={structuredLicense} /></ToastProvider>);
    expect(view.container.textContent).toBe('');
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByLabelText('Typed full name')).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(2999); });
    expect(view.container.textContent).toBe('');
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(screen.getByRole('link', { name: 'Buy Now - $20.00' })).toBeTruthy();
    await act(async () => useAuthStore.setState({
      isAuthenticated: true, user: { id: 'seller-1' } as never, hydrated: true, isLoading: false,
    }));
    expect(screen.queryByText('This is your listing')).toBeNull();
    expect(screen.getByRole('button', { name: 'Accept and continue to payment' })).toBeTruthy();
    expect(listingsApi.getListingOwnership).not.toHaveBeenCalled();
  });

  it('shows the signed-out flow as soon as hydration resolves anonymous', async () => {
    vi.useFakeTimers();
    useAuthStore.setState({ isAuthenticated: false, user: null, hydrated: false, isLoading: true });
    const view = render(<ToastProvider><BuyButton {...props} /></ToastProvider>);
    expect(view.container.textContent).toBe('');
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    await act(async () => useAuthStore.setState({ hydrated: true, isLoading: false }));
    expect(screen.getByRole('link', { name: 'Buy Now - $20.00' })).toBeTruthy();
    expect(listingsApi.getListingOwnership).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(screen.getByRole('link', { name: 'Buy Now - $20.00' })).toBeTruthy();
  });

  it.each([true, false])('resolves ownership after initial hydration: is_owner=%s', async (isOwner) => {
    useAuthStore.setState({ isAuthenticated: false, user: null, hydrated: false, isLoading: false });
    let resolve!: (value: boolean) => void;
    listingsApi.getListingOwnership.mockReturnValue(new Promise((done) => { resolve = done; }));
    const view = render(<ToastProvider><BuyButton {...props} /></ToastProvider>);
    expect(view.container.textContent).toBe('');
    await act(async () => useAuthStore.setState({ isLoading: true }));
    expect(view.container.textContent).toBe('');
    await act(async () => useAuthStore.setState({ isAuthenticated: true }));
    expect(view.container.textContent).toBe('');
    expect(listingsApi.getListingOwnership).not.toHaveBeenCalled();
    await act(async () => useAuthStore.setState({ user: { id: 'seller-1' } as never, hydrated: true, isLoading: false }));
    expect(view.container.textContent).toBe('');
    await act(async () => resolve(isOwner));
    if (isOwner) expect(screen.getByText('This is your listing')).toBeTruthy();
    else expect(screen.getByRole('button', { name: 'Buy Now - $20.00' })).toBeTruthy();
  });

  it('shares the mount deadline with hydration and ignores a late owner lookup', async () => {
    vi.useFakeTimers();
    useAuthStore.setState({ isAuthenticated: false, user: null, hydrated: false, isLoading: true });
    let resolve!: (value: boolean) => void;
    listingsApi.getListingOwnership.mockReturnValue(new Promise((done) => { resolve = done; }));
    render(<React.StrictMode><ToastProvider><BuyButton {...props} /></ToastProvider></React.StrictMode>);
    await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
    await act(async () => useAuthStore.setState({
      isAuthenticated: true, user: { id: 'seller-1' } as never, hydrated: true, isLoading: false,
    }));
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    expect(listingsApi.getListingOwnership).toHaveBeenCalledOnce();
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(screen.getByRole('button', { name: 'Buy Now - $20.00' })).toBeTruthy();
    await act(async () => resolve(true));
    expect(screen.queryByText('This is your listing')).toBeNull();
    expect(screen.getByRole('button', { name: 'Buy Now - $20.00' })).toBeTruthy();
  });

  it('clears the deadline on unmount and ignores a late response', async () => {
    vi.useFakeTimers();
    let resolve!: (value: boolean) => void;
    listingsApi.getListingOwnership.mockReturnValue(new Promise((done) => { resolve = done; }));
    const view = render(<ToastProvider><BuyButton {...props} /></ToastProvider>);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => resolve(true));
    expect(view.container.textContent).toBe('');
    expect(ordersApi.getMyOrders).not.toHaveBeenCalled();
  });

  it('keeps the matching sellerId path immediate without calling the ownership route', () => {
    render(<ToastProvider><BuyButton {...props} sellerId="seller-1" licenseDetails={structuredLicense} /></ToastProvider>);
    expect(screen.getByText('This is your listing')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    expect(listingsApi.getListingOwnership).not.toHaveBeenCalled();
  });

  it('checks again for a different authenticated user without showing the previous ownership result', async () => {
    listingsApi.getListingOwnership.mockResolvedValueOnce(true);
    await renderBuyer(<ToastProvider><BuyButton {...props} /></ToastProvider>);
    expect(screen.getByText('This is your listing')).toBeTruthy();
    listingsApi.getListingOwnership.mockResolvedValueOnce(false);
    await act(async () => useAuthStore.setState({ user: { id: 'buyer-2' } as never }));
    expect(screen.getByRole('button', { name: 'Buy Now - $20.00' })).toBeTruthy();
    expect(listingsApi.getListingOwnership).toHaveBeenCalledTimes(2);
  });

  it('checks the new listing and ignores the previous listing response', async () => {
    let resolveFirst!: (value: boolean) => void;
    let resolveSecond!: (value: boolean) => void;
    listingsApi.getListingOwnership
      .mockReturnValueOnce(new Promise((done) => { resolveFirst = done; }))
      .mockReturnValueOnce(new Promise((done) => { resolveSecond = done; }));
    const view = render(<ToastProvider><BuyButton {...props} /></ToastProvider>);
    view.rerender(<ToastProvider><BuyButton {...props} listingId="listing-2" /></ToastProvider>);
    await act(async () => resolveFirst(true));
    expect(view.container.textContent).toBe('');
    await act(async () => resolveSecond(false));
    expect(screen.getByRole('button', { name: 'Buy Now - $20.00' })).toBeTruthy();
    expect(listingsApi.getListingOwnership.mock.calls).toEqual([['listing-1'], ['listing-2']]);
  });
});

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

  it.each(['1.1', '1.2'])('keeps the same displayed buyer price and checkout request with served %s', async (version) => {
    legalApi.getCurrentTerms.mockResolvedValue({ terms_version: version, terms_hash_sha256: `hash-${version}` });
    legalApi.getTermsAcceptanceStatus.mockResolvedValue({ accepted: true, current_version: version, accepted_version: version });
    vi.mocked(createCheckout).mockResolvedValue({ checkout_url: 'https://invalid.example/' } as never);
    await renderBuyer(<ToastProvider><BuyButton listingId="listing-1" slug="listing" price={20} pricingType="one_time" /></ToastProvider>);
    await waitFor(() => expect((screen.getByRole('button', { name: 'Buy Now - $20.00' }) as HTMLButtonElement).disabled).toBe(false));
    if (version === '1.2') expect(await screen.findByText('The price shown is what you pay. No added card fee.')).toBeTruthy();
    else expect(screen.queryByText('The price shown is what you pay. No added card fee.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Buy Now - $20.00' }));
    await waitFor(() => expect(createCheckout).toHaveBeenCalledWith('listing-1', undefined, undefined));
  });

  it('starts authority unchecked and shows the exact acceptance fields under flag-on data', async () => {
    await renderBuyer(<ToastProvider><BuyButton listingId="listing-1" slug="listing" price={20} pricingType="one_time" licenseDetails={structuredLicense} /></ToastProvider>);

    const authority = screen.getByRole('checkbox', { name: 'Confirm licence authority' }) as HTMLInputElement;
    expect(authority.checked).toBe(false);
    expect(screen.getByLabelText('Typed full name')).not.toBeNull();
    expect(screen.getByLabelText('Signer title')).not.toBeNull();
    expect(screen.getByLabelText('Business legal name')).not.toBeNull();
    expect(screen.getByLabelText('Country')).not.toBeNull();
    expect((screen.getByRole('button', { name: 'Accept and continue to payment' }) as HTMLButtonElement).disabled).toBe(true);
    await waitFor(() => expect(ordersApi.getMyOrders).toHaveBeenCalled());
  });

  it('keeps all new acceptance fields hidden when structured flag-on data is absent', async () => {
    await renderBuyer(<ToastProvider><BuyButton listingId="listing-1" slug="listing" price={20} pricingType="one_time" license="legacy" /></ToastProvider>);

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

    await renderBuyer(<ToastProvider><BuyButton listingId="listing-1" slug="listing" price={20} pricingType="one_time" licenseDetails={verifiedLicense} /></ToastProvider>);
    completeAcceptanceForm();

    await waitFor(() => expect(screen.getAllByText('Fetched bytes match the server hash')).toHaveLength(2));
    completeAcceptanceForm();
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      '/licenses/standard/1.0/ai-training?download=1',
      '/licenses/marketplace-listing/1.0?download=1',
    ]);
    expect((screen.getByRole('button', { name: 'Accept and continue to payment' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it.each(['1.1', '1.2'])('carries the listing signer title and jurisdiction into the %s re-acceptance modal', async (version) => {
    const priorGate = process.env.NEXT_PUBLIC_TERMS_GATE_ENFORCE;
    process.env.NEXT_PUBLIC_TERMS_GATE_ENFORCE = 'true';
    legalApi.getTermsAcceptanceStatus.mockResolvedValue({ accepted: false, current_version: version, accepted_version: '1.1' });
    legalApi.getCurrentTerms.mockResolvedValue({ terms_version: version, terms_hash_sha256: `hash-${version}` });
    legalApi.acceptTerms.mockResolvedValue({ terms_version: version });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input).includes('marketplace-listing')
      ? documentResponse('Exact covenant text\n')
      : documentResponse('Exact licence text\n')));

    try {
      await renderBuyer(<ToastProvider><BuyButton listingId="listing-1" slug="listing" price={20} pricingType="one_time" licenseDetails={verifiedLicense} /></ToastProvider>);
      completeAcceptanceForm();
      await waitFor(() => expect(screen.getAllByText('Fetched bytes match the server hash')).toHaveLength(2));
    completeAcceptanceForm();
      fireEvent.click(screen.getByRole('button', { name: 'Accept and continue to payment' }));

      await screen.findByRole('heading', { name: 'Accept Terms and Conditions' });
      if (version === '1.2') {
        expect(await screen.findByText('The price shown is what you pay. No added card fee.')).toBeTruthy();
        expect(screen.getByLabelText(/I acknowledge the risk allocation and waivers in Section 13/)).toBeTruthy();
      }
      expect(screen.getByRole('button', { name: 'Accept and continue to payment' })).toBeTruthy();
      expect((screen.getByLabelText(/Full legal name/) as HTMLInputElement).value).toBe('Ada Buyer');
      expect((screen.getByLabelText(/^Title/) as HTMLInputElement).value).toBe('Director');
      expect((screen.getAllByLabelText(/Business legal name/)[1] as HTMLInputElement).value).toBe('Buyer Ltd');
      await waitFor(() => expect((document.getElementById('terms-jurisdiction') as HTMLSelectElement).value).toBe('GB'));
      for (const id of ['ack-box-1', 'ack-box-2', 'ack-box-3']) fireEvent.click(document.getElementById(id)!);
      fireEvent.click(screen.getByLabelText('I am authorized to bind this business'));
      fireEvent.click(screen.getByRole('button', { name: 'Accept and sign' }));
      await waitFor(() => expect(legalApi.acceptTerms).toHaveBeenCalledWith(expect.objectContaining({ context: 'buyer' })));
    } finally {
      if (priorGate === undefined) delete process.env.NEXT_PUBLIC_TERMS_GATE_ENFORCE;
      else process.env.NEXT_PUBLIC_TERMS_GATE_ENFORCE = priorGate;
    }
  });

  it.each([
    ['byte mismatch', async () => documentResponse('tampered licence bytes\n'), 'Hash mismatch — do not accept'],
    ['fetch failure', async () => { throw new Error('network unavailable'); }, 'Could not verify — do not accept'],
  ])('keeps acceptance disabled on %s', async (_case, licenseFetch, expectedStatus) => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input).includes('marketplace-listing')
      ? documentResponse('Exact covenant text\n')
      : licenseFetch()));

    await renderBuyer(<ToastProvider><BuyButton listingId="listing-1" slug="listing" price={20} pricingType="one_time" licenseDetails={verifiedLicense} /></ToastProvider>);
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
  const legacyPdfBytes = new TextEncoder().encode('%PDF-1.4 test');
  const covenantText = 'Exact covenant text\n';
  const riderText = readFileSync('tests/fixtures/s1735_rider_true.txt', 'utf8');
  const componentTexts = { license: customText, covenant: covenantText, rider: riderText };

  async function customLicense(legacyPdf = false) {
    const bytes = (text: string) => new TextEncoder().encode(text);
    const source_sha256 = await sha256(legacyPdf ? legacyPdfBytes : bytes(customText));
    const licenseBytes = legacyPdf
      ? bytes(`${JSON.stringify({content_type: 'application/pdf', source_sha256})}\n`)
      : bytes(customText);
    return {
      code: 'custom' as const, version: '1',
      params: { ai_training: true, source_sha256 },
      summary: ['Seller terms — read the full licence.'],
      full_text_url: '/api/v1/listings/listing-1/license-document',
      download_url: '/api/v1/listings/listing-1/license-document?download=1',
      sha256: await hashLicenseComponentBytes(licenseBytes, { kind: 'license', code: 'custom', version: '1', params: { ai_training: true, source_sha256 } }),
      covenant_sha256: await hashLicenseComponentBytes(bytes(covenantText), { kind: 'covenant', code: 'marketplace-listing', version: '1.0', params: {} }),
      rider_sha256: await hashLicenseComponentBytes(bytes(riderText), { kind: 'rider', code: 'ai-training', version: '1.0', params: { ai_training: true } }),
    };
  }

  async function renderCustom(failing?: keyof typeof componentTexts, failure?: 'mismatch' | 'error', headerChanges: Record<string, string | undefined> = {}, legacyPdf = false) {
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
    const license = await customLicense(legacyPdf);
    api.defaults.adapter = async (config) => {
      calls.push(config.url ?? '');
      expect(config.baseURL).toBe('https://api.ai.market/api/v1');
      expect(config.headers.Authorization).toBe('Bearer buyer-token');
      if (failing === 'license' && failure === 'error') throw new Error('document unavailable');
      const text = failing === 'license' && failure === 'mismatch' ? 'tampered custom text\n' : customText;
      const headers: Record<string, string> = {
        'content-type': legacyPdf ? 'application/pdf' : 'text/plain; charset=utf-8',
        'x-content-type-options': 'nosniff',
        'cache-control': 'private, no-store',
        'content-disposition': 'attachment; filename="listing-listing-1-licence.txt"',
        'x-license-source-sha256': license.params.source_sha256,
        'x-license-sha256': license.sha256,
      };
      for (const [key, value] of Object.entries(headerChanges)) {
        if (value === undefined) delete headers[key]; else headers[key] = value;
      }
      return { data: legacyPdf ? legacyPdfBytes.slice().buffer : new TextEncoder().encode(text).buffer, status: 200, statusText: 'OK', headers, config };
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const kind = url.includes('marketplace-listing') ? 'covenant' : 'rider';
      if (failing === kind && failure === 'error') throw new Error('document unavailable');
      return documentResponse(failing === kind && failure === 'mismatch' ? 'tampered document\n' : componentTexts[kind]);
    });
    vi.stubGlobal('fetch', fetchMock);
    useAuthStore.setState({ token: 'buyer-token' });
    const view = await renderBuyer(<ToastProvider><BuyButton listingId="listing-1" slug="listing" price={20} pricingType="one_time" licenseDetails={license} /></ToastProvider>);
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
      completeAcceptanceForm();
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
      expect(download.getAttribute('download')).toBe('custom-licence.txt');
      expect(document.querySelector('a[href*="/api/v1/"]')).toBeNull();
      const blob = createdBlobs.get(activated[0]);
      expect(blob?.type).toBe('text/plain; charset=utf-8');
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
      fireEvent.click(screen.getByRole('button',{name:'Read full licence'}));
      expect(screen.getByText(/<script>alert\(1\)<\/script>/).textContent).toContain('**bold**');
      fireEvent.keyDown(document,{key:'Escape'});
      expect((screen.getByRole('button', { name: 'Accept and continue to payment' }) as HTMLButtonElement).disabled).toBe(false);
      unmount();
      expect(revokeObjectURL).toHaveBeenCalledWith(activated[0]);
    } finally { restore(); }
  });

  it('downloads verified legacy PDF bytes with a .pdf filename', async () => {
    const {restore, createdBlobs, license} = await renderCustom(undefined, undefined, {}, true);
    try {
      await waitFor(() => expect(screen.getAllByText('Fetched bytes match the server hash')).toHaveLength(3));
      completeAcceptanceForm();
      const download = screen.getAllByRole('link', {name: 'Download exact document'})[0] as HTMLAnchorElement;
      expect(download.getAttribute('download')).toBe('custom-licence.pdf');
      const blob = createdBlobs.get(download.href);
      expect(blob?.type).toBe('application/pdf');
      const pdfBytes = new Uint8Array(await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(blob!);
      }));
      expect(Array.from(pdfBytes)).toEqual(Array.from(legacyPdfBytes));
      expect(await sha256(pdfBytes)).toBe(license.params.source_sha256);
      expect((screen.getByRole('button', {name: 'Accept and continue to payment'}) as HTMLButtonElement).disabled).toBe(false);
    } finally { restore(); }
  });

  it('refuses render and acceptance when CORS hides all three non-safelisted metadata headers', async () => {
    const {restore, createObjectURL} = await renderCustom(undefined, undefined, {
      'content-disposition': undefined,
      'x-license-source-sha256': undefined,
      'x-license-sha256': undefined,
    });
    try {
      await waitFor(() => expect(screen.getByText('Hash mismatch — do not accept')).not.toBeNull());
      expect(screen.queryByText(/<script>alert\(1\)<\/script>/)).toBeNull();
      expect(screen.queryByRole('link', {name: '/api/v1/listings/listing-1/license-document'})).toBeNull();
      expect((screen.getByRole('button', {name: 'Accept and continue to payment'}) as HTMLButtonElement).disabled).toBe(true);
      expect(createObjectURL).not.toHaveBeenCalled();
    } finally { restore(); }
  });

  it.each([
    ['missing content type', {'content-type': undefined}],
    ['wrong content type', {'content-type': 'text/plain'}],
    ['wrong charset', {'content-type': 'text/plain; charset=iso-8859-1'}],
    ['missing nosniff', {'x-content-type-options': undefined}],
    ['wrong nosniff', {'x-content-type-options': 'sniff'}],
    ['missing private cache', {'cache-control': undefined}],
    ['wrong private cache', {'cache-control': 'public'}],
    ['missing attachment', {'content-disposition': undefined}],
    ['wrong attachment filename', {'content-disposition': 'attachment; filename="wrong.txt"'}],
    ['missing source hash', {'x-license-source-sha256': undefined}],
    ['wrong source hash', {'x-license-source-sha256': '0'.repeat(64)}],
    ['missing licence hash', {'x-license-sha256': undefined}],
    ['wrong licence hash', {'x-license-sha256': '0'.repeat(64)}],
  ] as const)('refuses to render or accept custom text with %s', async (_label, headers) => {
    const {restore, createObjectURL} = await renderCustom(undefined, undefined, headers);
    try {
      await waitFor(() => expect(screen.getByText('Hash mismatch — do not accept')).not.toBeNull());
      expect(screen.queryByText(/<script>alert\(1\)<\/script>/)).toBeNull();
      expect((screen.getByRole('button', {name: 'Accept and continue to payment'}) as HTMLButtonElement).disabled).toBe(true);
      expect(createObjectURL).not.toHaveBeenCalled();
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

describe('one licence disclosure across purchase display states',()=>{
 beforeEach(()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(documentResponse('Licence text')));legalApi.getTermsAcceptanceStatus.mockResolvedValue({accepted:true});});
 afterEach(()=>{cleanup();vi.clearAllMocks();vi.unstubAllGlobals();useAuthStore.setState({isAuthenticated:false,user:null});});
 it.each(['signed out','buyer','purchased','disabled'])('shows one set of licence cards for %s',async state=>{
  useAuthStore.setState({isAuthenticated:state!=='signed out'&&state!=='disabled',user:state==='signed out'||state==='disabled'?null:{id:'buyer-1'} as never});
  ordersApi.getMyOrders.mockResolvedValue(state==='purchased'?[{id:'order-1',listing_id:'listing-1',status:'fulfilled'}]:[]);
  await renderBuyer(<ToastProvider><BuyButton listingId="listing-1" slug="listing" price={25} pricingType="one_time" licenseDetails={structuredLicense} disabledReason={state==='disabled'?'Superseded version':undefined}/></ToastProvider>);
  if(state==='purchased')await screen.findByRole('link',{name:'Access Data'});
  expect(screen.getAllByRole('region',{name:'Licence terms'})).toHaveLength(1);
  expect(screen.getAllByText('Licence summary — not the contract')).toHaveLength(1);
 });
});


describe('connector checkout handoff and domain purchase', () => {
  const props = { listingId: 'listing-1', slug: 'listing', price: 20, pricingType: 'one_time', licenseDetails: verifiedLicense };
  const handoffToken = ('a'.repeat(42) + 'A');
  beforeEach(() => {
    sessionStorage.clear();
    vi.stubEnv('NEXT_PUBLIC_CHECKOUT_DOMAIN_SERVICE_ENABLED', 'true');
    useAuthStore.setState({ isAuthenticated: true, user: { id: 'buyer-1' } as never });
    ordersApi.getMyOrders.mockResolvedValue([]);
    legalApi.getTermsAcceptanceStatus.mockResolvedValue({ accepted: true });
    legalApi.getCurrentTerms.mockResolvedValue({ version: '1.1' });
    vi.stubGlobal('crypto', webcrypto);
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => Promise.resolve(documentResponse(
      String(url).includes('marketplace-listing') ? 'Exact covenant text\n' : 'Exact licence text\n'
    ))));
    vi.mocked(createCheckout).mockReset();
  });
  afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
  async function accept(context?: { handoffToken: string }) {
    const view = await renderBuyer(<ToastProvider><BuyButton {...props} checkoutContext={context} /></ToastProvider>);
    await waitFor(() => expect((screen.getByRole('checkbox', { name: 'Confirm licence authority' }) as HTMLInputElement).disabled).toBe(false));
    expect(createCheckout).not.toHaveBeenCalled();
    expect((screen.getByRole('checkbox', { name: 'Confirm licence authority' }) as HTMLInputElement).checked).toBe(false);
    completeAcceptanceForm();
    await waitFor(() => expect((screen.getByRole('button', { name: 'Accept and continue to payment' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Accept and continue to payment' }));
    return view;
  }
  function error(status: number, detail: unknown) {
    const result = new AxiosError('checkout');
    result.response = { status, data: { detail }, statusText: 'refused', headers: {}, config: {} as never };
    return result;
  }
  it.each(['SELLER_PAYOUT_READINESS_UNKNOWN', 'SELLER_PAYOUT_NOT_READY', 'REFERENCE_DELIVERY_UNREADY'])('renders %s as a block with its web path and never redirects', async code => {
    vi.mocked(createCheckout).mockRejectedValue(error(409, { code, web_path: '/listings/listing-1' }));
    await accept({ handoffToken });
    await screen.findByRole('link', { name: 'Review listing' });
    expect(screen.getByRole('link', { name: 'Review listing' }).getAttribute('href')).toBe('/listings/listing-1');
    expect(screen.getAllByRole('alert').some(element => element.textContent?.includes('Checkout is blocked'))).toBe(true);
    expect((screen.getByRole('button', { name: 'Accept and continue to payment' }) as HTMLButtonElement).disabled).toBe(true);
    expect(createCheckout).toHaveBeenCalledOnce();
    expect(window.location.pathname).toBe('/');
  });
  it.each(['handoff', 'direct'])('retries 503 processing with the identical accepted %s request and never a new claim', async kind => {
    vi.mocked(createCheckout).mockRejectedValue(error(503, 'CHECKOUT_PROCESSING'));
    const view = await accept(kind === 'handoff' ? { handoffToken } : undefined);
    const retry = await screen.findByRole('button', { name: 'Retry checkout' });
    const first = vi.mocked(createCheckout).mock.calls[0];
    expect(first[2]).toMatchObject({ authority_confirmed: true, typed_name: 'Ada Buyer', jurisdiction: 'GB' });
    if (kind === 'handoff') expect(first[3]).toEqual({ handoffToken });
    else expect(first[3]).toEqual({ checkoutRequestId: expect.stringMatching(/^[a-f0-9-]{36}$/) });
    expect(screen.queryByLabelText('Typed full name')).toBeNull();
    view.rerender(<ToastProvider><BuyButton {...props} licenseDetails={undefined} disabledReason="Listing changed after reservation" checkoutContext={kind === 'handoff' ? { handoffToken } : undefined} /></ToastProvider>);
    fireEvent.click(retry);
    await waitFor(() => expect(createCheckout).toHaveBeenCalledTimes(2));
    expect(vi.mocked(createCheckout).mock.calls[1]).toEqual(first);
    expect(window.location.pathname).toBe('/');
  });
  it.each(['handoff', 'direct'])('replays a lost response after reservation across reload for %s without a new claim', async kind => {
    const claims = new Set<string>();
    vi.mocked(createCheckout).mockImplementation(async (_listing, _version, _acceptance, options) => {
      claims.add(options?.handoffToken || options?.checkoutRequestId || 'missing');
      throw new AxiosError('response lost after backend reservation', 'ERR_NETWORK');
    });
    const context = kind === 'handoff' ? { handoffToken } : undefined;
    const view = await accept(context);
    const first = vi.mocked(createCheckout).mock.calls[0];
    const retry = await screen.findByRole('button', { name: 'Retry checkout' });
    expect((retry as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(retry);
    await waitFor(() => expect(createCheckout).toHaveBeenCalledTimes(2));
    expect(vi.mocked(createCheckout).mock.calls[1]).toEqual(first);
    const key = checkoutReplayKey('buyer-1', props.listingId, undefined, context?.handoffToken);
    const stored = sessionStorage.getItem(key)!;
    expect(stored).toContain('Ada Buyer');
    expect(key + stored).not.toContain(handoffToken);
    expect(stored).not.toContain('csrf');
    view.unmount();
    await renderBuyer(<ToastProvider><BuyButton {...props} licenseDetails={undefined} disabledReason="Changed after reservation" checkoutContext={context} /></ToastProvider>);
    expect(createCheckout).toHaveBeenCalledTimes(2);
    fireEvent.click(await screen.findByRole('button', { name: 'Retry checkout' }));
    await waitFor(() => expect(createCheckout).toHaveBeenCalledTimes(3));
    expect(vi.mocked(createCheckout).mock.calls[2]).toEqual(first);
    expect(claims.size).toBe(1);
    vi.mocked(createCheckout).mockRejectedValue(error(409, { code: 'CHECKOUT_FAILED' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Retry checkout' }));
    await waitFor(() => expect(sessionStorage.getItem(key)).toBeNull());
    expect((screen.getByRole('button', { name: 'Retry checkout' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it.each([error(502, undefined), new Error('Connection closed')])('keeps an unconfirmed transport outcome retryable: %s', async failure => {
    vi.mocked(createCheckout).mockRejectedValue(failure);
    await accept();
    const first = vi.mocked(createCheckout).mock.calls[0];
    fireEvent.click(await screen.findByRole('button', { name: 'Retry checkout' }));
    await waitFor(() => expect(createCheckout).toHaveBeenCalledTimes(2));
    expect(vi.mocked(createCheckout).mock.calls[1]).toEqual(first);
  });
  it('retains the reserved direct UUID and acceptance through auth failure and session renewal', async () => {
    vi.mocked(createCheckout).mockRejectedValueOnce(new AxiosError('response lost', 'ERR_NETWORK'))
      .mockRejectedValueOnce(error(401, 'FIRST_PARTY_SESSION_REQUIRED'))
      .mockRejectedValue(error(503, 'CHECKOUT_PROCESSING'));
    await accept();
    const first = vi.mocked(createCheckout).mock.calls[0];
    const key = checkoutReplayKey('buyer-1', props.listingId);
    const frozen = sessionStorage.getItem(key);
    fireEvent.click(await screen.findByRole('button', { name: 'Retry checkout' }));
    await screen.findAllByText('Sign in again, then retry the same purchase.');
    expect(sessionStorage.getItem(key)).toBe(frozen);
    await act(async () => { useAuthStore.setState({ isAuthenticated: false }); });
    await act(async () => { useAuthStore.setState({ isAuthenticated: true, token: 'renewed-session' }); });
    fireEvent.click(await screen.findByRole('button', { name: 'Retry checkout' }));
    await waitFor(() => expect(createCheckout).toHaveBeenCalledTimes(3));
    expect(vi.mocked(createCheckout).mock.calls[1]).toEqual(first);
    expect(vi.mocked(createCheckout).mock.calls[2]).toEqual(first);
    expect(sessionStorage.getItem(key)).toBe(frozen);
  });
  it('retains a reconciliation-required claim across reload without offering a fresh purchase', async () => {
    vi.mocked(createCheckout).mockRejectedValueOnce(new AxiosError('response lost', 'ERR_NETWORK'))
      .mockRejectedValue(error(503, 'CHECKOUT_OPERATOR_RECONCILIATION_REQUIRED'));
    const view = await accept();
    const first = vi.mocked(createCheckout).mock.calls[0];
    const key = checkoutReplayKey('buyer-1', props.listingId);
    const frozen = sessionStorage.getItem(key);
    fireEvent.click(await screen.findByRole('button', { name: 'Retry checkout' }));
    await screen.findAllByText('This purchase requires operator reconciliation. Keep this checkout for recovery.');
    expect(sessionStorage.getItem(key)).toBe(frozen);
    expect((screen.getByRole('button', { name: 'Retry checkout' }) as HTMLButtonElement).disabled).toBe(true);
    view.unmount();
    await renderBuyer(<ToastProvider><BuyButton {...props} licenseDetails={undefined} /></ToastProvider>);
    expect(screen.queryByRole('button', { name: 'Accept and continue to payment' })).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'Retry checkout' }));
    await waitFor(() => expect(createCheckout).toHaveBeenCalledTimes(3));
    expect(vi.mocked(createCheckout).mock.calls[2]).toEqual(first);
    expect(sessionStorage.getItem(key)).toBe(frozen);
  });
  it('clears persisted identity on a successful terminal outcome', async () => {
    vi.mocked(createCheckout).mockResolvedValue({ checkout_url: 'https://checkout.stripe.com/c/pay/test', order_id: 'order' } as never);
    await accept();
    await waitFor(() => expect(createCheckout).toHaveBeenCalledOnce());
    expect(sessionStorage.getItem(checkoutReplayKey('buyer-1', props.listingId))).toBeNull();
  });
  it('retries the same acceptance with Web Storage disabled', async () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => { throw new Error('disabled'); },
      setItem: () => { throw new Error('disabled'); },
      removeItem: () => { throw new Error('disabled'); },
    });
    vi.mocked(createCheckout).mockRejectedValue(new AxiosError('network', 'ERR_NETWORK'));
    await accept();
    const first = vi.mocked(createCheckout).mock.calls[0];
    fireEvent.click(await screen.findByRole('button', { name: 'Retry checkout' }));
    await waitFor(() => expect(createCheckout).toHaveBeenCalledTimes(2));
    expect(vi.mocked(createCheckout).mock.calls[1]).toEqual(first);
  });
  it('keeps flag-off markup byte-identical with unset, false and unrecognised flags', async () => {
    vi.stubEnv('NEXT_PUBLIC_CHECKOUT_DOMAIN_SERVICE_ENABLED', '');
    const view = await renderBuyer(<ToastProvider><BuyButton {...props} /></ToastProvider>);
    await waitFor(() => expect((screen.getByRole('checkbox', { name: 'Confirm licence authority' }) as HTMLInputElement).disabled).toBe(false));
    const baseline = view.container.innerHTML;
    for (const value of ['false', 'TRUE']) {
      vi.stubEnv('NEXT_PUBLIC_CHECKOUT_DOMAIN_SERVICE_ENABLED', value);
      view.rerender(<ToastProvider><BuyButton {...props} /></ToastProvider>);
      expect(view.container.innerHTML).toBe(baseline);
    }
  });
});
