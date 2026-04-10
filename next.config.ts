import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: '/download/aim-data',
        destination: '/download/aim-channel',
        permanent: true,
      },
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.ai.market' }],
        destination: 'https://ai.market/:path*',
        permanent: true,
      },
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
        { source: '/.well-known/ai-agents.json', destination: `${devUrl}/.well-known/ai-agents.json` },
        { source: '/.well-known/ai-plugin.json', destination: `${devUrl}/.well-known/ai-plugin.json` },
      ];
    }
    return [
      { source: '/llms.txt', destination: `${apiUrl}/llms.txt` },
      { source: '/.well-known/ai-agents.json', destination: `${apiUrl}/.well-known/ai-agents.json` },
      { source: '/.well-known/ai-plugin.json', destination: `${apiUrl}/.well-known/ai-plugin.json` },
    ];
  },
};

export default nextConfig;
