// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import type { MarketplacePublisher, PublisherPublicInfo } from '@/types';
import PublisherCard from './PublisherCard';
import { VERIFIED_DOMAIN_CHIP, VERIFIED_DOMAIN_EXPLANATION, verifiedDomainAriaLabel, SELLER_RATINGS_LABEL } from './publisherStrings';

afterEach(cleanup);
const anonymous: MarketplacePublisher = {
  schema_version: 'seller-presentation-v1', kind: 'marketplace', display_name: 'ai.market Seller', name_source: 'anonymous',
  stripe_connected: false, provider_observed_at: null, completed_order_count: 0, seller_rating_count: 0, seller_rating_average: null,
};
const purchaseScope = /This count covers genuine completed paid purchases across this seller’s public listings/;
const ratingScope = 'Only eligible buyer ratings from genuine completed paid purchases across this seller’s public listings count.';

describe('publisher presentation', () => {
  it('shows truthful anonymous newcomer states without a zero-star score', () => {
    render(<PublisherCard publisher={anonymous} />);
    expect(screen.getByText('ai.market Seller')).toBeTruthy();
    expect(screen.getByText('No completed purchases yet')).toBeTruthy();
    expect(screen.getByText(purchaseScope)).toBeTruthy();
    expect(screen.getByText(ratingScope)).toBeTruthy();
    expect(screen.getByText('No ratings yet')).toBeTruthy();
    expect(screen.queryByText(/Stripe connected|0\/5/)).toBeNull();
  });
  it('separates escaped seller text from the factual Stripe badge and seller ratings', () => {
    const { container } = render(<PublisherCard publisher={{ ...anonymous, display_name: '<b>Synthetic Co</b>', name_source: 'seller_supplied',
      stripe_connected: true, completed_order_count: 12, seller_rating_count: 9, seller_rating_average: 4.7 }} />);
    const name = screen.getByText('<b>Synthetic Co</b>');
    const badge = screen.getByText('Stripe connected');
    expect(container.querySelector('b')).toBeNull();
    expect(name.parentElement).not.toBe(badge.parentElement);
    expect(badge.getAttribute('title')).toBe('Seller connected a Stripe payout account. This does not certify company affiliation or data quality.');
    expect(badge.tabIndex).toBe(0);
    expect(screen.getByText('12 completed purchases')).toBeTruthy();
    expect(screen.getByText(purchaseScope)).toBeTruthy();
    expect(screen.getByText('4.7/5 from 9 ratings').getAttribute('aria-label')).toBe('Seller ratings');
  });
  it.each([false, null, undefined])('suppresses a Stripe badge for %s evidence', (stripe_connected) => {
    render(<PublisherCard publisher={{ ...anonymous, display_name: 'Synthetic Co', stripe_connected }} />);
    expect(screen.queryByText('Stripe connected')).toBeNull();
  });
  it('keeps factual evidence visible after name opt-out', () => {
    render(<PublisherCard publisher={{ ...anonymous, stripe_connected: true, completed_order_count: 2 }} />);
    expect(screen.getByText('ai.market Seller')).toBeTruthy();
    expect(screen.getByText('Stripe connected')).toBeTruthy();
    expect(screen.getByText('2 completed purchases')).toBeTruthy();
  });
  it('explains a single completed purchase when ratings are unknown', () => {
    render(<PublisherCard publisher={{ ...anonymous, completed_order_count: 1, seller_rating_count: null }} />);
    expect(screen.getByText('1 completed purchase')).toBeTruthy();
    expect(screen.getByText(purchaseScope)).toBeTruthy();
    expect(screen.queryByText(ratingScope)).toBeNull();
  });
  it('falls back to the anonymous name and never fabricates missing aggregates', () => {
    render(<PublisherCard publisher={{ kind: 'marketplace', schema_version: 'seller-presentation-v1', display_name: '' }} />);
    expect(screen.getByText('ai.market Seller')).toBeTruthy();
    expect(screen.queryByText(/purchases|ratings/)).toBeNull();
  });
  it('preserves the exact legacy flag-off card markup', () => {
    expect(renderToStaticMarkup(<PublisherCard publisher={{ display_name: 'ai.market Seller', trust_level: 'L1' }} />)).toBe(
      '<div class="rounded-xl border border-gray-200 p-6"><h3 class="font-semibold text-gray-900 mb-3">Publisher</h3><p class="text-sm text-gray-600">ai.market Seller</p></div>');
  });
  it.each([null, undefined])('omits an absent flag-off publisher (%s)', (publisher) => {
    expect(renderToStaticMarkup(<PublisherCard publisher={publisher} />)).toBe('');
  });
  it('shows only the source name even if a reference contains stray seller fields', () => {
    render(<PublisherCard publisher={{ ...anonymous, kind: 'reference', display_name: 'Synthetic public agency', stripe_connected: true } as PublisherPublicInfo} />);
    expect(screen.getByText('Synthetic public agency')).toBeTruthy();
    expect(screen.queryByText(/Stripe|purchases|ratings|ai.market Seller|supplied by the seller/)).toBeNull();
  });
  it('omits generated sample publishers entirely', () => {
    expect(renderToStaticMarkup(<PublisherCard publisher={{ ...anonymous, kind: 'generated_sample' }} />)).toBe('');
  });
});

