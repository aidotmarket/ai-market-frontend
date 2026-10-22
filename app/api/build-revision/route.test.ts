import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET, dynamic } from './route';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe('public build identity', () => {
  it.each([undefined, '', 'secret-invalid-value', 'a'.repeat(39), `${'a'.repeat(40)}\n`])
    ('compiles absent/malformed provider metadata as unknown: %s', async value => {
      vi.stubEnv('RAILWAY_GIT_COMMIT_SHA', value);
      const { default: config } = await import('../../../next.config');
      expect(config.env).toEqual({ FRONTEND_BUILD_REVISION: '' });
      vi.stubEnv('FRONTEND_BUILD_REVISION', config.env!.FRONTEND_BUILD_REVISION!);
      const response = GET();
      expect(await response.json()).toEqual({ revision: null });
      expect(response.headers.get('cache-control')).toBe('no-store');
    });

  it('maps only a normalized provider GitHub commit into the build constant and response', async () => {
    const revision = 'ab'.repeat(20);
    vi.stubEnv('RAILWAY_GIT_COMMIT_SHA', revision.toUpperCase());
    vi.stubEnv('FRONTEND_BUILD_REVISION', 'runtime-override-is-ignored-by-config');
    const { default: config } = await import('../../../next.config');
    expect(config.env).toEqual({ FRONTEND_BUILD_REVISION: revision });
    vi.stubEnv('FRONTEND_BUILD_REVISION', config.env!.FRONTEND_BUILD_REVISION!);
    const response = GET();
    expect(dynamic).toBe('force-dynamic');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ revision });
  });
});
