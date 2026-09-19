import SchemaTable from './SchemaTable';
import type {AggregateStatistics, DerivationSource, ListingSummary, SummaryField} from '@/lib/api';

export const provenanceLabels = {
  aim_metadata: 'from AIM Data', seller_entered: 'provided by the seller',
  allai_generated: 'generated and checked', absent: 'not available',
} as const;

// §C includes Price between Licence and Delivery. The summary contract has no
// price field; the existing canonical price card supplies it. Keep this allowlist closed.
export const summaryFields = [
  ['row_meaning', 'What one row represents'], ['intended_uses', 'Intended uses'],
  ['key_fields', 'Key fields'], ['field_descriptions', 'Field descriptions and units'],
  ['dataset_origin_statement', 'Dataset origin statement'], ['dataset_limitations', 'Dataset limitations'],
  ['row_count', 'Row count'], ['column_count', 'Column count'], ['size_bytes', 'Size'],
  ['format', 'Format'], ['spatial_coverage', 'Geographic coverage'],
  ['temporal_coverage', 'Time coverage'], ['data_languages', 'Data language coverage'],
  ['freshness', 'Freshness'], ['license', 'Licence'], ['delivery', 'Delivery'],
  ['privacy_status', 'Trust/privacy status'], ['aggregate_statistics', 'Aggregate statistics'],
  ['sample_availability', 'Sample availability'],
] as const;

export type SummaryFieldName = typeof summaryFields[number][0];

export function hasSupportedSummaryFields(summary?: ListingSummary | null): boolean {
  return !!summary && summaryFields.some(([key]) => summary[key] && summary[key]?.provenance !== 'absent');
}

function Provenance({field}: {field: SummaryField<unknown>}) {
  return <p className="mt-1 text-xs text-gray-600">Source: {provenanceLabels[field.provenance]}
    {field.authority === 'seller_local_report' && ' (seller/local report)'}
    {field.authority === 'publication_bound' && ' (approved publication)'}
  </p>;
}

function humanSize(bytes: number): string {
  const [scale, unit] = bytes >= 1e9 ? [1e9, 'GB'] : bytes >= 1e6 ? [1e6, 'MB'] : bytes >= 1e3 ? [1e3, 'KB'] : [1, 'bytes'];
  return `${(bytes / Number(scale)).toLocaleString('en-US', {maximumFractionDigits: 2})} ${unit}`;
}

function derivation(source: DerivationSource, time: string) {
  return <p className="text-xs text-gray-600">Derivation: {source} at <time dateTime={time}>{time}</time></p>;
}

function AggregateStatisticsView({statistics}: {statistics: AggregateStatistics}) {
  return <div className="space-y-3 text-sm text-gray-700">
    <div><p>Row count: {statistics.row_count.toLocaleString('en-US')}</p>{derivation(statistics.row_count_source, statistics.row_count_derived_at)}</div>
    {statistics.temporal_coverage && statistics.temporal_coverage_source && statistics.temporal_coverage_derived_at && <div>
      <p>Temporal coverage: {statistics.temporal_coverage.start ?? 'open start'} to {statistics.temporal_coverage.end ?? 'open end'}</p>
      {derivation(statistics.temporal_coverage_source, statistics.temporal_coverage_derived_at)}
    </div>}
    {statistics.columns.map(column => <div key={column.column} className="rounded-lg border border-gray-200 p-3">
      <p><span className="font-mono">{column.column}</span> ({column.kind})</p>
      {derivation(column.source, column.derived_at)}
      {column.null_count != null && <p>Null count: {column.null_count.toLocaleString('en-US')}</p>}
      {column.buckets.length > 0 && <ul className="mt-1 list-inside list-disc">
        {column.buckets.map((bucket, index) => <li key={index}>{bucket.lower_bound ?? 'open'} to {bucket.upper_bound ?? 'open'}: {bucket.count.toLocaleString('en-US')}</li>)}
      </ul>}
      {column.groups.length > 0 && <ul className="mt-1 list-inside list-disc">
        {column.groups.map(group => <li key={group.label}>{group.label}: {group.count.toLocaleString('en-US')}</li>)}
      </ul>}
    </div>)}
  </div>;
}

// One inert renderer for the seller preview and the public approved projection.
// It intentionally has no audience input: identical data must produce identical markup.
export default function AtAGlance({summary}: {summary?: ListingSummary | null}) {
  if (!summary || !hasSupportedSummaryFields(summary)) return null;
  const rawDescriptions = summary.field_descriptions?.provenance === 'absent' ? [] : summary.field_descriptions?.value;
  const descriptions = (Array.isArray(rawDescriptions) ? rawDescriptions : []).map(detail => ({
    name: typeof detail?.name === 'string' || typeof detail?.name === 'number' ? String(detail.name) : '',
    description: typeof detail?.description === 'string' ? detail.description : undefined,
    unit: typeof detail?.unit === 'string' ? detail.unit : undefined,
  }));
  return <section aria-label="At a glance" className="min-w-0 space-y-4 rounded-xl border border-gray-200 bg-white p-5 break-words">
    <h2 className="text-lg font-semibold text-gray-900">At a glance</h2>
    {summaryFields.map(([key, label]) => {
      const field = summary[key] as SummaryField<unknown> | null | undefined;
      if (!field || field.provenance === 'absent') return null;
      const value = field.value;
      return <div key={key} className="min-w-0">
        <h3 className="text-sm font-medium text-gray-900">{label}</h3>
        {key === 'key_fields' ? <SchemaTable variant="summary" columns={summary.key_fields?.value ?? []} descriptions={descriptions} />
          : key === 'field_descriptions' ? <ul className="space-y-1 text-sm text-gray-700">{descriptions.map(d =>
            <li key={d.name}><span className="font-mono">{d.name}</span>{d.description && <>: {d.description}</>}{d.unit && <> — {d.unit}</>}</li>)}</ul>
          : key === 'aggregate_statistics' ? <AggregateStatisticsView statistics={value as AggregateStatistics} />
          : Array.isArray(value) ? <ul className="list-inside list-disc text-sm text-gray-700">{(value as string[]).map((item, i) => <li key={i}>{item}</li>)}</ul>
          : key === 'size_bytes' && typeof value === 'number' ? <p className="text-sm text-gray-700" title={`${value.toLocaleString('en-US')} bytes`}>{humanSize(value)}</p>
          : <p className="text-sm text-gray-700">{typeof value === 'number' ? value.toLocaleString('en-US') : String(value)}{key === 'freshness' && ' (declared cadence)'}</p>}
        <Provenance field={field} />
      </div>;
    })}
  </section>;
}
