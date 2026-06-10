import { afterEach, describe, expect, it, vi } from 'vitest';

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
});
