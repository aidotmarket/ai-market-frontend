import type { NextConfig } from 'next';
import { supportRecoveryRewrites } from './lib/support-private-policy';

const nextConfig: NextConfig = {
  // Next substitutes a build-time literal, independent of runtime metadata.
  env: {
    FRONTEND_BUILD_REVISION: process.env.RAILWAY_GIT_COMMIT_SHA?.length === 40
      && /^[0-9a-f]{40}$/i.test(process.env.RAILWAY_GIT_COMMIT_SHA)
      ? process.env.RAILWAY_GIT_COMMIT_SHA!.toLowerCase()
      : '',
  },
  reactStrictMode: true,
  async headers() {
    const privateHeaders = [
      { key: 'Cache-Control', value: 'no-store' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
    ];
    return [
      // Backend HTML retains its own nonce CSP and Set-Cookie headers.
      ...['/support/mailbox-account', '/api/v1/support/mailbox-confirm/:path*', '/api/v1/support/email-visit/:path*'].map(source => ({ source, headers: [
        { key: 'Cache-Control', value: 'private, no-store' },
        { key: 'Referrer-Policy', value: 'no-referrer' },
      ] })),
      ...['/confirm/:path*', '/checkout/h/:path*'].map(source => ({ source, headers: privateHeaders })),
      // Login and other auth pages can carry the private link in redirect.
      { source: '/:path*', has: [{ type: 'query' as const, key: 'redirect', value: '.*(?:/checkout/h/|/confirm/).*' }], headers: privateHeaders },
    ];
  },
  async redirects() {
    return [
      // Auth callbacks use apex; redirect before origin-scoped OAuth state is created.
      {
        source: '/:path((?!support/mailbox-account(?:/|$)|api/v1/support/(?:mailbox-confirm|email-visit)(?:/|$)).*)',
        has: [{ type: 'host', value: 'www\\.ai\\.market' }],
        destination: 'https://ai.market/:path*',
        permanent: true,
      },
      {
        source: '/listings/eolymp-problem-dataset-5ab53e16',
        destination: '/listings/competitive-programming-problems-5ab53e16',
        permanent: true,
      },
      { source: '/download/aim-channel', destination: '/aim-data', permanent: true },
      { source: '/download/aim-channel/:path*', destination: '/aim-data', permanent: true },
      { source: '/download', destination: '/sell-data', permanent: true },
      { source: '/download/aim-node', destination: '/partner#technology-partner', permanent: true },
      { source: '/aim-node', destination: '/aim-data', permanent: true },
    ];
  },
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL;
    if (!apiUrl) {
      if (process.env.NODE_ENV === 'production') {
        console.warn('[next.config] API_URL not set — AI discovery rewrites disabled');
        return [];
      }
      // Local dev fallback only
      const devUrl = 'http://localhost:8000';
      return [
        { source: '/licenses/:path*', has:[{type:'query' as const,key:'download',value:'1'}], destination: `${devUrl}/api/v1/licenses/:path*` },
        { source: '/llms.txt', destination: `${devUrl}/llms.txt` },
        { source: '/requests.txt', destination: `${devUrl}/requests.txt` },
        { source: '/.well-known/requests.txt', destination: `${devUrl}/.well-known/requests.txt` },
        { source: '/.well-known/ai-agents.json', destination: `${devUrl}/.well-known/ai-agents.json` },
        { source: '/.well-known/ai-plugin.json', destination: `${devUrl}/.well-known/ai-plugin.json` },
        { source: '/l/:code/card.png', destination: `${devUrl}/api/v1/public/share/:code/card.png` },
      ];
    }
    return [
      ...supportRecoveryRewrites(apiUrl),
      { source: '/licenses/:path*', has:[{type:'query' as const,key:'download',value:'1'}], destination: `${apiUrl}/api/v1/licenses/:path*` },
      { source: '/llms.txt', destination: `${apiUrl}/llms.txt` },
      { source: '/requests.txt', destination: `${apiUrl}/requests.txt` },
      { source: '/.well-known/requests.txt', destination: `${apiUrl}/.well-known/requests.txt` },
      { source: '/.well-known/ai-agents.json', destination: `${apiUrl}/.well-known/ai-agents.json` },
      { source: '/.well-known/ai-plugin.json', destination: `${apiUrl}/.well-known/ai-plugin.json` },
      { source: '/l/:code/card.png', destination: `${apiUrl}/api/v1/public/share/:code/card.png` },
    ];
  },
};

export default nextConfig;
