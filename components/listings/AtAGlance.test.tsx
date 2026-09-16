import {expect, it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import AtAGlance, {provenanceLabels} from './AtAGlance';
import sectionC from '@/tests/summarySectionC.json';
import {summary, field} from '@/tests/summaryFixture';
it('renders nothing when absent, without even a wrapper', () => {
  expect(renderToStaticMarkup(<AtAGlance audience="seller" />)).toBe('');
  expect(renderToStaticMarkup(<AtAGlance audience="seller" summary={null} />)).toMatchInlineSnapshot('""');
});
it('renders the complete ordered metadata with inert schema cells', () => {
  const html = renderToStaticMarkup(<AtAGlance audience="seller" summary={summary} />);
  expect(html).toMatchSnapshot();
  const headings = [...html.matchAll(/<h3[^>]*>(.*?)<\/h3>/g)].map(match => match[1]);
  expect(headings).toEqual(sectionC.fields.filter(label => label !== 'Price'));
  expect(html).toContain('title="12,345 bytes">12.35 KB</p>');
  expect(html).toContain('>0</p>');
  expect(html).toContain('scope="col"');
  expect(html).toContain('Sale amount'); expect(html).toContain('EUR');
  expect(html).not.toMatch(/unknown|N\/A|not available/i);
});
it('omits missing and absent fields without defaults, and keeps text inert', () => {
  const html = renderToStaticMarkup(<AtAGlance audience="seller" summary={{profile: summary.profile, row_meaning: field('<script>alert(1)</script>'), format: field('not real', 'absent')}} />);
  expect(html).not.toContain('<script>'); expect(html).toContain('&lt;script&gt;');
  expect(html).not.toContain('Format'); expect(html).not.toContain('Row count');
  expect(html).not.toMatch(/unknown|N\/A|not available|not real/i);
  expect(provenanceLabels).toEqual({aim_metadata: 'from AIM Data', seller_entered: 'entered by you', allai_generated: 'generated and checked', absent: 'not available'});
});

it('never addresses the buyer as you', () => {
  const html = renderToStaticMarkup(<AtAGlance audience="buyer" summary={summary} />);
  expect(html).not.toContain('you');
  expect(html).toContain('provided by the seller');
});

it('does not render unreviewed unknown fields', () => {
  const unreviewed = {...summary, unexpected: field('UNREVIEWED VALUE')};
  expect(renderToStaticMarkup(<AtAGlance audience="seller" summary={unreviewed} />)).not.toContain('UNREVIEWED VALUE');
});

it.each([[0, '0 bytes'], [1000, '1 KB'], [2500000, '2.5 MB'], [3000000000, '3 GB']])('formats %s bytes without inventing dataset scope', (bytes, display) => {
  const html = renderToStaticMarkup(<AtAGlance audience="buyer" summary={{profile: summary.profile, size_bytes: field(bytes)}} />);
  expect(html).toContain(`title="${Number(bytes).toLocaleString('en-US')} bytes">${display}</p>`);
  expect(html).not.toContain('dataset/file total');
});
