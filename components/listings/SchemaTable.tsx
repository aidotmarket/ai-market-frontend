import type {ApprovedColumn, ApprovedDescription} from '@/lib/listing-preview/columns';

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

/** Legacy API metadata is deliberately tolerant. Only an unambiguous exact
 * string name may acquire labels; malformed or duplicate names stay inert. */
function joinLegacyColumns(columns: unknown, descriptions: unknown): ApprovedColumn[] {
  const rawColumns = Array.isArray(columns) ? columns : [];
  const rawDescriptions = Array.isArray(descriptions) ? descriptions : [];
  const columnNames = rawColumns.map(column => column && typeof column === 'object' ? (column as {name?: unknown}).name : undefined);
  const descriptionNames = rawDescriptions.map(detail => detail && typeof detail === 'object' ? (detail as {name?: unknown}).name : undefined);
  return rawColumns.map(column => {
    const raw = column && typeof column === 'object' ? column as {name?: unknown; type?: unknown} : {};
    const name = text(raw.name), type = text(raw.type);
    const unambiguous = typeof raw.name === 'string' && raw.name.length > 0
      && columnNames.filter(value => value === raw.name).length === 1
      && descriptionNames.filter(value => value === raw.name).length === 1;
    const found = unambiguous ? rawDescriptions.find(detail => detail && typeof detail === 'object' && (detail as {name?: unknown}).name === raw.name) as {description?: unknown; unit?: unknown} | undefined : undefined;
    return {name, type,
      ...(found ? {
        description: typeof found.description === 'string' ? found.description : undefined,
        unit: typeof found.unit === 'string' ? found.unit : undefined,
      } : {})};
  });
}

// The legacy variant preserves the Schema Information block byte-for-byte.
export default function SchemaTable({columns, descriptions = [], variant = 'legacy'}: {
  columns: ApprovedColumn[] | null; descriptions?: ApprovedDescription[] | null; variant?: 'legacy' | 'summary';
}) {
  const joined = joinLegacyColumns(columns, descriptions);
  const summary = variant === 'summary';
  const showDescription = joined.some(column => typeof column.description === 'string' && column.description.length > 0);
  const showUnit = joined.some(column => typeof column.unit === 'string' && column.unit.length > 0);
  return <div className={summary ? 'max-w-full overflow-x-auto' : 'overflow-x-auto'}
    tabIndex={summary ? 0 : undefined} role={summary ? 'region' : undefined} aria-label={summary ? 'Key fields schema' : undefined}>
    <table className="min-w-full text-sm border border-gray-200 rounded-lg">
      <thead><tr className="bg-gray-50">{[summary ? 'Name' : 'Column', 'Type', ...(showDescription ? ['Description'] : []), ...(showUnit ? ['Unit'] : [])].map(title =>
        <th key={title} scope={summary ? 'col' : undefined} className="px-3 py-2 text-left font-medium text-gray-700 border-b">{title}</th>)}</tr></thead>
      <tbody>{joined.map((column, index) => {
        const detail = column;
        return <tr key={`${column.name}:${index}`} className="border-b border-gray-100 last:border-0">
          {summary ? <th scope="row" className="px-3 py-1.5 text-left font-mono font-normal text-gray-900">{column.name}</th>
            : <td className="px-3 py-1.5 text-gray-900 font-mono">{column.name}</td>}
          <td className="px-3 py-1.5 text-gray-600">{column.type}</td>
          {showDescription && <td className="px-3 py-1.5" aria-label={detail?.description ? undefined : 'no description'}>{detail?.description || undefined}</td>}
          {showUnit && <td className="px-3 py-1.5" aria-label={detail?.unit ? undefined : 'no unit'}>{detail?.unit || undefined}</td>}
        </tr>;
      })}</tbody>
    </table>
  </div>;
}
