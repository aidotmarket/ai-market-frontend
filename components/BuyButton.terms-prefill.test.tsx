// @vitest-environment jsdom

import React from 'react';
import { webcrypto } from 'node:crypto';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import BuyButton from './BuyButton';
import { ToastProvider } from './Toast';
import type { ListingLicenseDetails } from '@/types';

const mocks = vi.hoisted(() => ({
  state: {
    user: { id: 'synthetic-prefill-buyer', first_name: 'Account', last_name: 'Default', company_name: 'Account Default Ltd' },
    isAuthenticated: true, hydrated: true, isLoading: false,
  },
  status: vi.fn(), current: vi.fn(), acceptTerms: vi.fn(), checkout: vi.fn(),
  ownership: vi.fn(), orders: vi.fn(), request: vi.fn(),
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: (select?: (state: typeof mocks.state) => unknown) => select ? select(mocks.state) : mocks.state,
}));
vi.mock('@/api/legal', () => ({
  getTermsAcceptanceStatus: mocks.status, getCurrentTerms: mocks.current, acceptTerms: mocks.acceptTerms,
}));
// This boundary covers both domain and legacy checkout dispatch.
vi.mock('@/api/checkout', () => ({ createCheckout: mocks.checkout }));
vi.mock('@/api/listings', () => ({ getListingOwnership: mocks.ownership }));
vi.mock('@/api/orders', () => ({ getMyOrders: mocks.orders }));
vi.mock('@/api/client', () => ({ api: { get: mocks.request, post: mocks.request, request: mocks.request } }));

// Same synthetic document bytes and hashes used by BuyButton.test.tsx;
// the real disclosure must verify them before licence authority is enabled.
const license: ListingLicenseDetails = {
  code: 'standard', version: '1.0', params: { ai_training: true }, summary: [],
  full_text_url: '/licenses/standard/1.0/ai-training',
  download_url: '/licenses/standard/1.0/ai-training?download=1',
  sha256: 'f91f4e012a318e5e709e8fe0b830b903bf8fbc05f17beab7bba2bb329af104e8',
  covenant_sha256: '2d900715ffc29f256a556f44b3ecf2e0efa01916e4a467d8add9a3ff124ea17e',
  rider_sha256: null,
};
const documents: Record<string, string> = {
  [license.download_url]: 'Exact licence text\n',
  '/licenses/marketplace-listing/1.0?download=1': 'Exact covenant text\n',
};

beforeEach(() => {
  sessionStorage.clear();
  vi.stubEnv('NEXT_PUBLIC_TERMS_GATE_ENFORCE', 'true');
  vi.stubGlobal('crypto', webcrypto);
  mocks.ownership.mockResolvedValue(false);
  mocks.orders.mockResolvedValue([]);
  mocks.status.mockResolvedValue({ accepted: false, current_version: '1.2', accepted_version: null });
  mocks.current.mockResolvedValue({ terms_version: '1.2', terms_hash_sha256: 'a'.repeat(64) });
  for (const boundary of [mocks.acceptTerms, mocks.checkout, mocks.request]) {
    boundary.mockImplementation(() => { throw new Error('Unexpected acceptance or financial transport'); });
  }
  vi.spyOn(XMLHttpRequest.prototype, 'send').mockImplementation(() => { throw new Error('Unexpected HTTP/provider request'); });
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const text = documents[String(input)];
    if (text === undefined) throw new Error(`Unexpected document/financial fetch: ${String(input)}`);
    const bytes = new TextEncoder().encode(text);
    return { ok: true, arrayBuffer: async () => bytes.buffer, headers: new Headers({ 'content-type': 'text/plain' }) };
  }));
});

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it.each([false, true])('preserves listing signer details in the real Terms prompt without checkout (domain=%s)', async domain => {
  vi.stubEnv('NEXT_PUBLIC_CHECKOUT_DOMAIN_SERVICE_ENABLED', String(domain));
  await act(async () => {
    render(<ToastProvider><BuyButton listingId="synthetic-prefill-listing" slug="synthetic-prefill" price={20} pricingType="one_time" licenseDetails={license} /></ToastProvider>);
  });

  const authority = await screen.findByRole('checkbox', { name: 'Confirm licence authority' });
  await waitFor(() => expect((authority as HTMLInputElement).disabled).toBe(false));
  expect(screen.getAllByText('Fetched bytes match the server hash')).toHaveLength(2);
  for (const [label, value] of [
    ['Typed full name', 'Maxwell Synthetic Prefill Buyer'],
    ['Signer title', 'President'],
    ['Business legal name', 'Synthetic Prefill Research Ltd'],
    ['Country', 'GB'],
  ]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
  fireEvent.click(authority);
  const purchase = screen.getByRole('button', { name: 'Accept and continue to payment' });
  await waitFor(() => expect((purchase as HTMLButtonElement).disabled).toBe(false));
  await act(async () => { fireEvent.click(purchase); });

  expect(await screen.findByRole('heading', { name: 'Accept Terms and Conditions' })).toBeTruthy();
  const sign = screen.getByRole('button', { name: 'Accept and sign' });
  const prompt = within(sign.closest('form')!);
  // Only listing fields were edited: these values must travel through BuyButton
  // and the real useTermsGate to the real TermsAcceptanceForm.
  expect((prompt.getByLabelText(/^Title\s*\*/) as HTMLInputElement).value).toBe('President');
  expect((prompt.getByLabelText(/^Full legal name/) as HTMLInputElement).value).toBe('Maxwell Synthetic Prefill Buyer');
  expect((prompt.getByLabelText(/^Business legal name/) as HTMLInputElement).value).toBe('Synthetic Prefill Research Ltd');
  expect((await prompt.findByLabelText(/^Country/) as HTMLSelectElement).value).toBe('GB');
  expect(prompt.getAllByRole('checkbox').every(box => !(box as HTMLInputElement).checked)).toBe(true);
  expect((sign as HTMLButtonElement).disabled).toBe(true);
  expect(mocks.status).toHaveBeenCalledExactlyOnceWith({ scope: 'organization', party_id: mocks.state.user.id });
  expect(mocks.ownership).toHaveBeenCalledWith('synthetic-prefill-listing');
  expect(mocks.orders).toHaveBeenCalledOnce();

  function expectNoAcceptanceOrCheckout() {
    expect(mocks.acceptTerms).not.toHaveBeenCalled();
    expect(mocks.checkout).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
    expect(XMLHttpRequest.prototype.send).not.toHaveBeenCalled();
    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url)).sort()).toEqual(Object.keys(documents).sort());
    expect(sessionStorage.length).toBe(0);
  }
  expectNoAcceptanceOrCheckout();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Close' })); });
  expect(screen.queryByRole('heading', { name: 'Accept Terms and Conditions' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Accept and sign' })).toBeNull();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Dismiss' })); });
  expect(screen.queryByRole('link', { name: 'Review and accept' })).toBeNull();
  expectNoAcceptanceOrCheckout();
});
