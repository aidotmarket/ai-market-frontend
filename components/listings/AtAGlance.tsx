import type {ListingSummary, SummaryField} from '@/lib/api';

export const provenanceLabels = {
  aim_metadata: 'from AIM Data', seller_entered: 'entered by you',
  allai_generated: 'generated and checked', absent: 'not available',
} as const;
const fields = [
  ['row_meaning', 'What one row represents'], ['intended_uses', 'Intended uses'],
  ['key_fields', 'Key fields'], ['field_descriptions', 'Field descriptions and units'],
  ['row_count', 'Row count'], ['column_count', 'Column count'], ['size_bytes', 'Size'],
  ['format', 'Format'], ['spatial_coverage', 'Geographic coverage'],
  ['temporal_coverage', 'Time coverage'], ['data_languages', 'Data language coverage'],
  ['freshness', 'Freshness'], ['license', 'Licence'], ['delivery', 'Delivery'],
  ['privacy_status', 'Trust/privacy status'], ['sample_availability', 'Sample availability'],
] as const;

type Audience = 'seller' | 'buyer';
function Provenance({field, audience}: {field: SummaryField; audience: Audience}) {
  return <p className="mt-1 text-xs text-gray-600">Source: {field.provenance === 'seller_entered' && audience === 'buyer' ? 'provided by the seller' : provenanceLabels[field.provenance]}
    {field.authority === 'seller_local_report' && ' (seller/local report)'}
    {field.authority === 'publication_bound' && ' (approved publication)'}
  </p>;
}

// One inert renderer for the seller preview and the public approved projection.
export default function AtAGlance({summary, audience}: {summary?: ListingSummary | null; audience: Audience}) {
  if (!summary) return null;
  const descriptions = summary.field_descriptions?.provenance === 'absent' ? [] : summary.field_descriptions?.value ?? [];
  return <section aria-label="At a glance" className="min-w-0 space-y-4 rounded-xl border border-gray-200 bg-white p-5 break-words">
    <h2 className="text-lg font-semibold text-gray-900">At a glance</h2>
    {fields.map(([key, label]) => {
      const field = summary[key];
      if (!field || field.provenance === 'absent') return null;
      const value = field.value;
      return <div key={key} className="min-w-0">
        <h3 className="text-sm font-medium text-gray-900">{label}</h3>
        {key === 'key_fields' ? <div className="max-w-full overflow-x-auto" tabIndex={0} role="region" aria-label="Key fields schema">
          <table className="min-w-full text-sm border border-gray-200 rounded-lg">
            <thead><tr className="bg-gray-50">{['Name', 'Type', ...(descriptions.some(d => d.description) ? ['Description'] : []), ...(descriptions.some(d => d.unit) ? ['Unit'] : [])].map(title =>
              <th key={title} scope="col" className="px-3 py-2 text-left font-medium text-gray-700 border-b">{title}</th>)}</tr></thead>
            <tbody>{summary.key_fields?.value.map(column => {
              const detail = descriptions.find(d => d.name === column.name);
              return <tr key={column.name} className="border-b border-gray-100 last:border-0">
                <th scope="row" className="px-3 py-1.5 text-left font-mono font-normal text-gray-900">{column.name}</th>
                <td className="px-3 py-1.5 text-gray-600">{column.type}</td>
                {descriptions.some(d => d.description) && <td className="px-3 py-1.5">{detail?.description}</td>}
                {descriptions.some(d => d.unit) && <td className="px-3 py-1.5">{detail?.unit}</td>}
              </tr>;
            })}</tbody>
          </table>
        </div> : key === 'field_descriptions' ? <ul className="space-y-1 text-sm text-gray-700">{descriptions.map(d =>
          <li key={d.name}><span className="font-mono">{d.name}</span>{d.description && <>: {d.description}</>}{d.unit && <> — {d.unit}</>}</li>)}</ul>
          : Array.isArray(value) ? <ul className="list-inside list-disc text-sm text-gray-700">{(value as string[]).map((item, i) => <li key={i}>{item}</li>)}</ul>
          : <p className="text-sm text-gray-700">{typeof value === 'number' ? value.toLocaleString('en-US') : value}{key === 'size_bytes' && ' bytes (dataset/file total)'}{key === 'freshness' && ' (declared cadence)'}</p>}
        <Provenance field={field} audience={audience} />
      </div>;
    })}
  </section>;
}
