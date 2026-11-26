export const SALES_FILTERS = [
  { value: 'pending_delivery', label: 'Awaiting delivery' },
  { value: 'all', label: 'All' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'completed', label: 'Completed' },
] as const;

export type SalesFilter = (typeof SALES_FILTERS)[number]['value'];

export function parseSalesFilter(value: unknown): SalesFilter | undefined {
  return SALES_FILTERS.find((filter) => filter.value === value)?.value;
}

export function parseSalesOffset(value: string | null, pageSize: number): number | undefined {
  if (value === null || !/^\d+$/.test(value)) return undefined;
  const offset = Number(value);
  return Number.isSafeInteger(offset) && offset % pageSize === 0 ? offset : undefined;
}

export function salesSearchParams(current: string, filter: SalesFilter, offset: number): string {
  const params = new URLSearchParams(current);
  params.set('status', filter);
  if (offset === 0) params.delete('offset');
  else params.set('offset', String(offset));
  return params.toString();
}
