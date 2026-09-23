import { createHash } from 'node:crypto';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import TermsAndConditionsPage from './page';

const hash = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const previousApiUrl = process.env.API_URL;

afterEach(() => {
  process.env.API_URL = previousApiUrl;
  vi.unstubAllGlobals();
});

it('renders the exact 1.1 document and an effective date only when configured', async () => {
  process.env.API_URL = 'https://api.example';
  const markdown = '# Terms 1.1\n\nSeller text.';
  const fetchMock = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ terms_version: '1.1', terms_hash_sha256: hash(markdown), effective_at: '2026-10-01', text_url: '/api/v1/legal/terms/document' }) })
    .mockResolvedValueOnce({ ok: true, text: async () => markdown });
  vi.stubGlobal('fetch', fetchMock);
  const html = renderToStaticMarkup(await TermsAndConditionsPage());
  expect(html).toContain('Version 1.1 · Effective 2026-10-01');
  expect(html).toContain('Seller text.');
  expect(fetchMock.mock.calls[1][0]).toBe('https://api.example/api/v1/legal/terms/document');
});

it('renders flag-off 1.0 markdown without a fabricated date', async () => {
  process.env.API_URL = 'https://api.example';
  const markdown = '# Terms 1.0';
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ terms_version: '1.0', terms_hash_sha256: hash(markdown), effective_at: null, markdown }) });
  vi.stubGlobal('fetch', fetchMock);
  const html = renderToStaticMarkup(await TermsAndConditionsPage());
  expect(html).toContain('Version 1.0');
  expect(html).not.toContain('Effective');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
