// @vitest-environment jsdom
import {readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it} from 'vitest';
import BackendListingHtml, {isBackendListingHtml} from './BackendListingHtml';

const paired = ['p', 'h2', 'h3', 'h4', 'ul', 'ol', 'strong', 'em'];
describe('backend listing HTML grammar', () => {
  it.each(paired)('accepts exact %s tags', tag => {
    const content = tag === 'ul' || tag === 'ol' ? '<li>text</li>' : 'text';
    expect(isBackendListingHtml(`<${tag}>${content}</${tag}>`)).toBe(true);
  });
  it.each([
    '', 'plain text\n🫨', '&amp;&lt;&gt;&quot;&#x27;', '<br>',
    '<p>A<strong>B<em>C</em></strong><br>D</p><h2>Next</h2>',
    '<ul><li>tight</li><li><p>loose</p><ol start="2"><li>nested</li></ol></li></ul>',
    '<ul></ul>', '<ol></ol>',
    ...['2', '9', '10', '100', '123456789', '999999999'].map(n => `<ol start="${n}"><li>x</li></ol>`),
  ])('accepts %j', html => expect(isBackendListingHtml(html)).toBe(true));

  it.each([
    undefined, null, 42, {}, [],
    '<', '>', 'a > b', 'a < b', '<p', '<p>', '</p>', '<p>x</h2>',
    '<p><em>x</p></em>', '<p>x</p></p>', '<ul><li>x</li>',
    '<li>x</li>', '<p><li>x</li></p>', '<ul><p><li>x</li></p></ul>',
    '<ul><li><li>x</li></li></ul>', '<ol start="2"><em><li>x</li></em></ol>',
    '<ul><p>x</p></ul>', '<ol>text<li>x</li></ol>',
    '<script>alert(1)</script>', '<a href="https://example.org">x</a>', '<img>',
    '<!-- comment -->', '<!DOCTYPE html>', '<![CDATA[x]]>', '<?xml?>',
    '<h1>x</h1>', '<h5>x</h5>', '<div>x</div>', '<P>x</P>', '<BR>',
    '<br/>', '<br />', '</br>', '<br class="x">', '<p >x</p>', '< p>x</p>',
    '<p\n>x</p>', '<p>x</p >', '<p class="x">x</p>', '<p onclick="x">x</p>',
    '<ol start="1"></ol>', '<ol start="0"></ol>', '<ol start="01"></ol>',
    '<ol start="02"></ol>', '<ol start="x"></ol>', '<ol start="-2"></ol>',
    '<ol start="1234567890">', '<ol start="1234567890"><li>x</li></ol>',
    '<ol start="999999999999999999999999999999"><li>x</li></ol>',
    '<ol start="+2"></ol>', '<ol start="2.0"></ol>', '<ol start="2e2"></ol>',
    '<ol start="２"></ol>', '<ol start=""></ol>', '<ol start="2\n"></ol>',
    "<ol start='2'></ol>", '<ol start=2></ol>', '<ol  start="2"></ol>',
    '<ol\tstart="2"></ol>', '<ol START="2"></ol>', '<ul start="2"></ul>',
    '<ol start="2" class="x"></ol>', '<ol start="2" start="3"></ol>',
    '<ol start="2"/>', '<ol start="2"></ol start="2">',
    '&', '&amp', '&AMP;', '&apos;', '&#39;', '&#x027;', '&#X27;', '&#60;',
    '&copy;', '&lt', '&amp; &bad;', '<p>&unknown;</p>', '<p><<br>></p>',
    '<p>safe</p><script>x</script>', '<p>safe</p>raw >',
  ])('rejects %j', html => expect(isBackendListingHtml(html)).toBe(false));

  it.each(['ul', 'ol', 'ol start="2"'])('rejects every non-li child directly inside %s', opening => {
    const tag = opening.split(' ')[0];
    const children = [
      'text', ' ', '\n', '\t', '&amp;', '<br>', '<ol start="2"></ol>',
      ...paired.map(child => `<${child}></${child}>`),
    ];
    for (const child of children) {
      for (const content of [child + '<li>x</li>', '<li>x</li>' + child]) {
        expect(isBackendListingHtml(`<${opening}>${content}</${tag}>`), content).toBe(false);
      }
    }
  });

  it.each(paired)('rejects attribute, case and whitespace variants for %s', tag => {
    for (const html of [`<${tag} id="x"></${tag}>`, `<${tag.toUpperCase()}></${tag.toUpperCase()}>`, `<${tag} ></${tag}>`, `<${tag}></${tag} >`]) {
      expect(isBackendListingHtml(html)).toBe(false);
    }
  });

  for (const [file, count] of [['listing-markdown-parity.json', 45], ['listing-markdown-parity-extra.json', 1248]] as const) {
    const corpus = JSON.parse(readFileSync(`tests/fixtures/${file}`, 'utf8')) as {name: string; html: string}[];
    it(`covers all ${count} committed outputs in ${file}`, () => expect(corpus).toHaveLength(count));
    it.each(corpus)(`${file}: $name`, ({html}) => expect(isBackendListingHtml(html)).toBe(true));
  }
});

it.each([undefined, null, '<script>alert(1)</script>', '<p onclick="x">bad</p>'])('falls back to escaped pre-wrap source for %j', descriptionHtml => {
  const description = '# Literal **text**\n<script>alert(1)</script> & raw';
  const root = document.createElement('div');
  root.innerHTML = renderToStaticMarkup(<BackendListingHtml description={description} descriptionHtml={descriptionHtml}/>);
  expect(root.textContent).toBe(description);
  expect(root.querySelector('script, strong, h2, p')).toBeNull();
  expect(root.firstElementChild?.classList.contains('whitespace-pre-wrap')).toBe(true);
});

it('inserts valid backend HTML verbatim, including an empty description', () => {
  for (const html of ['<h2>Backend</h2><p>&lt;literal&gt; <strong>text</strong></p>', '']) {
    const markup = renderToStaticMarkup(<BackendListingHtml description="unused source" descriptionHtml={html}/>);
    expect(markup.slice(markup.indexOf('>') + 1, -6)).toBe(html);
  }
});

it.each(['app/listings/[slug]/page.tsx', 'app/listings/[slug]/PublicSourceReferencePage.tsx'])('%s uses backend HTML and never imports or renders ListingMarkdown', path => {
  const source = readFileSync(path, 'utf8');
  expect(source).not.toContain('ListingMarkdown');
  expect(source).toContain('descriptionHtml={listing.description_html}');
  expect(source).toContain('<BackendListingHtml ');
  expect(readFileSync('components/BackendListingHtml.tsx', 'utf8')).not.toMatch(/ListingMarkdown|markdown-it/);
});
