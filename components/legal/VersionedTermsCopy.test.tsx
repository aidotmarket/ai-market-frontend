// @vitest-environment jsdom
import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import VersionedTermsCopy, { TermsVersionProvider } from './VersionedTermsCopy';

const legal = vi.hoisted(() => ({ getCurrentTerms: vi.fn() }));
vi.mock('@/api/legal', () => legal);
vi.mock('@/lib/publicTermsVersion', () => ({ getPublicTermsVersion: vi.fn() }));
vi.mock('@/lib/api', () => ({
  fetchDataRequests: vi.fn().mockResolvedValue({ items: [] }),
  fetchFeaturedFeed: vi.fn().mockResolvedValue(null),
  fetchPublicListings: vi.fn().mockResolvedValue({ items: [] }),
}));
vi.mock('@/components/HomepageActivityTickerBeacons', () => ({ HomepageActivityTickerBeacons: () => null }));
vi.mock('@/components/HeroSearch', () => ({ HeroSearch: () => <div>Search</div> }));
vi.mock('@/store/auth', () => ({ useAuthStore: () => ({ isAuthenticated: false }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it.each(['1.1', '1.2'])('retains server copy %s across hydration on every marketing page', async (version) => {
  const { getPublicTermsVersion } = await import('@/lib/publicTermsVersion');
  vi.mocked(getPublicTermsVersion).mockResolvedValue(version);
  legal.getCurrentTerms.mockResolvedValue({ terms_version: version === '1.2' ? '1.1' : '1.2' });
  const pages = [await import('@/app/page'), await import('@/app/pricing/page'), await import('@/app/sell-data/page')];
  for (const page of pages) {
    const element = await page.default();
    const container = document.createElement('div');
    document.body.append(container);
    container.innerHTML = renderToString(element);
    const serverText = container.textContent;
    let root: ReturnType<typeof hydrateRoot>;
    await act(async () => { root = hydrateRoot(container, element); });
    expect(container.textContent).toBe(serverText);
    expect(legal.getCurrentTerms).not.toHaveBeenCalled();
    await act(async () => root!.unmount());
    container.remove();
  }
});

it('loads metadata when no server version is provided', async () => {
  legal.getCurrentTerms.mockResolvedValue({ terms_version: '1.2' });
  render(<TermsVersionProvider initialVersion={null}><VersionedTermsCopy legacy="Legacy" terms12="Current" /></TermsVersionProvider>);
  expect(await screen.findByText('Current')).toBeTruthy();
  expect(legal.getCurrentTerms).toHaveBeenCalledTimes(1);
});
