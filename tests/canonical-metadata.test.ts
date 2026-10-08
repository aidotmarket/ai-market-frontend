import type { Metadata } from 'next';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/font/google', () => ({ Plus_Jakarta_Sans: () => ({ className: 'font' }) }));
vi.mock('@/lib/api', () => ({
  fetchPublicListing: vi.fn(async () => ({ slug: 'resolved-listing', title: 'Listing' })),
  fetchDataRequest: vi.fn(async () => ({ slug: 'resolved-request', title: 'Request' })),
}));

const { metadata: root } = await import('../app/layout');

// Metadata is shallowly merged by Next, from layout to page. The homepage
// must not supply an inherited canonical to any other route.
function canonical(child: Metadata = {}) {
  const merged = { ...root, ...child };
  const path = merged.alternates?.canonical;
  return typeof path === 'string' ? new URL(path, merged.metadataBase ?? undefined).href : path;
}

const publicPages = [
  ['/', () => import('../app/page')],
  ['/listings', () => import('../app/listings/page')],
  ['/find-data', () => import('../app/find-data/page')],
  ['/requests', () => import('../app/requests/page')],
  ['/search', () => import('../app/search/page')],
  ['/sell-data', () => import('../app/sell-data/page')],
  ['/aim-data', () => import('../app/aim-data/page')],
  ['/partner', () => import('../app/partner/page')],
  ['/protocol', () => import('../app/protocol/layout')],
  ['/investors', () => import('../app/investors/page')],
  ['/management-team', () => import('../app/management-team/page')],
  ['/support', () => import('../app/support/page')],
  ['/legal/privacy', () => import('../app/legal/privacy/page')],
  ['/legal/cookies', () => import('../app/legal/cookies/page')],
  ['/pricing', () => import('../app/pricing/page')],
  ['/docs/claude', () => import('../app/docs/claude/page')],
  ['/verified', () => import('../app/verified/page')],
  ['/blog', () => import('../app/blog/page')],
] as const;

describe('route canonical metadata', () => {
  it('does not inherit a homepage canonical on a child without alternates', () => {
    expect(canonical({ title: 'Child route' })).toBeUndefined();
    expect(root.metadataBase?.href).toBe('https://ai.market/');
  });

  it.each(publicPages)('%s resolves to its own URL', async (path, load) => {
    const { metadata } = await load();
    expect(canonical(metadata)).toBe(`https://ai.market${path === '/' ? '/' : path}`);
  });

  it('retains the resolved listing slug canonical', async () => {
    const { generateMetadata } = await import('../app/listings/[slug]/page');
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: 'requested-listing' }) });
    expect(canonical(metadata)).toBe('https://ai.market/listings/resolved-listing');
  });

  it('retains the resolved request slug canonical', async () => {
    const { generateMetadata } = await import('../app/requests/[slug]/page');
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: 'requested-request' }) });
    expect(canonical(metadata)).toBe('https://ai.market/requests/resolved-request');
  });
});
