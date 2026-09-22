import { afterEach, describe, expect, it, vi } from 'vitest';

describe('next.config listing redirects', () => {
  it('permanently redirects the branded listing slug to the neutral slug', async () => {
    const { default: config } = await import('./next.config');

    const redirects = await config.redirects!();

    expect(redirects).toContainEqual({
      source: '/listings/eolymp-problem-dataset-5ab53e16',
      destination: '/listings/competitive-programming-problems-5ab53e16',
      permanent: true,
    });
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

  it('proxies canonical licence URLs to the API licence routes', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.test';
    const { default: config } = await import('./next.config');

    const rewrites = await config.rewrites!();

    expect(rewrites).toContainEqual({
      source: '/licenses/:path*',
      destination: 'https://api.example.test/api/v1/licenses/:path*',
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

  it('uses the local API licence routes outside production', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { default: config } = await import('./next.config');

    const rewrites = await config.rewrites!();

    expect(rewrites).toContainEqual({
      source: '/licenses/:path*',
      destination: 'http://localhost:8000/api/v1/licenses/:path*',
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
