// @vitest-environment jsdom

import { createHash } from 'node:crypto';
import { renderToStaticMarkup } from 'react-dom/server';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import PricingPage from './page';

const serverTerms = vi.hoisted(() => ({ getPublicTermsVersion: vi.fn() }));
vi.mock('@/lib/publicTermsVersion', () => serverTerms);
const legal = vi.hoisted(() => ({ getCurrentTerms: vi.fn() }));
vi.mock('@/api/legal', () => legal);
beforeEach(() => { serverTerms.getPublicTermsVersion.mockResolvedValue('1.1'); legal.getCurrentTerms.mockResolvedValue({ terms_version: '1.1' }); });
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe('PricingPage', () => {
  it('publishes the complete seller and buyer fee schedule', async () => {
    render(await PricingPage());

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

it('switches 1.2 card claims to the approved seller-bears text', async () => {
  serverTerms.getPublicTermsVersion.mockResolvedValue('1.2');
  legal.getCurrentTerms.mockResolvedValue({ terms_version: '1.2' });
  render(await PricingPage());
  expect((await screen.findAllByText(/no added seller-sale card Processing fee/)).length).toBeGreaterThan(0);
  expect(screen.queryByText('List free. Keep 95% when data sells.')).toBeNull();
  expect(screen.queryByText(/Stripe, stablecoin, or escrow fees/)).toBeNull();
  expect(screen.getAllByText(/normally 95%, subject to cent rounding/).length).toBeGreaterThan(0);
});

it('keeps served 1.1 pricing text exactly at the fda22fca base snapshot', async () => {
  const container = document.createElement('div');
  container.innerHTML = renderToStaticMarkup(await PricingPage());
  const text = container.textContent!.replace(/\s+/gu, ' ').trim();
  expect(createHash('sha256').update(text).digest('hex')).toBe('78c3b2b6aec3ae1c8f09d753bcaddd1c0af99b794c8c5053fcc2babeac642457');
});
