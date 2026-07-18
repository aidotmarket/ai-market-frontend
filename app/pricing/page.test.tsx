// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import PricingPage from './page';

describe('PricingPage', () => {
  it('publishes the complete seller and buyer fee schedule', () => {
    render(<PricingPage />);

    expect(screen.getByRole('heading', { name: 'One published fee schedule.' })).toBeTruthy();
    expect(screen.getByText('There are no listing fees.')).toBeTruthy();
    expect(screen.getByText(/deducts a 5% commission/)).toBeTruthy();
    expect(screen.getByText(/Stripe, stablecoin, or escrow fees/)).toBeTruthy();
    expect(screen.getByText(/sales tax, VAT, or similar tax/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Read Section 5/ }).getAttribute('href')).toBe(
      '/legal/terms#fees',
    );
  });
});
