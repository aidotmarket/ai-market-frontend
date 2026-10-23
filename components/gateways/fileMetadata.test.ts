import { expect, it } from 'vitest';
import { file } from '@/app/dashboard/gateways/fixtures';
import { gatewayListingMetadata, isTableMember } from './fileMetadata';
import type { GatewayFile } from '@/types/sellerGateway';

const column = { name: 'id', type: 'integer', null_rate_pct: 0, distinct_bucket: '2-10' };
function member(media_type: string, row_count = 0, columns: GatewayFile['description']['columns'] = []): GatewayFile {
  return { ...file, media_type, description: { ...file.description, state: 'described', row_count, columns } };
}

it.each(['text/csv', 'text/tab-separated-values', 'application/x-ndjson', 'application/vnd.apache.parquet'])(
  'classifies %s by columns or rows, including dropped columns and header-only tables', mediaType => {
    expect(isTableMember(member(mediaType, 0, [column]))).toBe(true);
    expect(isTableMember(member(mediaType, 3))).toBe(true);
    expect(isTableMember(member(mediaType))).toBe(false);
  },
);

it.each(['application/octet-stream', 'application/pdf', 'application/zip', 'application/json', 'application/x-parquet', 'toString'])(
  'never treats %s as a table even when the description has rows or columns', mediaType => {
    expect(isTableMember(member(mediaType, 3, [column]))).toBe(false);
  },
);

it('omits a format and leaves schema empty for all-other-files and empty selections', () => {
  for (const files of [[], [member('application/octet-stream'), member('text/csv')]]) {
    expect(gatewayListingMetadata(files)).toEqual({ schema_info: { row_count: 0, columns: [] } });
  }
});

it('ignores other files in format, schema and row counts regardless of selection order', () => {
  const table = member('text/csv', 3, [column]);
  const other = member('application/octet-stream', 999, [{ ...column, name: 'not_a_table' }]);
  for (const files of [[other, table], [table, other]]) {
    expect(gatewayListingMetadata(files)).toEqual({ data_format: 'csv', schema_info: { row_count: 3, columns: [{ name: 'id', type: 'integer' }] } });
  }
});

it('keeps shared schema across different table formats and sums only table rows', () => {
  expect(gatewayListingMetadata([member('text/csv', 2, [column]), member('application/x-ndjson', 4, [column])]))
    .toEqual({ schema_info: { row_count: 6, columns: [{ name: 'id', type: 'integer' }] } });
});

it.each([
  { columns: [{ ...column, name: 'different' }] },
  { columns: [{ ...column, type: 'string' }] },
  { columns: [] },
  { columns: [column, { ...column, name: 'extra' }] },
])('keeps the shared format without claiming a common schema: $columns', ({ columns }) => {
  expect(gatewayListingMetadata([member('text/csv', 2, [column]), member('text/csv', 4, columns)]))
    .toEqual({ data_format: 'csv', schema_info: { row_count: 6, columns: [] } });
});

it('does not confuse profiling statistics with schema differences', () => {
  expect(gatewayListingMetadata([member('text/csv', 2, [column]), member('text/csv', 4, [{ ...column, null_rate_pct: 50 }])]).schema_info.columns)
    .toEqual([{ name: 'id', type: 'integer' }]);
});
