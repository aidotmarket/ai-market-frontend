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
  ];

  const apiUrl = getApiUrl();
  if (!apiUrl) return staticPages;

  try {
    const res = await fetch(`${apiUrl}/api/v1/public/sitemap-entries`, {
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      console.warn(`[sitemap] API responded with status ${res.status} — listing pages will be omitted`);
      return staticPages;
    }

    const data = await res.json();
    const entries: SitemapEntry[] = data.entries || [];

    const listingPages: MetadataRoute.Sitemap = entries.map((entry) => ({
      url: `${SITE_URL}/listings/${entry.slug}`,
      lastModified: new Date(entry.published_at),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }));

    let requestPages: MetadataRoute.Sitemap = [];
    const requestRes = await fetch(`${apiUrl}/api/v1/public/request-sitemap-entries`, {
      next: { revalidate: 3600 },
    });
    if (requestRes.ok) {
      const requestData = await requestRes.json();
      const requestEntries: SitemapEntry[] = requestData.entries || [];
      requestPages = requestEntries.map((entry) => ({
        url: `${SITE_URL}/requests/${entry.slug}`,
        lastModified: new Date(entry.updated_at || entry.published_at),
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      }));
    } else {
      console.warn(`[sitemap] API responded with status ${requestRes.status} — request pages will be omitted`);
    }

    return [...staticPages, ...listingPages, ...requestPages];
  } catch (error) {
    console.error('Failed to fetch listings for sitemap:', error);
    return staticPages;
  }
}
