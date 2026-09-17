export interface ApprovedColumn {name: string; type: string; description?: string | null; unit?: string | null}
export type ApprovedDescription = Pick<ApprovedColumn, 'name' | 'description' | 'unit'>;

/** Exact-name join. No cell inference, mutable schema labels, or fuzzy matching. */
export function joinApprovedColumns(columns: readonly ApprovedColumn[], descriptions: readonly ApprovedDescription[] = []): ApprovedColumn[] {
  if (new Set(columns.map(c => c.name)).size !== columns.length || new Set(descriptions.map(c => c.name)).size !== descriptions.length) {
    throw new Error('approved_column_mismatch');
  }
  return columns.map(column => {
    const detail = descriptions.find(d => d.name === column.name);
    return {...column, ...(detail ? {description: detail.description, unit: detail.unit} : {})};
  });
}
