import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://ai.market';

function getApiUrl(): string {
  const url = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;
  if (!url) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[sitemap] API_URL not set in production — listing pages will be omitted from sitemap');
      return '';
    }
    return 'http://localhost:8000';
  }
  return url;
}

interface SitemapEntry {
  slug: string;
  published_at: string;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/listings`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
  ];

  const apiUrl = getApiUrl();
  if (!apiUrl) return staticPages;

  try {
    const res = await fetch(`${apiUrl}/api/v1/public/sitemap-entries`, {
      next: { revalidate: 3600 },
    });

    if (!res.ok) return staticPages;

    const data = await res.json();
    const entries: SitemapEntry[] = data.entries || [];

    const listingPages: MetadataRoute.Sitemap = entries.map((entry) => ({
      url: `${SITE_URL}/listings/${entry.slug}`,
      lastModified: new Date(entry.published_at),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }));

    return [...staticPages, ...listingPages];
  } catch (error) {
    console.error('Failed to fetch listings for sitemap:', error);
    return staticPages;
  }
}
