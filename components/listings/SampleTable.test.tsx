// @vitest-environment jsdom
import {webcrypto} from 'node:crypto';
import {act, cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import {afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import {verifiedFixture} from '@/tests/previewFixture';
import type {Cell, Descriptor, Json} from '@/lib/listing-preview/types';
import SampleTable, {cellText, compareCells} from './SampleTable';

beforeAll(() => {vi.stubGlobal('crypto', webcrypto);});
afterEach(cleanup);
describe('lossless inert table', () => {
  it.each([
    ['9007199254740993', '9007199254740992', 1], ['-9007199254740993', '-9007199254740992', -1],
    ['0.00000000000000000001', '0.00000000000000000002', -1], ['-0.2', '-0.11', -1], ['12.3', '12.30', 0],
  ])('compares %s and %s losslessly', (a, b, expected) => expect(compareCells({kind: 'decimal', value: a}, {kind: 'decimal', value: b})).toBe(expected));
  it('distinguishes null, missing, empty, booleans and nanosecond timestamps', () => {
    expect(cellText({kind: 'missing', value: null})).toBe('missing'); expect(cellText({kind: 'null', value: null})).toBe('null'); expect(cellText({kind: 'string', value: ''})).toBe('empty string');
    expect(compareCells({kind: 'missing', value: null}, {kind: 'null', value: null})).toBe(-1);
    expect(compareCells({kind: 'boolean', value: false}, {kind: 'boolean', value: true})).toBe(-1);
    expect(compareCells({kind: 'timestamp', value: '2026-01-01T00:00:00.000000001Z'}, {kind: 'timestamp', value: '2026-01-01T00:00:00.000000002Z'})).toBe(-1);
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
    fireEvent.change(screen.getByLabelText('Search column'), {target: {value: 'id'}}); expect(screen.getByRole('status').textContent).toContain('Showing 0');
    fireEvent.click(screen.getByText('Clear filter')); expect(rows()).toHaveLength(2); expect(JSON.stringify(sample.entries)).toBe(original);
    fireEvent.change(screen.getByLabelText('Search sample'), {target: {value: '.*'}}); expect(rows()).toHaveLength(0);
  });
  it('renders expansion as literal text, Escape returns focus, and values cause no network/storage', async () => {
    const marker = '<script>ROW_MARKER</script> https://example.test =SUM(A1) '; const long = marker + 'x'.repeat(240);
    // Synthetic table fixture bypasses policy ONLY in the test helper to verify
    // inert DOM behavior even for content that production policy must refuse.
    const {sample} = await verifiedFixture([{text: long}], [['text', 'string', false, {}]]);
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch); const storage = vi.spyOn(Storage.prototype, 'setItem');
    render(<SampleTable sample={sample} columns={sample.manifest.columns} />);
    expect(document.querySelector('script')).toBeNull(); expect(document.querySelector('a')).toBeNull();
    const expand = screen.getByRole('button', {name: 'Expand text'}); expand.focus(); fireEvent.click(expand);
    expect(screen.getByText(long)).toBeTruthy(); expect(expand.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(expand, {key: 'Escape'}); expect(expand.getAttribute('aria-expanded')).toBe('false'); expect(document.activeElement).toBe(expand);
    fireEvent.change(screen.getByLabelText('Search sample'), {target: {value: 'FILTER_MARKER'}});
    expect(fetch).not.toHaveBeenCalled(); expect(storage).not.toHaveBeenCalled(); storage.mockRestore();
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
    expect(screen.getByText('This sample row matches the dataset commitment recorded by the seller.')).toBeTruthy();
  });
  it('cannot render a handle deserialized from JSON', async () => {
    const {sample} = await verifiedFixture(); const view = render(<SampleTable sample={JSON.parse(JSON.stringify(sample))} columns={sample.manifest.columns} />);
    expect(view.container.innerHTML).toBe('');
  });
});
