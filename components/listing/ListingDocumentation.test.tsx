// @vitest-environment jsdom
import {readFileSync} from 'node:fs';
import {renderToString} from 'react-dom/server';
import {hydrateRoot} from 'react-dom/client';
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import ListingDocumentation from './ListingDocumentation';
import {documentFixture} from '@/tests/listingDocumentsFixture';

vi.mock('@/components/ListingMarkdown', () => ({default: () => {throw new Error('Client Markdown must never render buyer documents');}}));
beforeEach(() => vi.stubGlobal('ResizeObserver', class {observe() {} disconnect() {}}));
afterEach(() => {cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals();});

it('omits the section when no documents are published', () => {
  const {container} = render(<ListingDocumentation documents={[]}/>);
  expect(container.innerHTML).toBe(''); expect(screen.queryByRole('region', {name: 'Documentation'})).toBeNull();
});

it.each([
  '<p>Paragraph<br>line break</p>', '<h2>Heading</h2><h3>Subheading</h3><h4>Small heading</h4>',
  '<ul><li>tight</li><li><p>Loose</p><ol start="2"><li>Nested</li></ol></li></ul>',
  '<ol><li><strong>Bold</strong> <em>Italic</em></li></ol>',
  '<p>&amp;&lt;&gt;&quot;&#x27;</p>', '',
])('inserts only validated server body_html: %j', html => {
  const {container} = render(<ListingDocumentation documents={[documentFixture('technical_markdown', {body_html: html})]}/>);
  const expected = document.createElement('div'); expected.innerHTML = html;
  expect(container.querySelector('[dir="auto"]')?.innerHTML).toBe(expected.innerHTML);
  expect(container.textContent).not.toContain('Local source');
});

it.each([
  undefined, null, '<p>', '<p>x</h2>', '<p><strong>x</p></strong>', '<li>orphan</li>',
  '<ul>text<li>item</li></ul>', '<ul><p>x</p></ul>', '<p onclick="alert(1)">x</p>',
  '<p class="x">x</p>', '<ol start="1"><li>x</li></ol>', '<ol start="02"><li>x</li></ol>',
  '<ol start="2" class="x"><li>x</li></ol>', '<p>&unknown;</p>', '<p>&#39;</p>',
  '<br/>', '<br />', '</br>', '<P>x</P>', '<p>x</p>raw >',
  '<script>alert(1)</script>', '<img src="https://tracker.example/x">', '<a href="https://example.com">x</a>',
])('falls back to the entire escaped pre-wrap source for invalid or missing body_html: %j', html => {
  const source = '🫨*! sales@acme*.io\n<script>literal</script> **literal** &';
  const {container} = render(<ListingDocumentation documents={[documentFixture('technical_markdown', {body_markdown: source, body_html: html})]}/>);
  const content = container.querySelector('[dir="auto"]');
  expect(content?.textContent).toBe(source);
  expect(content?.className).toContain('whitespace-pre-wrap');
  expect(content?.querySelector('strong, h2, img, script, a')).toBeNull();
});

it('keeps large buyer values whole, collapses at 600px, and expands without parsing again', () => {
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1200);
  const body = '🫨 '.repeat(16000);
  const {container} = render(<ListingDocumentation documents={[documentFixture('technical_markdown', {body_markdown: body, body_html: `<p>${body}</p>`})]}/>);
  const toggle = screen.getByRole('button', {name: 'Show full documentation'});
  const content = document.getElementById(toggle.getAttribute('aria-controls')!)!;
  expect(content.textContent).toBe(body); expect(content.className).toContain('max-h-[600px]');
  fireEvent.click(toggle);
  expect(content.textContent).toBe(body); expect(content.className).not.toContain('max-h-[600px]');
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  fireEvent.click(screen.getByRole('button', {name: 'Show less documentation'}));
  expect(content.className).toContain('max-h-[600px]');
});

it('shows PDF metadata with an outbound link and the exact privacy attributes, never embedding or fetching it', () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  const {container} = render(<ListingDocumentation documents={[documentFixture('data_sheet_pdf')]}/>);
  const link = screen.getByRole('link', {name: 'Open data sheet (PDF, new tab)'});
  expect(link.getAttribute('href')).toBe('https://cdn.example.com/spec.pdf');
  expect(link.getAttribute('target')).toBe('_blank');
  expect(link.getAttribute('rel')).toBe('noopener noreferrer nofollow ugc');
  expect(link.getAttribute('referrerpolicy')).toBe('no-referrer');
  expect(screen.getByText(/spec.pdf · 1,024 bytes/)).toBeTruthy();
  expect(screen.getByText(`SHA-256: ${'b'.repeat(64)}`)).toBeTruthy();
  expect(screen.getByText(/hosted by the seller, not ai.market/)).toBeTruthy();
  expect(container.querySelector('iframe, embed, object')).toBeNull(); expect(fetch).not.toHaveBeenCalled();
});

it.each(['javascript:alert(1)', 'data:text/html,unsafe', 'http://example.com/a.pdf', 'https://user:password@example.com/a.pdf'])('omits malformed PDF addresses %s', pdf_url => {
  const {container} = render(<ListingDocumentation documents={[documentFixture('data_sheet_pdf', {pdf_url})]}/>);
  expect(container.innerHTML).toBe('');
});

it.each(['app/listings/[slug]/page.tsx', 'app/listings/[slug]/PublicSourceReferencePage.tsx', 'components/listing/ListingDocumentation.tsx'])('%s never imports or renders client ListingMarkdown', path => {
  expect(readFileSync(path, 'utf8')).not.toMatch(/ListingMarkdown|react-markdown|markdown-it/);
  expect(readFileSync('components/listing/ListingDocumentation.tsx', 'utf8')).toContain('descriptionHtml={document.body_html}');
});


it('hydrates PDF sizes when the browser default locale differs from the server', async () => {
  const format = Number.prototype.toLocaleString;
  let defaultLocale = 'en-US';
  vi.spyOn(Number.prototype, 'toLocaleString').mockImplementation(function (this: number, locales, options) {
    return format.call(this, locales ?? defaultLocale, options);
  });
  const view = <ListingDocumentation documents={[documentFixture('data_sheet_pdf', {pdf_size_bytes: 2_400_000})]}/>;
  const container = document.createElement('div');
  container.innerHTML = renderToString(view);
  const serverHtml = container.innerHTML;
  defaultLocale = 'de-DE';
  expect((2_400_000).toLocaleString()).toBe('2.400.000');
  const onRecoverableError = vi.fn();
  const consoleError = vi.spyOn(console, 'error');
  let root: ReturnType<typeof hydrateRoot>;
  await act(async () => {root = hydrateRoot(container, view, {onRecoverableError});});
  try {
    expect(container.innerHTML).toBe(serverHtml);
    expect(container.textContent).toContain('2,400,000 bytes');
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  } finally {await act(async () => root.unmount());}
});

it.each([[1024, '1.0 KB'], [40 * 1024, '40.0 KB'], [2 * 1024 * 1024, '2.0 MB']])('shows readable PDF sizes for %i bytes', (size, label) => {
  render(<ListingDocumentation documents={[documentFixture('data_sheet_pdf', {pdf_size_bytes: size as number})]}/>);
  expect(screen.getByText(`Data sheet (PDF, ${label}) — hosted by the seller, not ai.market`)).toBeTruthy();
});
