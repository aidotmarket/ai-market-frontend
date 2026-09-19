// @vitest-environment jsdom
import {expect, it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import AtAGlance, {provenanceLabels, summaryFields} from './AtAGlance';
import sectionC from '@/tests/summarySectionC.json';
import {summary, field, emptySummaries} from '@/tests/summaryFixture';

it('renders nothing when absent, without even a wrapper', () => {
  expect(renderToStaticMarkup(<AtAGlance />)).toBe('');
  expect(renderToStaticMarkup(<AtAGlance summary={null} />)).toMatchInlineSnapshot('""');
});

it('renders the complete ordered metadata with inert schema cells and Phase 2 fields', () => {
  const html = renderToStaticMarkup(<AtAGlance summary={summary} />);
  const headings = [...html.matchAll(/<h3[^>]*>(.*?)<\/h3>/g)].map(match => match[1]);
  expect(headings).toEqual(summaryFields.map(([, label]) => label));
  expect(headings.filter(label => sectionC.fields.includes(label) && label !== 'Price')).toEqual(sectionC.fields.filter(label => label !== 'Price'));
  expect(html).toContain('title="12,345 bytes">12.35 KB</p>');
  expect(html).toContain('>0</p>');
  expect(html).toContain('scope="col"');
  expect(html).toContain('Sale amount'); expect(html).toContain('EUR');
  expect(html).toContain('Dataset origin statement'); expect(html).toContain('generated and checked');
  expect(html).toContain('Dataset limitations'); expect(html).toContain('Coverage varies by month.');
  expect(html).not.toMatch(/unknown|N\/A|not available/i);
});

it('renders every aggregate derivation label and time, including a suppressed other group', () => {
  const html = renderToStaticMarkup(<AtAGlance summary={summary} />);
  expect(html).toContain('Derivation: seller_entered at');
  expect(html).toContain('2026-09-19T08:00:00Z');
  expect(html).toContain('Derivation: locally_derived at');
  expect(html).toContain('2026-09-19T08:00:30Z');
  expect(html).toContain('2026-09-19T08:01:00Z');
  expect(html).toContain('other: 10');
  expect(html).toContain('Null count: 0');
});

it('omits missing limitations without an assurance or placeholder and keeps text inert', () => {
  const html = renderToStaticMarkup(<AtAGlance summary={{profile: summary.profile, row_meaning: field('<script>alert(1)</script>'), format: field('not real', 'absent')}} />);
  expect(html).not.toContain('<script>'); expect(html).toContain('&lt;script&gt;');
  expect(html).not.toContain('Dataset limitations'); expect(html).not.toContain('Format');
  expect(html).not.toMatch(/no known limitations|none stated|unknown|N\/A|not available|not real/i);
});

it('always uses buyer-visible attribution wording and has no audience input', () => {
  const html = renderToStaticMarkup(<AtAGlance summary={summary} />);
  expect(html).toContain('provided by the seller');
  expect(html).not.toMatch(/entered by you/i);
  expect(provenanceLabels).toEqual({aim_metadata: 'from AIM Data', seller_entered: 'provided by the seller', allai_generated: 'generated and checked', absent: 'not available'});
});

it('does not render unreviewed unknown fields', () => {
  const unreviewed = {...summary, unexpected: field('UNREVIEWED VALUE')};
  expect(renderToStaticMarkup(<AtAGlance summary={unreviewed} />)).not.toContain('UNREVIEWED VALUE');
});

it.each([[0, '0 bytes'], [1000, '1 KB'], [2500000, '2.5 MB'], [3000000000, '3 GB']])('formats %s bytes without inventing dataset scope', (bytes, display) => {
  const html = renderToStaticMarkup(<AtAGlance summary={{profile: summary.profile, size_bytes: field(bytes)}} />);
  expect(html).toContain(`title="${Number(bytes).toLocaleString('en-US')} bytes">${display}</p>`);
  expect(html).not.toContain('dataset/file total');
});

it('labels omitted description and unit cells without placeholder glyphs', () => {
  const html = renderToStaticMarkup(<AtAGlance summary={summary} />);
  expect(html).toContain('aria-label="no description"></td>');
  expect(html).toContain('aria-label="no unit"></td>');
  expect(html).not.toMatch(/<td[^>]*>[—-]<\/td>/);
});

it('renders no markup for empty summaries', () => {
  for (const empty of [...emptySummaries, {profile: summary.profile, unexpected: field('unsupported')}]) {
    expect(renderToStaticMarkup(<AtAGlance summary={empty} />)).toBe('');
  }
});

it('keeps duplicate and malformed legacy columns non-throwing', () => {
  const malformed = {...summary,
    key_fields: field([{name: 'id', type: 'string'}, {name: 'id', type: 'integer'}, {name: 7, type: 'integer'}, {name: '', type: 'string'}] as never),
    field_descriptions: field([{name: 'id', description: 'ambiguous'}, {name: 'id', description: 'duplicate'}] as never),
  };
  expect(() => renderToStaticMarkup(<AtAGlance summary={malformed} />)).not.toThrow();
});
