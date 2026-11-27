import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));

const { default: LicencePage, generateMetadata } = await import('./page');
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.API_URL;
  delete process.env.NEXT_PUBLIC_API_URL;
});

it.each([
  ['API_URL only', 'https://api.ai.market', undefined],
  ['trailing slash', undefined, 'https://api.ai.market/'],
])('uses the normalized API base for the download link with %s', async (_label, apiUrl, publicApiUrl) => {
  if (apiUrl) process.env.API_URL = apiUrl;
  if (publicApiUrl) process.env.NEXT_PUBLIC_API_URL = publicApiUrl;
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    code: 'standard', version: '1.0', variant: 'ai-training', summary: [], full_text: 'Full text', sha256: 'a'.repeat(64),
  }) });
  const html = renderToStaticMarkup(await LicencePage({ params: Promise.resolve({ parts: ['standard', '1.0', 'ai-training'] }) }));
  expect(html).toContain('href="https://api.ai.market/api/v1/licenses/standard/1.0/ai-training?download=1"');
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
  expect(html).toContain('Licensor: verified seller via ai.market');
  expect(html).toContain('The licensor&#x27;s legal identity is recorded in the signed licence held by ai.market.');
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

it('links the existing marketplace terms reference in Covenant v1.1', async () => {
  process.env.API_URL = 'https://api.ai.market';
  const fullText = 'The seller accepts that the ai.market marketplace terms prevail for non-custodial delivery, the 5% commission, refunds, dispute holds and the evaluation-only sample rule.\n';
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    code: 'marketplace-listing', version: '1.1', variant: null, summary: [], full_text: fullText, sha256: 'a'.repeat(64),
  }) });

  const html = renderToStaticMarkup(await LicencePage({ params: Promise.resolve({ parts: ['marketplace-listing', '1.1'] }) }));

  expect(html).toMatch(/href="\/legal\/terms"[^>]*>ai\.market marketplace terms<\/a>/);
  expect(html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/)?.[1].replace(/<\/?a\b[^>]*>/g, '')).toBe(fullText);
});

const standardSection11 = '11. Notices and marketplace role. The Marketplace  Terms apply. See the marketplace terms.\n\n';
const standardSection12 = '12. General. See the marketplace terms in section 11.\n';

it.each(['ai-training', 'no-ai-training'])('links the terms only in section 11 of Standard v1.1 %s', async (variant) => {
  process.env.API_URL = 'https://api.example.invalid';
  const precedingText = '10. Example. See the marketplace terms.\n\n';
  const fullText = precedingText + standardSection11 + standardSection12;
  const sha256 = 'd'.repeat(64);
  const parts = ['standard', '1.1', variant];
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    code: 'standard', version: '1.1', variant, summary: [], full_text: fullText, sha256,
  }) });

  const html = renderToStaticMarkup(await LicencePage({ params: Promise.resolve({ parts }) }));

  const body = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/)?.[1];
  expect(body?.startsWith(precedingText)).toBe(true);
  expect(body?.endsWith(standardSection12)).toBe(true);
  expect(body?.match(/<a\b[^>]*>[^<]*<\/a>/g)).toEqual([
    expect.stringMatching(/href="\/legal\/terms"[^>]*>Marketplace  Terms<\/a>/),
    expect.stringMatching(/href="\/legal\/terms"[^>]*>marketplace terms<\/a>/),
  ]);
  expect(body?.replace(/<\/?a\b[^>]*>/g, '')).toBe(fullText);
  expect(html).toContain(`SHA-256: <code>${sha256}</code>`);
  expect(html).toContain(`href="https://api.example.invalid/api/v1/licenses/${parts.join('/')}?download=1">Download exact document</a>`);
});

it.each([
  ['1.0', standardSection11 + standardSection12],
  ['1.1', standardSection11],
  ['1.1', '11. Example. See the marketplace terms.\n\n' + standardSection12],
])('renders plain text for Standard v%s without an applicable section', async (version, fullText) => {
  process.env.API_URL = 'https://api.example.invalid';
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    code: 'standard', version, variant: 'ai-training', summary: [], full_text: fullText, sha256: 'd'.repeat(64),
  }) });

  const html = renderToStaticMarkup(await LicencePage({ params: Promise.resolve({ parts: ['standard', version, 'ai-training'] }) }));

  expect(html).toContain(`>${fullText}</pre>`);
  expect(html).not.toContain('href="/legal/terms"');
});

it('escapes markup in the public amber notice and never exposes custom text',async()=>{
  process.env.API_URL='https://api.ai.market';
  const hash='c'.repeat(64);
  globalThis.fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({code:'custom',sha256:hash,notice:'<script>alert(1)</script> **review**'})});
  const html=renderToStaticMarkup(await LicencePage({params:Promise.resolve({parts:['custom',hash]})}));
  expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; **review**');
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('Read exact recorded text');
});

it.each([
 ['standard','ai-training','881266a455d100e6b263ec121523001e5e53f6e3bf3bd97047e29ae39f8959fb'],
 ['standard','no-ai-training','0bec503dac137e80fa405f47e9ecded8a424ca73f794f8eef54d01ff10d25317'],
 ['marketplace-listing',null,'58eff1def7acb59db75920fe0da89a3f4f87bb12bd6765ec8eae231bbea118b5'],
])('serves the 1.1 %s %s canonical page',async(code,variant,sha256)=>{
 process.env.API_URL='https://api.ai.market';
 const parts=[code,'1.1',...(variant?[variant]:[])];
 const fullText='Full text from the API\n\nSecond paragraph\n';
 const fetchMock=vi.fn().mockResolvedValue({ok:true,json:async()=>({code,version:'1.1',variant,summary:[],full_text:fullText,sha256})});
 globalThis.fetch=fetchMock;
 const props={params:Promise.resolve({parts})};
 const html=renderToStaticMarkup(await LicencePage(props));
 expect(html).toContain('Version 1.1');
 expect(html).toContain(`<code>${sha256}</code>`);
 expect(html).toContain(`>${fullText}</pre>`);
 if(code==='standard') {
  expect(html).toContain('Licensor: verified seller via ai.market');
  expect(html).toContain('The licensor&#x27;s legal identity is recorded in the signed licence held by ai.market.');
 }
 expect(fetchMock).toHaveBeenCalledWith(`https://api.ai.market/api/v1/licenses/${parts.join('/')}?format=json`,expect.anything());
 expect(html).toContain(`/api/v1/licenses/${parts.join('/')}?download=1`);
 expect((await generateMetadata(props)).alternates?.canonical).toBe(`https://ai.market/licenses/${parts.join('/')}`);
});
