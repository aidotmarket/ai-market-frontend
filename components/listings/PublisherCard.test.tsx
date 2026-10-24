// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import type { MarketplacePublisher, PublisherPublicInfo } from '@/types';
import PublisherCard from './PublisherCard';

afterEach(cleanup);
const anonymous: MarketplacePublisher = {
  schema_version: 'seller-presentation-v1', kind: 'marketplace', display_name: 'ai.market Seller', name_source: 'anonymous',
  stripe_connected: false, provider_observed_at: null, completed_order_count: 0, seller_rating_count: 0, seller_rating_average: null,
};
describe('publisher presentation', () => {
  it('shows truthful anonymous newcomer states without a zero-star score', () => {
    render(<PublisherCard publisher={anonymous} />);
    expect(screen.getByText('ai.market Seller')).toBeTruthy();
    expect(screen.getByText('No completed purchases yet')).toBeTruthy();
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
