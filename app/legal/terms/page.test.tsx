import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import StaticTerms from './StaticTerms';
import TermsAndConditionsPage from './page';

const hash = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const previousApiUrl = process.env.API_URL;
const effectiveAt = '2026-10-01T00:00:00Z';
const document = readFileSync('app/legal/terms/terms_v1_1.test.md', 'utf8')
  .replace('{{TERMS_1_1_EFFECTIVE_AT}}', effectiveAt);

afterEach(() => {
  process.env.API_URL = previousApiUrl;
  vi.unstubAllGlobals();
});

it('renders the full base marketplace 1.0 page on flag-off 404', async () => {
  process.env.API_URL = 'https://api.example';
  const fetchMock = vi.fn().mockResolvedValue({ status: 404, ok: false });
  vi.stubGlobal('fetch', fetchMock);
  const html = renderToStaticMarkup(await TermsAndConditionsPage());
  expect(html).toBe(renderToStaticMarkup(<StaticTerms />));
  expect(html).toContain('Effective date: July 7, 2026 · Version 1.0');
  expect(html).toContain('href="https://ai.market/legal/privacy"');
  expect(html).toContain('19.6 Notices.');
  expect(html).not.toContain('Listings without a chosen licence are offered under');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('renders the verified backend marketplace 1.1 document once', async () => {
  process.env.API_URL = 'https://api.example';
  const fetchMock = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ terms_version: '1.1', terms_hash_sha256: hash(document), effective_at: effectiveAt, text_url: '/api/v1/legal/terms/document' }) })
    .mockResolvedValueOnce({ ok: true, text: async () => document });
  vi.stubGlobal('fetch', fetchMock);
  const html = renderToStaticMarkup(await TermsAndConditionsPage());
  expect(html.match(/ai.market — Terms and Conditions/g)).toHaveLength(1);
  expect(html.match(/Effective date: 2026-10-01T00:00:00Z · Version 1.1/g)).toHaveLength(1);
  expect(html).toContain('Listings without a chosen licence are offered under the ai.market Standard Data Licence with AI training permitted, and the seller accepts the ai.market Marketplace Listing Covenant for them.');
  expect(html).toContain('Privacy Policy: https://ai.market/legal/privacy');
  expect(fetchMock.mock.calls[1][0]).toBe('https://api.example/api/v1/legal/terms/document');
});

it('refuses a mismatched 1.1 document and does not treat other failures as flag-off', async () => {
  process.env.API_URL = 'https://api.example';
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ terms_version: '1.1', terms_hash_sha256: hash(document), effective_at: effectiveAt, text_url: '/api/v1/legal/terms/document' }) })
    .mockResolvedValueOnce({ ok: true, text: async () => `${document}changed` }));
  await expect(TermsAndConditionsPage()).rejects.toThrow('hash mismatch');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 503, ok: false }));
  await expect(TermsAndConditionsPage()).rejects.toThrow('Current terms are unavailable');
});
