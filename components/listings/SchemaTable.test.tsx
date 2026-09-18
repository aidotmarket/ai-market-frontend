// @vitest-environment jsdom
import {expect, it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import SchemaTable from './SchemaTable';

const legacyCases: [unknown, string][] = [
  [[{name: 'id', type: 'string'}, {name: 'id', type: 'integer'}], 'duplicate names'],
  [[{name: '', type: 'string'}], 'an empty name'],
  [[{name: 7, type: 'integer'}], 'a non-string name'],
  [null, 'a null schema'],
];
it.each(legacyCases)('renders legacy columns with %s without throwing', (columns) => {
  expect(() => renderToStaticMarkup(<SchemaTable columns={columns as never} />)).not.toThrow();
});

it('omits labels for ambiguous legacy names while retaining duplicate rows', () => {
  const html = renderToStaticMarkup(<SchemaTable variant="summary"
    columns={[{name: 'id', type: 'string'}, {name: 'id', type: 'integer'}]}
    descriptions={[{name: 'id', description: 'first'}, {name: 'id', description: 'second'}]} />);
  expect(html.match(/<tr/g)).toHaveLength(3);
  expect(html).not.toContain('first');
  expect(html).not.toContain('second');
});

it.each([
  ['description', {description: {unsafe: true}}, [{name: 'labelled', description: 'safe'}]],
  ['unit', {unit: ['unsafe']}, [{name: 'labelled', unit: 'kg'}]],
  ['type', {type: {unsafe: true}}, []],
])('renders an object-valued legacy %s field inertly', (_field, unsafe, descriptions) => {
  expect(() => renderToStaticMarkup(<SchemaTable variant="summary"
    columns={[{name: 'unsafe', type: 'string', ...unsafe}, {name: 'labelled', type: 'string'}] as never}
    descriptions={descriptions as never} />)).not.toThrow();
});
