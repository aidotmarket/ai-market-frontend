import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
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
        { source: '/llms.txt', destination: `${devUrl}/llms.txt` },
        { source: '/requests.txt', destination: `${devUrl}/requests.txt` },
        { source: '/.well-known/requests.txt', destination: `${devUrl}/.well-known/requests.txt` },
        { source: '/.well-known/ai-agents.json', destination: `${devUrl}/.well-known/ai-agents.json` },
        { source: '/.well-known/ai-plugin.json', destination: `${devUrl}/.well-known/ai-plugin.json` },
        { source: '/l/:code/card.png', destination: `${devUrl}/api/v1/public/share/:code/card.png` },
      ];
    }
    return [
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
