import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || 'http://localhost:8000';
    return [
      { source: '/llms.txt', destination: `${apiUrl}/llms.txt` },
      { source: '/.well-known/ai-agents.json', destination: `${apiUrl}/.well-known/ai-agents.json` },
      { source: '/.well-known/ai-plugin.json', destination: `${apiUrl}/.well-known/ai-plugin.json` },
    ];
  },
};

export default nextConfig;
