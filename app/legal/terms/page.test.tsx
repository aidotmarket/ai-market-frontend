// @vitest-environment jsdom
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
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
  expect(html).toContain('id="fees" class="mt-10 space-y-4 scroll-mt-24"');
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
  expect(normalizedLegalText(html)).toContain('Listings without a chosen licence are offered under the ai.market Standard Data Licence with AI training permitted, and the seller accepts the ai.market Marketplace Listing Covenant for them.');
  expect(html).toContain('Privacy Policy: https://ai.market/legal/privacy');
  expect(html).toContain('<h2 id="fees" class="scroll-mt-24">5. Commission, transaction costs, payment, and tax</h2>');
  expect(html.match(/id="fees"/g)).toHaveLength(1);
  expect(html).toContain('<h2>4. What the Platform is, and what it is not</h2>');
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

const backendDocument12 = readFileSync('app/legal/terms/terms_v1_2.test.md', 'utf8')
  .replace('{{TERMS_1_2_EFFECTIVE_AT}}', effectiveAt);
const feeExample = "Example: on a $1,000 sale, ai.market's 5% commission is $50 and the card fee is about 2.9% + 30¢ (about $29), so the seller receives about $921. This is an example; the actual card fee varies.";

it.each([
  ['1.1', backendDocument, 'app/legal/terms/terms_v1_1.test.md', '1f2c9c8c9f22bc510623d5c91c86c01e5f48ed2afbd8d96701e1417d4d1b69eb'],
  ['1.2', backendDocument12, 'app/legal/terms/terms_v1_2.test.md', '44e09f69faeee3611f47f72b16c97ded8414d2fec1dea52f13eac23a00135cdd'],
])('adds the approved links and fee example to Terms %s while preserving the original wording', async (version, markdown, fixture, fixtureHash) => {
  // Pin the original document bytes independently of the rendering change.
  expect(hash(readFileSync(fixture, 'utf8'))).toBe(fixtureHash);
  const config = { terms_version: version, terms_hash_sha256: hash(markdown), effective_at: effectiveAt, text_url: '/api/v1/legal/terms/document' };
  const originalConfig = { ...config };
  process.env.API_URL = 'https://api.example';
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => config })
    .mockResolvedValueOnce({ ok: true, text: async () => markdown }));

  const html = renderToStaticMarkup(await TermsAndConditionsPage());
  const container = document.createElement('div');
  container.innerHTML = html;
  const licenceTerms = [...container.querySelectorAll('p')].find(p => p.textContent?.startsWith('7.2 '));
  const licenceLinks = [...licenceTerms!.nextElementSibling!.querySelectorAll('a')];
  expect(licenceLinks.map(link => [link.textContent, link.getAttribute('href')])).toEqual([
    ['Standard Data Licence', '/licenses/standard/1.1/ai-training'],
    ['Marketplace Listing Covenant', '/licenses/marketplace-listing/1.1'],
  ]);
  const stripeLink = container.querySelector('a[href="https://stripe.com/pricing"]');
  if (version === '1.2') {
    const fees = [...container.querySelectorAll('p')].find(p => p.textContent?.startsWith('5.2 '));
    const pricing = fees!.nextElementSibling!;
    const example = pricing.nextElementSibling!;
    expect(pricing.textContent).toBe('Stripe pricing');
    expect(pricing.querySelector('a')).toBe(stripeLink);
    expect(stripeLink).not.toBeNull();
    expect(example.textContent).toBe(feeExample);
    expect(example.nextElementSibling?.textContent).toMatch(/^5\.3 /);
    pricing.remove();
    example.remove();
  } else {
    expect(stripeLink).toBeNull();
    expect(container.textContent).not.toContain(feeExample);
  }
  const originalHtml = renderToStaticMarkup(<ReactMarkdown rehypePlugins={[rehypeSanitize]}>{markdown}</ReactMarkdown>);
  expect(normalizedLegalText(container.innerHTML)).toBe(normalizedLegalText(originalHtml));
  expect(config).toEqual(originalConfig);
  expect(hash(markdown)).toBe(originalConfig.terms_hash_sha256);
  expect(normalizedLegalText(html)).toContain(`Version ${originalConfig.terms_version}`);
});

it('renders the hash-verified 1.2 document without old fee or hold wording', async () => {
  process.env.API_URL = 'https://api.example';
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ terms_version: '1.2', terms_hash_sha256: hash(backendDocument12), effective_at: effectiveAt, text_url: '/api/v1/legal/terms/document' }) })
    .mockResolvedValueOnce({ ok: true, text: async () => backendDocument12 }));
  const html = renderToStaticMarkup(await TermsAndConditionsPage());
  expect(html).toContain('Version 1.2');
  expect(html).toContain('48-hour post-confirmation hold');
  expect(html).toContain('seller pays the actual Stripe card processing fee');
  expect(html).toContain('<h2 id="fees" class="scroll-mt-24">5. Commission, transaction costs, payment, and tax</h2>');
  expect(html.match(/id="fees"/g)).toHaveLength(1);
  expect(html).not.toContain('The buyer pays the transaction costs.');
  expect(html).not.toContain('Card money is held until the refund window closes');
});

it.each(['tampered', 'old document', 'old heading'])('refuses 1.2 with %s and never falls back to static text', async (scenario) => {
  process.env.API_URL = 'https://api.example';
  const text = scenario === 'old document' ? backendDocument : scenario === 'old heading' ? backendDocument12.replace('Version 1.2', 'Version 1.1') : backendDocument12 + 'changed';
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ terms_version: '1.2', terms_hash_sha256: scenario === 'tampered' ? hash(backendDocument12) : hash(text), effective_at: effectiveAt, text_url: '/api/v1/legal/terms/document' }) })
    .mockResolvedValueOnce({ ok: true, text: async () => text }));
  await expect(TermsAndConditionsPage()).rejects.toThrow(scenario === 'tampered' ? 'hash mismatch' : 'Invalid current terms document');
});
