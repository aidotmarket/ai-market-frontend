import { afterEach, expect, it, vi } from 'vitest';
import { getPublicTermsVersion } from './publicTermsVersion';
const previousApiUrl = process.env.API_URL;
afterEach(() => { process.env.API_URL = previousApiUrl; vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it.each(['1.1', '1.2'])('fetches served %s without a server cache', async (version) => {
  process.env.API_URL = 'https://api.example/';
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ terms_version: version }) });
  vi.stubGlobal('fetch', fetchMock);
  expect(await getPublicTermsVersion()).toBe(version);
  expect(fetchMock).toHaveBeenCalledWith('https://api.example/api/v1/legal/terms/current', { cache: 'no-store', signal: expect.any(AbortSignal) });
});
it.each([404, 503])('keeps legacy public copy if metadata responds %s', async (status) => {
  process.env.API_URL = 'https://api.example';
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status }));
  expect(await getPublicTermsVersion()).toBeNull();
});

it('falls back to legacy copy when the three-second metadata deadline expires', async () => {
  process.env.API_URL = 'https://api.example';
  const controller = new AbortController();
  const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
  vi.stubGlobal('fetch', vi.fn((_url, options: RequestInit) => new Promise((_resolve, reject) => {
    options.signal!.addEventListener('abort', () => reject(options.signal!.reason), { once: true });
  })));
  const result = getPublicTermsVersion();
  expect(timeout).toHaveBeenCalledWith(3000);
  controller.abort(new DOMException('Metadata deadline expired', 'TimeoutError'));
  expect(await result).toBeNull();
});
