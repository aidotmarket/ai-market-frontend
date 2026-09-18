"use client";

import {useId, useMemo, useRef, useState} from 'react';
import {flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState} from '@tanstack/react-table';
import type {Cell, Descriptor, Json, VerifiedEntry, VerifiedSample} from '@/lib/listing-preview/types';
import type {ApprovedColumn} from '@/lib/listing-preview/columns';
import {isVerifiedSample} from '@/lib/listing-preview/verifier';
import {canonical} from '@/lib/listing-preview/primitives';

export function inertText(value: string): string {
  return value.replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu, '\uFFFD');
}
function neutralizedCanonical(value: Json): string {
  if (typeof value === 'string') return canonical(inertText(value));
  if (Array.isArray(value)) return `[${value.map(neutralizedCanonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${canonical(inertText(key))}:${neutralizedCanonical(value[key])}`).join(',')}}`;
  return canonical(value);
}
export function cellText(cell: Cell): string {
  if (cell.kind === 'missing' || cell.kind === 'null') return cell.kind;
  if (cell.kind === 'string' && cell.value === '') return 'empty string';
  return typeof cell.value === 'string' ? inertText(cell.value) : neutralizedCanonical(cell.value);
}
function decimalParts(value: string): [bigint, number] {
  const [whole, fraction = ''] = value.split('.'); return [BigInt(whole + fraction), fraction.length];
}
function typeLabel(column: ApprovedColumn, descriptors: readonly Descriptor[]): string {
  const descriptor = descriptors.find(d => d[0] === column.name);
  if (column.type === 'decimal') return inertText(`decimal (precision ${descriptor?.[3].precision}, scale ${descriptor?.[3].scale})`);
  if (column.type === 'timestamp') return inertText(`timestamp (UTC, precision ${descriptor?.[3].timestamp_precision})`);
  return inertText(column.type);
}
export function compareCells(a: Cell, b: Cell): number {
  const rank = (c: Cell) => c.kind === 'missing' ? 0 : c.kind === 'null' ? 1 : 2;
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  if (rank(a) < 2) return 0;
  if ((a.kind === 'signed_integer' || a.kind === 'decimal') && (b.kind === 'signed_integer' || b.kind === 'decimal')) {
    const [aa, ap] = decimalParts(String(a.value)), [bb, bp] = decimalParts(String(b.value));
    const left = aa * 10n ** BigInt(bp), right = bb * 10n ** BigInt(ap); return left < right ? -1 : left > right ? 1 : 0;
  }
  if (a.kind === 'boolean' && b.kind === 'boolean') return Number(a.value) - Number(b.value);
  // Canonical UTC timestamps at one declared precision and ISO dates sort
  // lexically without losing sub-millisecond precision. Nested values are inert.
  const left = cellText(a), right = cellText(b); return left < right ? -1 : left > right ? 1 : 0;
}
function SampleCell({cell, name}: {cell: Cell; name: string}) {
  const [expanded, setExpanded] = useState(false), button = useRef<HTMLButtonElement>(null), id = useId();
  const text = cellText(cell), inertName = inertText(name), long = Array.from(text).length > 200, nested = cell.kind === 'array' || cell.kind === 'object';
  return <div className="min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]" onKeyDown={event => {
    if (event.key === 'Escape' && expanded) {event.preventDefault(); setExpanded(false); button.current?.focus();}
  }}>
    <span id={id}>{long && !expanded ? Array.from(text).slice(0, 200).join('') + '…' : text}</span>
    {(long || nested) && <button ref={button} type="button" aria-expanded={expanded} aria-controls={id}
      aria-label={`${expanded ? 'Collapse' : 'Expand'} ${inertName}`} onClick={() => setExpanded(v => !v)}
      className="ml-2 rounded px-1 text-indigo-700 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700">
      {expanded ? 'Collapse' : 'Expand'}
    </button>}
  </div>;
}

function VerifiedTable({sample, columns}: {sample: VerifiedSample; columns: readonly ApprovedColumn[]}) {
  const [sorting, setSorting] = useState<SortingState>([]), [query, setQuery] = useState(''), [field, setField] = useState('');
  const globalFilter = useMemo(() => ({query, field}), [query, field]);
  const searchId = useId(), columnId = useId();
  const defs = useMemo<ColumnDef<VerifiedEntry>[]>(() => columns.map(column => ({
    id: column.name, accessorFn: row => row.cells[column.name], sortUndefined: false,
    sortingFn: (a, b) => compareCells(a.original.cells[column.name], b.original.cells[column.name]),
    header: () => <><span className="font-mono">{inertText(column.name)}</span><span className="block text-xs font-normal">Type: {typeLabel(column, sample.manifest.schema_descriptors)}</span>
      {column.description && <span className="block text-xs font-normal">{inertText(column.description)}</span>}
      {column.unit && <span className="block text-xs font-normal">Unit: {inertText(column.unit)}</span>}</>,
    cell: info => <SampleCell cell={info.row.original.cells[column.name]} name={column.name} />,
  })), [columns, sample.manifest.schema_descriptors]);
  const data = useMemo(() => [...sample.entries], [sample]);
  const table = useReactTable({data, columns: defs, state: {sorting, globalFilter}, onSortingChange: setSorting, autoResetPageIndex: false,
    getRowId: row => row.proofId, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getFilteredRowModel: getFilteredRowModel(),
    enableMultiSort: false, sortDescFirst: false, getColumnCanGlobalFilter: () => true,
    globalFilterFn: row => {
      const literal = query.toLocaleLowerCase('en-US');
      return columns.filter((_, index) => !field || String(index) === field).some(c => cellText(row.original.cells[c.name]).toLocaleLowerCase('en-US').includes(literal));
    },
  });
  const count = table.getRowModel().rows.length;
  return <div className="min-w-0 max-w-full space-y-3">
    <p className="text-sm">{sample.entries.length} seller-selected sample rows from {sample.manifest.commitment.leaf_count.toLocaleString('en-US')} dataset rows.</p>
    <p className="text-sm">These rows are verified to belong to the seller&apos;s dataset and are shown as the seller published them.</p>
    <p className="text-sm text-gray-600">Membership does not prove quality, representativeness, legality, compliance, seller identity or completeness against an external source.</p>
    <p className="text-sm">Last attested by seller: {inertText(sample.manifest.last_attested_by_seller_at)}{sample.manifest.stale && <strong className="ml-2">Stale</strong>}</p>
    <div className="flex min-w-0 flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1"><label htmlFor={searchId} className="block text-sm">Search sample</label>
        <input id={searchId} value={query} onChange={e => setQuery(e.target.value)} type="search" autoComplete="off"
          className="w-full min-w-0 rounded border border-gray-400 px-2 py-1 focus-visible:outline-2 focus-visible:outline-indigo-700" /></div>
      <div className="min-w-0 max-w-full"><label htmlFor={columnId} className="block text-sm">Search column</label>
        <select id={columnId} value={field} onChange={e => setField(e.target.value)} className="max-w-full rounded border border-gray-400 px-2 py-1 focus-visible:outline-2 focus-visible:outline-indigo-700">
          <option value="">All columns</option>{columns.map((c, index) => <option key={c.name} value={String(index)}>{inertText(c.name)}</option>)}
        </select></div>
      <button type="button" onClick={() => {setQuery(''); setField('');}} className="rounded border border-gray-400 px-2 py-1 text-sm focus-visible:outline-2 focus-visible:outline-indigo-700">Clear filter</button>
    </div>
    <p role="status" aria-live="polite" aria-atomic="true" className="text-sm">Showing {count} of {sample.entries.length} seller-selected sample rows.</p>
    <div role="region" aria-label="Seller-selected sample table" tabIndex={0}
      className="min-w-0 max-w-full overflow-auto rounded border border-gray-200 focus-visible:outline-2 focus-visible:outline-indigo-700" style={{maxHeight: '60vh'}}>
      <table aria-label="Seller-selected sample" className="w-full border-collapse text-sm">
        <caption className="p-2 text-left font-semibold">These rows are verified to belong to the seller&apos;s dataset and are shown as the seller published them.</caption>
        <thead><tr>{table.getHeaderGroups()[0].headers.map(header => <th key={header.id} scope="col"
          aria-sort={header.column.getIsSorted() === 'asc' ? 'ascending' : header.column.getIsSorted() === 'desc' ? 'descending' : 'none'}
          className="border-b bg-gray-50 p-2 text-left align-top">
          <button type="button" onClick={header.column.getToggleSortingHandler()} className="max-w-full rounded text-left break-words [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-indigo-700"
            aria-label={`Sort ${inertText(header.column.id)}: ${header.column.getNextSortingOrder() === 'asc' ? 'ascending' : header.column.getNextSortingOrder() === 'desc' ? 'descending' : 'reset'}`}>
            {flexRender(header.column.columnDef.header, header.getContext())}
          </button></th>)}</tr></thead>
        <tbody>{table.getRowModel().rows.map(row => <tr key={row.id}>{row.getVisibleCells().map(cell =>
          <td key={cell.id} className="max-w-80 min-w-32 border-b p-2 align-top">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody>
      </table>
    </div>
  </div>;
}

export default function SampleTable({sample, columns}: {sample: VerifiedSample; columns: readonly ApprovedColumn[]}) {
  if (!isVerifiedSample(sample) || columns.length !== sample.manifest.columns.length || columns.some((c, i) => c.name !== sample.manifest.columns[i].name || c.type !== sample.manifest.columns[i].type)) return null;
  return <VerifiedTable sample={sample} columns={columns} />;
}
