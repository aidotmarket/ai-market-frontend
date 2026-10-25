// @vitest-environment jsdom
// Isolated component tests for hosted CI. No preview fixtures or live transports.
import React, { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError } from 'axios';
import BuyButton from './BuyButton';
import { checkoutReplayKey } from '@/lib/checkout-replay';
import type { ListingLicenseDetails } from '@/types';

const mocks = vi.hoisted(() => ({
  state: { user: { id: 'buyer-a' } as { id: string; org_id?: string }, isAuthenticated: true, hydrated: true, isLoading: false, token: 'synthetic' },
  terms: vi.fn(), checkout: vi.fn(), toast: vi.fn(), ownership: vi.fn(), orders: vi.fn(),
  forms: [] as { onAccepted: () => Promise<void>; prefill?: unknown; context?: unknown }[],
}));
vi.mock('@/store/auth', () => ({ useAuthStore: (select?: (s: typeof mocks.state) => unknown) => select ? select(mocks.state) : mocks.state }));
vi.mock('@/api/legal', () => ({ getTermsAcceptanceStatus: mocks.terms }));
vi.mock('@/api/checkout', () => ({ createCheckout: mocks.checkout }));
vi.mock('@/api/listings', () => ({ getListingOwnership: mocks.ownership }));
vi.mock('@/api/orders', () => ({ getMyOrders: mocks.orders }));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/components/legal/VersionedTermsCopy', () => ({ useServedTermsVersion: () => null }));
vi.mock('@/components/ListingLicenseDisclosure', () => ({ default: function Proof({ onVerificationChange }: { onVerificationChange?: (ok: boolean) => void }) {
  React.useEffect(() => { onVerificationChange?.(true); }, [onVerificationChange]);
  return null;
} }));
vi.mock('@/components/legal/TermsAcceptanceForm', () => ({ default: (props: typeof mocks.forms[number]) => {
  mocks.forms.push(props);
  return <button onClick={props.onAccepted}>Synthetic modal acceptance</button>;
} }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const props = { listingId: 'listing-a', slug: 'listing', price: 20, pricingType: 'one_time' };
const license: ListingLicenseDetails = {
  code: 'standard', version: '1.0', params: { ai_training: true }, summary: [],
  full_text_url: '/synthetic', download_url: '/synthetic', sha256: 'a'.repeat(64), covenant_sha256: 'b'.repeat(64), rider_sha256: null,
};
function refusal() {
  const error = new AxiosError('synthetic rejection');
  error.response = { status: 400, data: { detail: { code: 'OWN_LISTING' } } } as never;
  return error;
}
async function mount(domain: boolean) {
  vi.stubEnv('NEXT_PUBLIC_CHECKOUT_DOMAIN_SERVICE_ENABLED', String(domain));
  const ui = (extra = {}) => <StrictMode><BuyButton {...props} licenseDetails={domain ? license : undefined} {...extra} /></StrictMode>;
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(ui()); });
  return { ...view, change: async (extra = {}) => { await act(async () => view.rerender(ui(extra))); } };
}
async function buy(domain: boolean) {
  if (domain && screen.queryByLabelText('Typed full name')) {
    for (const [label, value] of [['Typed full name', 'Synthetic Buyer'], ['Signer title', 'Director'], ['Business legal name', 'Synthetic Ltd'], ['Country', 'GB']]) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
    fireEvent.click(screen.getByLabelText('Confirm licence authority'));
  }
  await act(async () => fireEvent.click(screen.getByRole('button', { name: domain ? /Accept and continue/ : /Buy Now/ })));
}
beforeEach(() => {
  sessionStorage.clear();
  mocks.state = { user: { id: 'buyer-a' }, isAuthenticated: true, hydrated: true, isLoading: false, token: 'synthetic' };
  mocks.forms.length = 0;
  mocks.terms.mockResolvedValue({ accepted: true });
  mocks.ownership.mockResolvedValue(false);
  mocks.orders.mockResolvedValue([]);
  vi.stubEnv('NEXT_PUBLIC_TERMS_GATE_ENFORCE', 'true');
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => '00000000-0000-4000-8000-000000000001') });
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected transport'); }));
});
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe.each([false, true])('purchase visit lifetime, domain=%s', domain => {
  it.each(['accepted', 'failure'] as const)('retires pending terms %s on unmount', async outcome => {
    const terms = deferred<{ accepted: boolean }>();
    mocks.terms.mockReturnValue(terms.promise);
    const view = await mount(domain);
    await buy(domain);
    expect(mocks.terms).toHaveBeenCalledOnce();
    view.unmount();
    await act(async () => { if (outcome === 'accepted') terms.resolve({ accepted: true }); else terms.reject(new Error('synthetic')); });
    expect(mocks.checkout).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
  });

  it.each(['success', 'rejected', 'unknown'] as const)('preserves recovery and suppresses late checkout %s after unmount/remount', async outcome => {
    const old = deferred<{ checkout_url: string }>();
    const current = deferred<{ checkout_url: string }>();
    mocks.checkout.mockReturnValueOnce(old.promise).mockReturnValue(current.promise);
    const view = await mount(domain);
    await buy(domain);
    expect(mocks.checkout).toHaveBeenCalledOnce();
    const first = mocks.checkout.mock.calls[0];
    const key = checkoutReplayKey('buyer-a', props.listingId);
    const stored = sessionStorage.getItem(key);
    if (domain) expect(stored).toContain('Synthetic Buyer');
    view.unmount();
    await mount(domain);
    if (domain) await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry checkout' })));
    else await buy(domain);
    expect(mocks.checkout).toHaveBeenCalledTimes(2);
    if (domain) expect(mocks.checkout.mock.calls[1]).toEqual(first);
    await act(async () => {
      if (outcome === 'success') old.resolve({ checkout_url: 'https://checkout.stripe.com/c/pay/synthetic' });
      else old.reject(outcome === 'rejected' ? refusal() : new Error('unknown'));
    });
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(key)).toBe(stored);
    expect((screen.getByRole('button', { name: domain ? /Checking checkout/ : /Opening Stripe/ }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => current.resolve({ checkout_url: 'invalid' }));
    expect(mocks.toast).toHaveBeenCalledOnce();
  });

  it.each(['account', 'listing', 'version', 'handoff', 'party'] as const)('retires terms when %s changes and never revives on return', async kind => {
    const old = deferred<{ accepted: boolean }>();
    mocks.terms.mockReturnValueOnce(old.promise).mockResolvedValue({ accepted: true });
    mocks.checkout.mockResolvedValue({ checkout_url: 'invalid' });
    const view = await mount(domain);
    await buy(domain);
    if (kind === 'account') mocks.state.user = { id: 'buyer-b' };
    if (kind === 'party') mocks.state.user = { id: 'buyer-a', org_id: 'org-b' };
    await view.change(kind === 'listing' ? { listingId: 'listing-b' } : kind === 'version' ? { versionId: 'v2' } : kind === 'handoff' ? { checkoutContext: { handoffToken: 'a'.repeat(42) + 'A' } } : {});
    mocks.state.user = { id: 'buyer-a' };
    await view.change();
    await act(async () => old.resolve({ accepted: true }));
    expect(mocks.checkout).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
    await buy(domain);
    expect(mocks.checkout).toHaveBeenCalledOnce();
  });

  it('keeps pending work on same-account object/token refresh and ordinary error feedback', async () => {
    const terms = deferred<{ accepted: boolean }>();
    mocks.terms.mockReturnValue(terms.promise);
    mocks.checkout.mockRejectedValue(refusal());
    const view = await mount(domain);
    await buy(domain);
    mocks.state.user = { ...mocks.state.user };
    mocks.state.token = 'synthetic-renewal';
    await view.change({ price: 21 });
    await act(async () => terms.resolve({ accepted: true }));
    expect(mocks.checkout).toHaveBeenCalledOnce();
    expect(mocks.toast).toHaveBeenCalledOnce();
    if (domain) expect(sessionStorage.length).toBe(0);
  });

  it('keeps an admitted purchase across same-account refresh and incidental metadata edits', async () => {
    const checkout = deferred<{ checkout_url: string }>();
    mocks.checkout.mockReturnValue(checkout.promise);
    const view = await mount(domain);
    await buy(domain);
    mocks.state.user = { ...mocks.state.user };
    mocks.state.token = 'synthetic-renewal';
    await view.change({ price: 21, licenseDetails: undefined, disabledReason: 'Changed after admission' });
    await act(async () => checkout.resolve({ checkout_url: 'invalid' }));
    expect(mocks.checkout).toHaveBeenCalledOnce();
    expect(mocks.toast).toHaveBeenCalledOnce();
    if (domain) {
      const first = mocks.checkout.mock.calls[0];
      expect(sessionStorage.getItem(checkoutReplayKey('buyer-a', props.listingId))).toContain('Synthetic Buyer');
      mocks.checkout.mockRejectedValue(new Error('unknown'));
      await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry checkout' })));
      expect(mocks.checkout.mock.calls[1]).toEqual(first);
    }
  });

  it('preserves ordinary current-visit success and releases its accepted recovery claim', async () => {
    mocks.checkout.mockResolvedValue({ checkout_url: 'https://checkout.stripe.com/c/pay/synthetic' });
    await mount(domain);
    await buy(domain);
    expect(mocks.checkout).toHaveBeenCalledOnce();
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
  });

  it('does not let old finally unlock a new checkout after an in-place context change', async () => {
    const old = deferred<never>();
    const current = deferred<never>();
    mocks.checkout.mockReturnValueOnce(old.promise).mockReturnValue(current.promise);
    const view = await mount(domain);
    await buy(domain);
    mocks.state.user = { id: 'buyer-b' };
    await view.change();
    await buy(domain);
    expect(mocks.checkout).toHaveBeenCalledTimes(2);
    await act(async () => old.reject(refusal()));
    expect(mocks.toast).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: /Opening Stripe/ }) as HTMLButtonElement).disabled).toBe(true);
    if (domain) expect(sessionStorage.getItem(checkoutReplayKey('buyer-b', props.listingId))).toContain('Synthetic Buyer');
    await act(async () => current.reject(refusal()));
    expect(mocks.toast).toHaveBeenCalledOnce();
  });

  it('retires a pending modal callback on departure, including after a later visit opens its modal', async () => {
    mocks.terms.mockResolvedValue({ accepted: false });
    const view = await mount(domain);
    await buy(domain);
    const old = mocks.forms.at(-1)!;
    if (domain) expect(old.prefill).toEqual({ signerFullName: 'Synthetic Buyer', signerTitle: 'Director', businessLegalName: 'Synthetic Ltd', jurisdiction: 'GB' });
    view.unmount();
    await mount(domain);
    await buy(domain);
    const current = mocks.forms.at(-1)!;
    await act(async () => old.onAccepted());
    expect(mocks.checkout).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Synthetic modal acceptance' })).toBeTruthy();
    mocks.checkout.mockResolvedValue({ checkout_url: 'invalid' });
    await act(async () => current.onAccepted());
    expect(mocks.checkout).toHaveBeenCalledOnce();
  });
});
