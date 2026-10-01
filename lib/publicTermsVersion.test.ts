import { afterEach, expect, it, vi } from 'vitest';
import { getPublicTermsVersion } from './publicTermsVersion';
const previousApiUrl = process.env.API_URL;
afterEach(() => { process.env.API_URL = previousApiUrl; vi.unstubAllGlobals(); });
it.each(['1.1', '1.2'])('fetches served %s without a server cache', async (version) => {
  process.env.API_URL = 'https://api.example/';
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ terms_version: version }) });
  vi.stubGlobal('fetch', fetchMock);
  expect(await getPublicTermsVersion()).toBe(version);
  expect(fetchMock).toHaveBeenCalledWith('https://api.example/api/v1/legal/terms/current', { cache: 'no-store' });
});
it.each([404, 503])('keeps legacy public copy if metadata responds %s', async (status) => {
  process.env.API_URL = 'https://api.example';
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status }));
  expect(await getPublicTermsVersion()).toBeNull();
});
