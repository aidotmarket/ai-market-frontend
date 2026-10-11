import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://ai.market';

function getApiUrl(): string {
  const url = process.env.API_URL;
  if (!url) {
    console.warn('[sitemap] API_URL not set — listing pages will be omitted from sitemap');
    return '';
  }
  return url;
}

interface SitemapEntry {
  slug: string;
  published_at: string;
  updated_at?: string;
}

async function loadPages(
  url: string,
  feed: string,
  mapEntry: (entry: SitemapEntry) => MetadataRoute.Sitemap[number],
): Promise<MetadataRoute.Sitemap> {
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) {
      console.warn(`[sitemap] API responded with status ${res.status} — ${feed} pages will be omitted`);
      return [];
    }
    const data = await res.json();
    const entries: SitemapEntry[] = data.entries || [];
    return entries.map(mapEntry);
  } catch (error) {
    console.error(`Failed to fetch ${feed} for sitemap:`, error);
    return [];
  }
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
    {
      url: `${SITE_URL}/find-data`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/requests`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/sell-data`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/aim-data`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/partner`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/docs/claude`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/verified`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
  ];

  const apiUrl = getApiUrl();
  if (!apiUrl) return staticPages;

  const [listingPages, requestPages] = await Promise.all([
    loadPages(`${apiUrl}/api/v1/public/sitemap-entries`, 'listing', (entry) => ({
      url: `${SITE_URL}/listings/${entry.slug}`,
      lastModified: new Date(entry.published_at),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    loadPages(`${apiUrl}/api/v1/public/request-sitemap-entries`, 'request', (entry) => ({
      url: `${SITE_URL}/requests/${entry.slug}`,
      lastModified: new Date(entry.updated_at || entry.published_at),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
  ]);

  return [...staticPages, ...listingPages, ...requestPages];
}
