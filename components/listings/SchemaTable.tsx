import {joinApprovedColumns, type ApprovedColumn, type ApprovedDescription} from '@/lib/listing-preview/columns';

// The legacy variant preserves the Schema Information block byte-for-byte.
export default function SchemaTable({columns, descriptions = [], variant = 'legacy'}: {
  columns: ApprovedColumn[]; descriptions?: ApprovedDescription[]; variant?: 'legacy' | 'summary';
}) {
  const summary = variant === 'summary';
  const showDescription = descriptions.some(detail => detail.description);
  const showUnit = descriptions.some(detail => detail.unit);
  return <div className={summary ? 'max-w-full overflow-x-auto' : 'overflow-x-auto'}
    tabIndex={summary ? 0 : undefined} role={summary ? 'region' : undefined} aria-label={summary ? 'Key fields schema' : undefined}>
    <table className="min-w-full text-sm border border-gray-200 rounded-lg">
      <thead><tr className="bg-gray-50">{[summary ? 'Name' : 'Column', 'Type', ...(showDescription ? ['Description'] : []), ...(showUnit ? ['Unit'] : [])].map(title =>
        <th key={title} scope={summary ? 'col' : undefined} className="px-3 py-2 text-left font-medium text-gray-700 border-b">{title}</th>)}</tr></thead>
      <tbody>{joinApprovedColumns(columns, descriptions).map(column => {
        const detail = column;
        return <tr key={column.name} className="border-b border-gray-100 last:border-0">
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
