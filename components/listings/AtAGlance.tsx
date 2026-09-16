import SchemaTable from './SchemaTable';
import type {ListingSummary, SummaryField} from '@/lib/api';

export const provenanceLabels = {
  aim_metadata: 'from AIM Data', seller_entered: 'entered by you',
  allai_generated: 'generated and checked', absent: 'not available',
} as const;
// §C includes Price between Licence and Delivery. The summary contract has no
// price field; the existing canonical price card supplies it. Keep this allowlist closed.
const fields = [
  ['row_meaning', 'What one row represents'], ['intended_uses', 'Intended uses'],
  ['key_fields', 'Key fields'], ['field_descriptions', 'Field descriptions and units'],
  ['row_count', 'Row count'], ['column_count', 'Column count'], ['size_bytes', 'Size'],
  ['format', 'Format'], ['spatial_coverage', 'Geographic coverage'],
  ['temporal_coverage', 'Time coverage'], ['data_languages', 'Data language coverage'],
  ['freshness', 'Freshness'], ['license', 'Licence'], ['delivery', 'Delivery'],
  ['privacy_status', 'Trust/privacy status'], ['sample_availability', 'Sample availability'],
] as const;

export function hasSupportedSummaryFields(summary?: ListingSummary | null): boolean {
  return !!summary && fields.some(([key]) => summary[key] && summary[key]?.provenance !== 'absent');
}

type Audience = 'seller' | 'buyer';
function Provenance({field, audience}: {field: SummaryField; audience: Audience}) {
  return <p className="mt-1 text-xs text-gray-600">Source: {field.provenance === 'seller_entered' && audience === 'buyer' ? 'provided by the seller' : provenanceLabels[field.provenance]}
    {field.authority === 'seller_local_report' && ' (seller/local report)'}
    {field.authority === 'publication_bound' && ' (approved publication)'}
  </p>;
}

function humanSize(bytes: number): string {
  const [scale, unit] = bytes >= 1e9 ? [1e9, 'GB'] : bytes >= 1e6 ? [1e6, 'MB'] : bytes >= 1e3 ? [1e3, 'KB'] : [1, 'bytes'];
  return `${(bytes / Number(scale)).toLocaleString('en-US', {maximumFractionDigits: 2})} ${unit}`;
}

// One inert renderer for the seller preview and the public approved projection.
export default function AtAGlance({summary, audience}: {summary?: ListingSummary | null; audience: Audience}) {
  if (!summary || !hasSupportedSummaryFields(summary)) return null;
  const descriptions = summary.field_descriptions?.provenance === 'absent' ? [] : summary.field_descriptions?.value ?? [];
  return <section aria-label="At a glance" className="min-w-0 space-y-4 rounded-xl border border-gray-200 bg-white p-5 break-words">
    <h2 className="text-lg font-semibold text-gray-900">At a glance</h2>
    {fields.map(([key, label]) => {
      const field = summary[key];
      if (!field || field.provenance === 'absent') return null;
      const value = field.value;
      return <div key={key} className="min-w-0">
        <h3 className="text-sm font-medium text-gray-900">{label}</h3>
        {key === 'key_fields' ? <SchemaTable variant="summary" columns={summary.key_fields?.value ?? []} descriptions={descriptions} /> : key === 'field_descriptions' ? <ul className="space-y-1 text-sm text-gray-700">{descriptions.map(d =>
          <li key={d.name}><span className="font-mono">{d.name}</span>{d.description && <>: {d.description}</>}{d.unit && <> — {d.unit}</>}</li>)}</ul>
          : Array.isArray(value) ? <ul className="list-inside list-disc text-sm text-gray-700">{(value as string[]).map((item, i) => <li key={i}>{item}</li>)}</ul>
          : key === 'size_bytes' && typeof value === 'number' ? <p className="text-sm text-gray-700" title={`${value.toLocaleString('en-US')} bytes`}>{humanSize(value)}</p>
          : <p className="text-sm text-gray-700">{typeof value === 'number' ? value.toLocaleString('en-US') : value}{key === 'freshness' && ' (declared cadence)'}</p>}
        <Provenance field={field} audience={audience} />
      </div>;
    })}
  </section>;
}
