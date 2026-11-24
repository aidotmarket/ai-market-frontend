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
