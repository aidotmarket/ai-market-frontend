import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));

const { default: LicencePage, generateMetadata } = await import('./page');
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.API_URL;
});

it('renders the backend Standard summary before the full text at its canonical URL', async () => {
  process.env.API_URL = 'https://api.ai.market';
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ code: 'standard', version: '1.0', variant: 'ai-training',
      summary: ['Summary from backend'], full_text: 'Full text from backend', sha256: 'a'.repeat(64) }),
  });
  globalThis.fetch = fetchMock;
  const props = { params: Promise.resolve({ parts: ['standard', '1.0', 'ai-training'] }) };
  const html = renderToStaticMarkup(await LicencePage(props));
  expect(html.indexOf('Summary from backend')).toBeLessThan(html.indexOf('Full text from backend'));
  expect(html).toContain('SHA-256:');
  expect((await generateMetadata(props)).alternates).toEqual({ canonical: 'https://ai.market/licenses/standard/1.0/ai-training' });
  expect(fetchMock).toHaveBeenCalledWith('https://api.ai.market/api/v1/licenses/standard/1.0/ai-training?format=json', expect.anything());
});

it('shows only the backend custom notice and hash', async () => {
  process.env.API_URL = 'https://api.ai.market';
  const hash = 'b'.repeat(64);
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ code: 'custom', sha256: hash, notice: 'Backend amber notice' }) });
  const html = renderToStaticMarkup(await LicencePage({ params: Promise.resolve({ parts: ['custom', hash] }) }));
  expect(html).toContain('Backend amber notice');
  expect(html).toContain(hash);
  expect(html).not.toContain('Full text');
});
