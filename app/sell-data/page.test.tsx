// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ auth: { isAuthenticated: false } }));
vi.mock('@/store/auth', () => ({ useAuthStore: () => mocks.auth }));

import SellDataPage, { metadata } from './page';

afterEach(cleanup);

describe('SellDataPage', () => {
  it.each([false, true])('offers both hosting choices when authenticated=%s', (isAuthenticated) => {
    mocks.auth.isAuthenticated = isAuthenticated;
    const { container } = render(<SellDataPage />);
    const section = screen.getByRole('region', { name: 'Where is your data?' });
    const cards = within(section).getAllByRole('article');

    expect(cards).toHaveLength(2);
    expect(section.previousElementSibling?.querySelector('h1')).toBeTruthy();
    expect(section.nextElementSibling?.id).toBe('how-it-works');
    expect(within(section).getByText('Is your data hosted in the cloud on AWS or Cloudflare, or will you host it on your own servers?')).toBeTruthy();
    expect(within(cards[0]).getByRole('heading', { name: 'My data is in the cloud, or I want to put it in the cloud.' })).toBeTruthy();
    expect(within(cards[0]).getByRole('link', { name: isAuthenticated ? 'Open Seller Workspace' : 'Create Your Account' }).getAttribute('href')).toBe(
      isAuthenticated ? '/dashboard/seller-workspace' : '/register?redirect=%2Fdashboard%2Fseller-workspace'
    );
    expect(within(cards[0]).getByText(/Connect the bucket read-only/)).toBeTruthy();
    expect(within(cards[0]).getByText(/time-limited links/)).toBeTruthy();
    expect(within(cards[1]).getByRole('heading', { name: 'I will host it on my own infrastructure.' })).toBeTruthy();
    expect(within(cards[1]).getByRole('link', { name: 'Set up AIM Data' }).getAttribute('href')).toBe('/aim-data');
    expect(within(cards[1]).getByText(/runs sandboxed/)).toBeTruthy();
    expect(within(cards[1]).getByText(/AIM Data must run all the time/)).toBeTruthy();

    const structuredData = JSON.parse(container.querySelector('script[type="application/ld+json"]')!.textContent!);
    expect(structuredData['@type']).toBe('Service');
    expect(structuredData.name).toBe('Sell data on ai.market');
    expect(structuredData.description).toBe(metadata.description);
    expect(metadata.title).toEqual({ absolute: 'Sell data on ai.market' });
    expect(metadata.description).toContain('AWS S3 or Cloudflare R2');
    expect(metadata.description).toContain('your own machine with AIM Data');
  });
});
