import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ShareMetadataResponse } from '@/lib/api';

const fetchShareMetadata = vi.fn();

vi.mock('@/lib/api', () => ({
  fetchShareMetadata,
}));

const { default: SharePage, generateMetadata } = await import('./page');

function makeShareMetadata(overrides: Partial<ShareMetadataResponse> = {}): ShareMetadataResponse {
  return {
    og: {
      'og:title': 'Shared Dataset',
      'og:description': 'A marketplace-ready dataset for testing share previews.',
      'og:url': 'https://ai.market/listings/shared-dataset',
      'og:type': 'website',
      'og:site_name': 'ai.market',
      'og:image': 'https://ai.market/l/AbC123xYz987/card.png?v=hash-1',
      'og:locale': 'en_US',
      'twitter:card': 'summary_large_image',
      'twitter:title': 'Shared Dataset',
      'twitter:description': 'A marketplace-ready dataset for testing share previews.',
      'twitter:image': 'https://ai.market/l/AbC123xYz987/card.png?v=hash-1',
    },
    jsonld: {
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      name: 'Shared Dataset',
      description: 'A marketplace-ready dataset for testing share previews.',
      url: 'https://ai.market/listings/shared-dataset',
    },
    card_url: 'https://ai.market/l/AbC123xYz987/card.png?v=hash-1',
    canonical: 'https://ai.market/listings/shared-dataset',
    locale: 'en_US',
    alternates: [],
    ...overrides,
  };
}

async function renderSharePage(result: Awaited<ReturnType<typeof fetchShareMetadata>>): Promise<string> {
  fetchShareMetadata.mockResolvedValueOnce(result);
  const element = await SharePage({
    params: Promise.resolve({ code: 'AbC123xYz987' }),
  });
  return renderToStaticMarkup(element);
}

function extractJsonLdScripts(html: string): string[] {
  return Array.from(
    html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g),
    (match) => match[1],
  );
}

describe('SharePage', () => {
  beforeEach(() => {
    fetchShareMetadata.mockReset();
  });

  it('generates published listing metadata with OG, Twitter, canonical, and card image fields', async () => {
    const share = makeShareMetadata({
      og: {
        'og:title': 'Shared Dataset',
        'og:description': 'A marketplace-ready dataset for testing share previews.',
        'og:url': 'https://ai.market/listings/shared-dataset',
        'og:type': 'article',
        'og:site_name': 'ai.market',
        'og:image': 'https://ai.market/l/AbC123xYz987/card.png?v=hash-og',
        'og:locale': 'en_US',
        'twitter:card': 'summary_large_image',
        'twitter:title': 'Shared Dataset',
        'twitter:description': 'A marketplace-ready dataset for testing share previews.',
        'twitter:image': 'https://ai.market/l/AbC123xYz987/card.png?v=hash-twitter',
      },
      card_url: 'https://ai.market/l/AbC123xYz987/card.png?v=hash-card',
    });
    fetchShareMetadata.mockResolvedValueOnce({ status: 'published', data: share });

    const metadata = await generateMetadata({
      params: Promise.resolve({ code: 'AbC123xYz987' }),
    });

    expect(metadata).toMatchObject({
      title: 'Shared Dataset',
      description: 'A marketplace-ready dataset for testing share previews.',
      alternates: { canonical: 'https://ai.market/listings/shared-dataset' },
      openGraph: {
        title: 'Shared Dataset',
        description: 'A marketplace-ready dataset for testing share previews.',
        url: 'https://ai.market/listings/shared-dataset',
        type: 'article',
        siteName: 'ai.market',
        images: ['https://ai.market/l/AbC123xYz987/card.png?v=hash-card'],
        locale: 'en_US',
      },
      twitter: {
        card: 'summary_large_image',
        title: 'Shared Dataset',
        description: 'A marketplace-ready dataset for testing share previews.',
        images: ['https://ai.market/l/AbC123xYz987/card.png?v=hash-twitter'],
      },
    });
    expect(metadata).toMatchSnapshot();
  });

  it('renders the JSON-LD script, card preview, and View listing CTA for published shares', async () => {
    const share = makeShareMetadata({
      canonical: 'https://example.com/listings/shared-dataset',
      card_url: 'https://ai.market/l/AbC123xYz987/card.png?v=fresh-card',
    });

    const html = await renderSharePage({ status: 'published', data: share });
    const scripts = extractJsonLdScripts(html);

    expect(scripts).toHaveLength(1);
    expect(JSON.parse(scripts[0])).toEqual(share.jsonld);
    expect(scripts[0]).not.toContain('</script>');
    expect(html).toContain('Shared Dataset');
    expect(html).toContain('A marketplace-ready dataset for testing share previews.');
    expect(html).toContain('href="/listings"');
    expect(html).not.toContain('href="https://example.com/listings/shared-dataset"');
    expect(html).toContain('View listing');
    expect(html).toContain('src="https://ai.market/l/AbC123xYz987/card.png?v=fresh-card"');
    expect(html).toMatchSnapshot();
  });

  it('returns generic noindex metadata and renders the friendly unavailable page for 410 shares', async () => {
    fetchShareMetadata.mockResolvedValueOnce({ status: 'gone' });

    const metadata = await generateMetadata({
      params: Promise.resolve({ code: 'AbC123xYz987' }),
    });
    const html = await renderSharePage({ status: 'gone' });

    expect(metadata).toEqual({
      title: 'Listing unavailable | ai.market',
      robots: { index: false, follow: false },
    });
    const serializedMetadata = JSON.stringify(metadata);
    expect(serializedMetadata).not.toContain('Shared Dataset');
    expect(serializedMetadata).not.toContain('marketplace-ready dataset');
    expect(serializedMetadata).not.toContain('/listings/shared-dataset');
    expect(html).toContain('This share link is no longer available');
    expect(html).toContain('href="/find-data"');
    expect(html).not.toContain('Shared Dataset');
    expect(html).not.toContain('application/ld+json');
  });

  it('returns a minimal OG fallback without throwing when the metadata fetch fails', async () => {
    fetchShareMetadata.mockResolvedValueOnce({ status: 'error' });

    const metadata = await generateMetadata({
      params: Promise.resolve({ code: 'AbC123xYz987' }),
    });

    expect(metadata).toEqual({
      title: 'ai.market listing',
      robots: { index: false, follow: false },
      openGraph: {
        title: 'ai.market listing',
        type: 'website',
        siteName: 'ai.market',
      },
    });
    const serializedMetadata = JSON.stringify(metadata);
    expect(serializedMetadata).not.toContain('Shared Dataset');
    expect(serializedMetadata).not.toContain('marketplace-ready dataset');
    expect(serializedMetadata).not.toContain('/listings/shared-dataset');
  });
});