describe('verified domain and rating presentation', () => {
  it('shows the approved focusable chip with its full explanation', () => {
    render(<PublisherCard publisher={{ ...anonymous, seller_domain_verified: true }} />);
    const chip = screen.getByText(VERIFIED_DOMAIN_CHIP);
    expect(chip.title).toBe(VERIFIED_DOMAIN_EXPLANATION);
    expect(chip.getAttribute('aria-label')).toBe(verifiedDomainAriaLabel());
    expect(chip.tabIndex).toBe(0);
    expect(chip.parentElement?.classList.contains('flex')).toBe(true);
    expect(chip.parentElement?.classList.contains('gap-2')).toBe(true);
    expect(chip.parentElement?.children.length).toBe(1);
  });
  it.each([false, null, undefined, 'true', 1])('requires strictly true domain evidence (%s)', (value) => {
    render(<PublisherCard publisher={{ ...anonymous, seller_domain_verified: value } as MarketplacePublisher} />);
    expect(screen.queryByText(VERIFIED_DOMAIN_CHIP)).toBeNull();
  });
  it.each([
    { ...anonymous, kind: 'reference' },
    { ...anonymous, kind: 'generated_sample' },
    { display_name: 'Legacy seller' },
  ])('never shows domain evidence on other publisher kinds: %j', publisher => {
    render(<PublisherCard publisher={{ ...publisher, seller_domain_verified: true } as PublisherPublicInfo} />);
    expect(screen.queryByText(VERIFIED_DOMAIN_CHIP)).toBeNull();
  });
  it('spaces both chips in one row, with Stripe first', () => {
    render(<PublisherCard publisher={{ ...anonymous, stripe_connected: true, seller_domain_verified: true }} />);
    const stripe = screen.getByText('Stripe connected');
    const domain = screen.getByText(VERIFIED_DOMAIN_CHIP);
    expect(stripe.parentElement).toBe(domain.parentElement);
    expect(domain.parentElement?.classList.contains('flex')).toBe(true);
    expect(domain.parentElement?.classList.contains('gap-2')).toBe(true);
    expect(Array.from(domain.parentElement!.children)).toEqual([stripe, domain]);
  });
  it('preserves the Stripe-only chip markup', () => {
    render(<PublisherCard publisher={{ ...anonymous, stripe_connected: true }} />);
    expect(screen.getByText('Stripe connected').outerHTML).toBe(
      '<span tabindex="0" title="Seller connected a Stripe payout account. This does not certify company affiliation or data quality." aria-label="Stripe connected. Seller connected a Stripe payout account. This does not certify company affiliation or data quality." class="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">Stripe connected</span>');
    expect(screen.queryByText(VERIFIED_DOMAIN_CHIP)).toBeNull();
  });
  it.each([
    [0, null, 'No ratings yet'], [1, 5, '5/5 from 1 rating'],
    [2, 4.5, '4.5/5 from 2 ratings'], [3, 4, '4/5 from 3 ratings'],
    [1, null, 'Seller ratings unavailable'],
  ])('renders count %s and average %s', (seller_rating_count, seller_rating_average, text) => {
    render(<PublisherCard publisher={{ ...anonymous, completed_order_count: null, seller_rating_count, seller_rating_average }} />);
    expect(screen.getByLabelText(SELLER_RATINGS_LABEL).textContent).toBe(text);
    expect(screen.getByText(ratingScope)).toBeTruthy();
    expect(screen.queryByText(purchaseScope)).toBeNull();
  });
  it.each([null, undefined])('omits ratings for unknown count %s', seller_rating_count => {
    render(<PublisherCard publisher={{ ...anonymous, seller_rating_count }} />);
    expect(screen.queryByLabelText(SELLER_RATINGS_LABEL)).toBeNull();
    expect(screen.queryByText(ratingScope)).toBeNull();
  });
});
