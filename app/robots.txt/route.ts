import { NextResponse } from 'next/server';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://ai.market';

const robotsTxt = `User-agent: *
Allow: /
Disallow: /dashboard
Disallow: /dashboard/
Disallow: /login
Disallow: /register
Disallow: /api/

# AI Agent Discovery
# llms.txt: ${SITE_URL}/llms.txt
# requests.txt: ${SITE_URL}/requests.txt
# requests.txt well-known: ${SITE_URL}/.well-known/requests.txt
# ai-agents.json: ${SITE_URL}/.well-known/ai-agents.json

Sitemap: ${SITE_URL}/sitemap.xml
Sitemap: https://api.ai.market/sitemap-listings.xml
Sitemap: https://api.ai.market/sitemap-requests.xml
`;

export function GET() {
  return new NextResponse(robotsTxt, {
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  });
}
