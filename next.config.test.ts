import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('retired AIM Federate surface', () => {
  it('preserves unrelated redirects without publishing retired redirect sources', async () => {
    const { default: config } = await import('./next.config');

    const redirects = await config.redirects!();

    expect(redirects).toEqual([
      { source: '/download/aim-channel', destination: '/sell-data', permanent: true },
      { source: '/download', destination: '/sell-data', permanent: true },
      {
        source: '/download/aim-node',
        destination: '/partner#technology-partner',
        permanent: true,
      },
      { source: '/aim-node', destination: '/aim-data', permanent: true },
    ]);
  });

  it('does not restore the retired route or public asset', () => {
    expect(existsSync(resolve('app/aim-federate/page.tsx'))).toBe(false);
    expect(existsSync(resolve('public/og/aim-federate.png'))).toBe(false);
  });
});

describe('next.config request discovery rewrites', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    delete process.env.NEXT_PUBLIC_API_URL;
    delete process.env.API_URL;
  });

  it('proxies root and well-known requests.txt when API URL is configured', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.test';
    const { default: config } = await import('./next.config');

    const rewrites = await config.rewrites!();

    expect(rewrites).toContainEqual({
      source: '/requests.txt',
      destination: 'https://api.example.test/requests.txt',
    });
    expect(rewrites).toContainEqual({
      source: '/.well-known/requests.txt',
      destination: 'https://api.example.test/.well-known/requests.txt',
    });
  });

  it('uses localhost fallback for requests.txt outside production', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { default: config } = await import('./next.config');

    const rewrites = await config.rewrites!();

    expect(rewrites).toContainEqual({
      source: '/requests.txt',
      destination: 'http://localhost:8000/requests.txt',
    });
    expect(rewrites).toContainEqual({
      source: '/.well-known/requests.txt',
      destination: 'http://localhost:8000/.well-known/requests.txt',
    });
  });

  it('proxies the share card image to the backend when API URL is configured', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.test';
    const { default: config } = await import('./next.config');

    const rewrites = await config.rewrites!();

    expect(rewrites).toContainEqual({
      source: '/l/:code/card.png',
      destination: 'https://api.example.test/api/v1/public/share/:code/card.png',
    });
  });

  it('uses localhost fallback for the share card image outside production', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { default: config } = await import('./next.config');

    const rewrites = await config.rewrites!();

    expect(rewrites).toContainEqual({
      source: '/l/:code/card.png',
      destination: 'http://localhost:8000/api/v1/public/share/:code/card.png',
    });
  });
});
