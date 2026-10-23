import type { GatewayFile } from '@/types/sellerGateway';

// Mirrors ai-market-backend app/services/gateway_file_metadata.py TABLE_FORMATS / is_table_member.
export const TABLE_FORMATS = {
  'text/csv': 'csv',
  'text/tab-separated-values': 'tsv',
  'application/x-ndjson': 'jsonl',
  'application/vnd.apache.parquet': 'parquet',
} as const;
export type TableFormat = typeof TABLE_FORMATS[keyof typeof TABLE_FORMATS];

export function isTableMember(file: GatewayFile): boolean {
  return Object.hasOwn(TABLE_FORMATS, file.media_type)
    && (file.description.columns.length > 0 || file.description.row_count > 0);
}

export function gatewayListingMetadata(files: GatewayFile[]) {
  const tables = files.filter(isTableMember);
  const formats = tables.map(file => TABLE_FORMATS[file.media_type as keyof typeof TABLE_FORMATS]);
  const columns = tables[0]?.description.columns ?? [];
  const commonColumns = tables.every(file => file.description.columns.length === columns.length
    && file.description.columns.every((column, index) => column.name === columns[index].name && column.type === columns[index].type));
  return {
    ...(formats.length > 0 && formats.every(format => format === formats[0]) ? { data_format: formats[0] } : {}),
    schema_info: {
      row_count: tables.reduce((sum, file) => sum + file.description.row_count, 0),
      columns: commonColumns ? columns.map(({ name, type }) => ({ name, type })) : [],
    },
  };
}
