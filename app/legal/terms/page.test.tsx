// @vitest-environment jsdom
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import StaticTerms from './StaticTerms';
import TermsAndConditionsPage from './page';

const hash = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
// Pinned to the rendered legal text in 6b6862cfc50c5f3e6ab2ab5f6dc182f7cfe0414c:app/legal/terms/page.tsx.
const baseTermsTextSha256 = '4e2ab7c1d8f1b69c2198af8b5fbe27f0028b5a7072297f366de196dfd65120bc';
const normalizedLegalText = (html: string) => {
  const container = document.createElement('div');
  container.innerHTML = html;
  return (container.textContent ?? '').replace(/\s+/gu, ' ').trim();
};
const previousApiUrl = process.env.API_URL;
const effectiveAt = '2026-10-01T00:00:00Z';
const backendDocument = readFileSync('app/legal/terms/terms_v1_1.test.md', 'utf8')
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
  expect(hash(normalizedLegalText(html))).toBe(baseTermsTextSha256);
  expect(html).toContain('Effective date: July 7, 2026 · Version 1.0');
  expect(html).toContain('href="https://ai.market/legal/privacy"');
  expect(html).toContain('19.6 Notices.');
  expect(html).not.toContain('Listings without a chosen licence are offered under');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('renders the verified backend marketplace 1.1 document once', async () => {
  process.env.API_URL = 'https://api.example';
  const fetchMock = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ terms_version: '1.1', terms_hash_sha256: hash(backendDocument), effective_at: effectiveAt, text_url: '/api/v1/legal/terms/document' }) })
    .mockResolvedValueOnce({ ok: true, text: async () => backendDocument });
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
    .mockResolvedValueOnce({ ok: true, json: async () => ({ terms_version: '1.1', terms_hash_sha256: hash(backendDocument), effective_at: effectiveAt, text_url: '/api/v1/legal/terms/document' }) })
    .mockResolvedValueOnce({ ok: true, text: async () => `${backendDocument}changed` }));
  await expect(TermsAndConditionsPage()).rejects.toThrow('hash mismatch');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 503, ok: false }));
  await expect(TermsAndConditionsPage()).rejects.toThrow('Current terms are unavailable');
});
