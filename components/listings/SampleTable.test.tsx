// @vitest-environment jsdom
import {webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {act, cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import {afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import {verifiedFixture} from '@/tests/previewFixture';
import {producerV2ManifestFixture} from '@/tests/producerPreviewFixture';
import type {Cell, Descriptor, Json} from '@/lib/listing-preview/types';
import {verifyManifest} from '@/lib/listing-preview/verifier';
import SampleTable, {cellText, compareCells, inertText} from './SampleTable';

beforeAll(() => {vi.stubGlobal('crypto', webcrypto);});
afterEach(cleanup);
describe('lossless inert table', () => {
  it('verifies the producer real v2 signed manifest before displaying producer-approved row examples', async () => {
    const producer = producerV2ManifestFixture();
    const manifest = await verifyManifest(producer.manifest, producer.keys, producer.manifest.listing_id, producer.now);
    expect(manifest.proofs.every(proof => proof.scan_policy === 'aim-preview-policy-v2')).toBe(true);
    const policy = JSON.parse(readFileSync('tests/fixtures/preview/aim_preview_policy_v2.json', 'utf8')) as {content_examples_that_pass: string[]};
    const rows = policy.content_examples_that_pass.map(value => ({value}));
    const {sample} = await verifiedFixture(rows, [['value', 'string', false, {}]]);
    render(<SampleTable sample={sample} columns={sample.manifest.columns} />);
    for (const {value} of rows) expect(screen.getByText(value)).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe(`Showing ${rows.length} of ${rows.length} seller-selected sample rows.`);
  });
  it.each([
    ['9007199254740993', '9007199254740992', 1], ['-9007199254740993', '-9007199254740992', -1],
    ['0.00000000000000000001', '0.00000000000000000002', -1], ['-0.2', '-0.11', -1], ['12.3', '12.30', 0],
  ])('compares %s and %s losslessly', (a, b, expected) => expect(compareCells({kind: 'decimal', value: a}, {kind: 'decimal', value: b})).toBe(expected));
  it('distinguishes null, missing, empty, booleans and nanosecond timestamps', () => {
    expect(cellText({kind: 'missing', value: null})).toBe('missing'); expect(cellText({kind: 'null', value: null})).toBe('null'); expect(cellText({kind: 'string', value: ''})).toBe('empty string');
    expect(compareCells({kind: 'missing', value: null}, {kind: 'null', value: null})).toBe(-1);
    expect(compareCells({kind: 'boolean', value: false}, {kind: 'boolean', value: true})).toBe(-1);
    expect(compareCells({kind: 'timestamp', value: '2026-01-01T00:00:00.000000001Z'}, {kind: 'timestamp', value: '2026-01-01T00:00:00.000000002Z'})).toBe(-1);
    expect(cellText({kind: 'string', value: 'a\u0000\u200Eb\ud800'})).toBe('a��b�');
    expect(cellText({kind: 'object', value: {'a\u0000': ['b\u200E']}})).toBe('{"a�":["b�"]}');
  });
  it('uses one inert-text mapping for control, format and surrogate code points', () => {
    expect(inertText('left\u0000middle\u202Eright\ud800')).toBe('left�middle�right�');
  });
  it('accepts a lone surrogate through verification and replaces it only at render', async () => {
    const {sample} = await verifiedFixture([{value: '\ud800'}], [['value', 'string', false, {}]]);
    expect(sample.entries[0].row.value).toBe('\ud800');
    expect(() => render(<SampleTable sample={sample} columns={sample.manifest.columns} />)).not.toThrow();
    expect(screen.getByText('�')).toBeTruthy();
  });
  it('sorts ascending/descending/reset, uses proof identity and filters locally', async () => {
    const {sample} = await verifiedFixture(); const original = JSON.stringify(sample.entries);
    render(<SampleTable sample={sample} columns={sample.manifest.columns} />);
    const rows = () => screen.getAllByRole('row').slice(1).map(r => within(r).getAllByRole('cell')[0].textContent);
    const initial = rows(); fireEvent.click(screen.getByRole('button', {name: 'Sort id: ascending'})); expect(rows()).toEqual(['2', '9007199254740993']);
    fireEvent.click(screen.getByRole('button', {name: 'Sort id: descending'})); expect(rows()).toEqual(['9007199254740993', '2']);
    fireEvent.click(screen.getByRole('button', {name: 'Sort id: reset'})); expect(rows()).toEqual(initial);
    fireEvent.change(screen.getByLabelText('Search sample'), {target: {value: 'OATS'}});
    expect(screen.getByRole('status').textContent).toBe('Showing 1 of 2 seller-selected sample rows.');
    fireEvent.change(screen.getByLabelText('Search column'), {target: {value: '0'}}); expect(screen.getByRole('status').textContent).toContain('Showing 0');
    fireEvent.click(screen.getByText('Clear filter')); expect(rows()).toHaveLength(2); expect(JSON.stringify(sample.entries)).toBe(original);
    fireEvent.change(screen.getByLabelText('Search sample'), {target: {value: '.*'}}); expect(rows()).toHaveLength(0);
  });
  it('renders expansion as literal text, Escape returns focus, and values cause no network/storage', async () => {
    const marker = '<script>ROW_MARKER</script><img src=x onerror=alert(1)><a href="https://example.test">link</a> =SUM(A1) '; const long = marker + 'x'.repeat(240);
    const {sample} = await verifiedFixture([{text: long}], [['text', 'string', false, {}]]);
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch); const storage = vi.spyOn(Storage.prototype, 'setItem');
    render(<SampleTable sample={sample} columns={sample.manifest.columns} />);
    expect(document.querySelector('script')).toBeNull(); expect(document.querySelector('img')).toBeNull(); expect(document.querySelector('a')).toBeNull();
    const expand = screen.getByRole('button', {name: 'Expand text'}); expand.focus(); fireEvent.click(expand);
    expect(screen.getByText(long)).toBeTruthy(); expect(expand.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(expand, {key: 'Escape'}); expect(expand.getAttribute('aria-expanded')).toBe('false'); expect(document.activeElement).toBe(expand);
    fireEvent.change(screen.getByLabelText('Search sample'), {target: {value: 'FILTER_MARKER'}});
    expect(fetch).not.toHaveBeenCalled(); expect(storage).not.toHaveBeenCalled(); storage.mockRestore();
  });
  it('renders dates, places, contact data, identifiers, formulas, long prose and neutralized controls', async () => {
    const prose = Array(2000).fill('word').join(' ');
    const row: Record<string, Json> = {
      date: '2026-09-18', place: 'Madrid, Spain', email: 'seller@example.test', url: 'https://seller.example/data',
      uuid: '123e4567-e89b-12d3-a456-426614174000', hash: 'a'.repeat(64), phone: '+34 612 345 678',
      decimal: '-12.5', formula: '=SUM(A1)', controls: 'left\u0000middle\u200Eright\ud800', prose,
    };
    const schema = Object.keys(row).map(name => [name, 'string', false, {}] as Descriptor);
    const {sample} = await verifiedFixture([row], schema);
    render(<SampleTable sample={sample} columns={sample.manifest.columns} />);
    for (const value of Object.values(row).slice(0, 9)) expect(screen.getByText(String(value))).toBeTruthy();
    expect(screen.getByText('left�middle�right�')).toBeTruthy();
    const expand = screen.getByRole('button', {name: 'Expand prose'}); fireEvent.click(expand);
    expect(screen.getByText(prose)).toBeTruthy();
  });
  it('renders explicit states and names/types/descriptions/units in native semantics', async () => {
    const schema: Descriptor[] = [['empty', 'string', true, {}], ['missing', 'string', true, {}], ['nil', 'string', true, {}]];
    const {sample} = await verifiedFixture([{empty: '', nil: null}], schema);
    render(<SampleTable sample={sample} columns={sample.manifest.columns.map(c => ({...c, description: 'Approved meaning', unit: 'kg'}))} />);
    expect(screen.getByRole('table', {name: 'Seller-selected sample'})).toBeTruthy();
    expect(screen.getByRole('region', {name: 'Seller-selected sample table'}).tabIndex).toBe(0);
    expect(screen.getByText('empty string')).toBeTruthy(); expect(screen.getByText('null')).toBeTruthy();
    expect(screen.getAllByRole('cell').map(c => c.textContent)).toEqual(['empty string', 'missing', 'null']);
    expect(screen.getAllByRole('columnheader')).toHaveLength(3); expect(screen.getAllByText('Unit: kg')).toHaveLength(3);
    expect(screen.getAllByText("These rows are verified to belong to the seller's dataset and are shown as the seller published them.")).toHaveLength(2);
  });
  it('neutralizes seller strings at every label, key and expanded-value render site', async () => {
    const name = 'na\u202Eme\u0000\ud800';
    const long = 'start\u0000\u202E\ud800' + 'x'.repeat(220);
    const nestedKey = 'ke\u0000y\u202E\ud800';
    const schema: Descriptor[] = [[name, 'string', false, {}], ['nested', 'object', false,
      {object_fields: [{name: nestedKey, type: 'string', nullable: false, type_parameters: {}}]}]];
    const {sample} = await verifiedFixture([{[name]: long, nested: {[nestedKey]: 'value'}}], schema);
    const columns = sample.manifest.columns.map(column => column.name === name
      ? {...column, description: 'desc\u0000\u202E\ud800', unit: 'u\u0000\u202E\ud800'} : column);
    render(<SampleTable sample={sample} columns={columns} />);

    const inertName = 'na�me��';
    expect(screen.getByRole('columnheader', {name: new RegExp(inertName)}).textContent).toContain(inertName);
    expect(screen.getByRole('option', {name: inertName}).getAttribute('value')).toBe('0');
    expect(screen.getByText('desc���')).toBeTruthy();
    expect(screen.getByText('Unit: u���')).toBeTruthy();
    expect(screen.getByRole('button', {name: `Sort ${inertName}: ascending`})).toBeTruthy();
    expect(screen.getByText('[["ke�y��","string","value"]]')).toBeTruthy();

    const expand = screen.getByRole('button', {name: `Expand ${inertName}`});
    fireEvent.click(expand);
    expect(screen.getByText('start���' + 'x'.repeat(220))).toBeTruthy();
    expect(screen.getByRole('button', {name: `Collapse ${inertName}`})).toBeTruthy();
    expect(document.body.textContent).not.toContain('\u0000');
    expect(document.body.textContent).not.toContain('\u202E');
  });
  it('cannot render a handle deserialized from JSON', async () => {
    const {sample} = await verifiedFixture(); const view = render(<SampleTable sample={JSON.parse(JSON.stringify(sample))} columns={sample.manifest.columns} />);
    expect(view.container.innerHTML).toBe('');
  });
});
