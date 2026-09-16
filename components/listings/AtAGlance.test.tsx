import {expect, it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import AtAGlance, {provenanceLabels} from './AtAGlance';
import {summary, field} from '@/tests/summaryFixture';
it('renders nothing when absent, without even a wrapper', () => {
  expect(renderToStaticMarkup(<AtAGlance />)).toBe('');
  expect(renderToStaticMarkup(<AtAGlance summary={null} />)).toMatchInlineSnapshot('""');
});
it('renders the complete ordered metadata with inert schema cells', () => {
  const html = renderToStaticMarkup(<AtAGlance summary={summary} />);
  expect(html).toMatchSnapshot();
  const labels = ['What one row represents', 'Intended uses', 'Key fields', 'Field descriptions and units', 'Row count', 'Column count', 'Size', 'Format', 'Geographic coverage', 'Time coverage', 'Data language coverage', 'Freshness', 'Licence', 'Delivery', 'Trust/privacy status', 'Sample availability'];
  for (let i = 1; i < labels.length; i++) expect(html.indexOf(labels[i])).toBeGreaterThan(html.indexOf(labels[i - 1]));
  expect(html).toContain('12,345 bytes');
  expect(html).toContain('>0</p>');
  expect(html).toContain('scope="col"');
  expect(html).toContain('Sale amount'); expect(html).toContain('EUR');
  expect(html).not.toMatch(/unknown|N\/A|not available/i);
});
it('omits missing and absent fields without defaults, and keeps text inert', () => {
  const html = renderToStaticMarkup(<AtAGlance summary={{profile: summary.profile, row_meaning: field('<script>alert(1)</script>'), format: field('not real', 'absent')}} />);
  expect(html).not.toContain('<script>'); expect(html).toContain('&lt;script&gt;');
  expect(html).not.toContain('Format'); expect(html).not.toContain('Row count');
  expect(html).not.toMatch(/unknown|N\/A|not available|not real/i);
  expect(provenanceLabels).toEqual({aim_metadata: 'from AIM Data', seller_entered: 'entered by you', allai_generated: 'generated and checked', absent: 'not available'});
});
