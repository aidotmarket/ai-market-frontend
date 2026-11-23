// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const serverTerms = vi.hoisted(() => ({ getPublicTermsVersion: vi.fn().mockResolvedValue('1.1') }));
vi.mock('@/lib/publicTermsVersion', () => serverTerms);
const mocks = vi.hoisted(() => ({ auth: { isAuthenticated: false } }));
vi.mock('@/store/auth', () => ({ useAuthStore: () => mocks.auth }));

import SellDataPage, { metadata } from './page';

afterEach(cleanup);

describe('SellDataPage', () => {
  it('opens with how allAI helps sellers list and sell their data', async () => {
    render(await SellDataPage());
    const heading = screen.getByRole('heading', { level: 1, name: 'Sell your data with help from allAI' });
    const openingCopy = heading.nextElementSibling?.textContent;

    expect(openingCopy).toMatch(/allAI walks you through creating a listing/);
    expect(openingCopy).toMatch(/buyer questions, negotiation, and checkout/);
    expect(`${heading.textContent} ${openingCopy}`).not.toMatch(
      /gateway|network policy|opaque (?:file )?IDs|keyed commitments|egress|firewall|canary|SHA-256/i,
    );
  });

  it.each([false, true])('offers both hosting choices when authenticated=%s', async (isAuthenticated) => {
    mocks.auth.isAuthenticated = isAuthenticated;
    const { container } = render(await SellDataPage());
    const section = screen.getByRole('region', { name: 'Choose where to keep your data' });
    const cards = within(section).getAllByRole('article');

    expect(cards).toHaveLength(2);
    expect(section.previousElementSibling?.querySelector('h1')).toBeTruthy();
    expect(section.nextElementSibling?.id).toBe('how-it-works');
    const hostingOptions = /your own AWS S3 bucket, your own Cloudflare R2 bucket, or on your own infrastructure with the self-hosted AIM Data Gateway/;
    expect(within(section).getByText(hostingOptions)).toBeTruthy();
    expect(within(cards[0]).getByRole('heading', { name: 'Connect your cloud storage' })).toBeTruthy();
    expect(within(cards[0]).getByRole('link', { name: isAuthenticated ? 'Open Seller Workspace' : 'Create Your Account' }).getAttribute('href')).toBe(
      isAuthenticated ? '/dashboard/seller-workspace' : '/register?redirect=%2Fdashboard%2Fseller-workspace'
    );
    expect(within(cards[0]).getByText(/read-only access/)).toBeTruthy();
    expect(within(cards[0]).getByText(/There is nothing to install/)).toBeTruthy();
    expect(within(cards[0]).getByText(/time-limited links/)).toBeTruthy();
    expect(within(cards[1]).getByRole('heading', { name: 'Set up AIM Data for self-hosting' })).toBeTruthy();
    expect(within(cards[1]).getByRole('link', { name: 'Set up a gateway' }).getAttribute('href')).toBe(
      isAuthenticated ? '/dashboard/gateways' : '/register?redirect=%2Fdashboard%2Fgateways'
    );
    expect(within(cards[1]).getByText(/Install the open-source AIM Data Gateway using Docker/)).toBeTruthy();
    expect(within(cards[1]).getByText(/automatically sends limited information to identify your files/)).toBeTruthy();
    expect(within(cards[1]).getByText(/confirm each file before it shares a description/)).toBeTruthy();
    expect(within(cards[1]).getByText(/These messages contain no data values/)).toBeTruthy();
    expect(within(cards[1]).getByText(/public sample/)).toBeTruthy();
    expect(within(cards[1]).getByText(/After purchase, buyers download the files directly through your gateway/)).toBeTruthy();
    expect(within(cards[1]).getByRole('link', { name: 'Technical details for your IT team' }).getAttribute('href')).toBe('/aim-data#network-requirements');

    const structuredData = JSON.parse(container.querySelector('script[type="application/ld+json"]')!.textContent!);
    expect(structuredData['@type']).toBe('Service');
    expect(structuredData.name).toBe('Sell data on ai.market');
    expect(structuredData.description).toBe(metadata.description);
    expect(metadata.title).toEqual({ absolute: 'Sell data on ai.market' });
    expect(metadata.description).toMatch(hostingOptions);
  });

  it.each([false, true])('shows exactly one primary final action when authenticated=%s', async (isAuthenticated) => {
    mocks.auth.isAuthenticated = isAuthenticated;
    render(await SellDataPage());
    const finalCta = within(screen.getByRole('region', { name: 'List your data' }));
    const links = finalCta.getAllByRole('link');
    const primaryAction = finalCta.getByRole('link', {
      name: isAuthenticated ? 'Open Seller Workspace' : 'Create Your Account',
    });

    expect(finalCta.getByText('allAI helps you get your first listing ready. List free and pay nothing until a sale clears.')).toBeTruthy();
    expect(links.map((link) => link.getAttribute('href'))).toEqual(
      isAuthenticated ? ['/dashboard/seller-workspace', '/dashboard/gateways', '/dashboard/listings'] : ['/register'],
    );
    expect(links.filter((link) => link.classList.contains('bg-[#0F6E56]'))).toEqual([primaryAction]);
  });
});

it('server-renders the 1.2 payout claim and international exception in the payout card', async () => {
  serverTerms.getPublicTermsVersion.mockResolvedValue('1.2');
  render(await SellDataPage());
  expect(screen.getByText('When a buyer purchases, the payment flows through ai.market. You keep the price less our 5% commission and the card fee, paid through Stripe 48 hours after the buyer confirms delivery. Sellers on international payout (USDC on Solana) are paid at least 30 days after the buyer confirms delivery.')).toBeTruthy();
  expect(screen.getByText("Sellers list free and pay nothing until a buyer pays. You're paid through Stripe once the buyer confirms delivery.")).toBeTruthy();
  expect(screen.queryByText(/90.day/)).toBeNull();
  expect(screen.queryByText('Sellers list free and pay nothing until a buyer pays. Stripe handles the payout.')).toBeNull();
});
