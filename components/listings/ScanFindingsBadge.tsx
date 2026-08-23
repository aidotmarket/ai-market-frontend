import type {
  PublishedScanFindings,
  ScanFindings,
  VerificationFactColumn,
} from '@/types';

interface ScanFindingsBadgeProps {
  scanFindings: ScanFindings | null;
}

export default function ScanFindingsBadge({ scanFindings }: ScanFindingsBadgeProps) {
  if (!scanFindings) return null;

  if (scanFindings.publication_state === 'WITHDRAWN') {
    return (
      <aside className="rounded-xl border border-gray-300 bg-gray-50 p-5 text-sm text-gray-700">
        <time dateTime={scanFindings.withdrawn_at_utc}>{scanFindings.marker}</time>
      </aside>
    );
  }

  return (
    <section
      className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-6"
      aria-labelledby="scan-findings-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 id="scan-findings-heading" className="text-xl font-semibold text-gray-900">
          {scanFindings.title}
        </h2>
        <a className="text-sm font-medium text-indigo-700 underline" href="#scan-findings-full-report">
          View full report
        </a>
      </div>

      <div id="scan-findings-full-report" className="mt-6 space-y-7 text-sm text-gray-800">
        <ArtifactProvenance artifact={scanFindings} />
        <Coverage artifact={scanFindings} />
        <DeterministicFacts artifact={scanFindings} />
        <Interpretation artifact={scanFindings} />
        <D8Preview artifact={scanFindings} />

        <section aria-labelledby="scan-attestation-heading">
          <h3 id="scan-attestation-heading" className="font-semibold text-gray-900">Attestation</h3>
          <p className="mt-2 whitespace-pre-wrap">{scanFindings.attestation}</p>
        </section>

        <section aria-labelledby="scan-limitations-heading">
          <h3 id="scan-limitations-heading" className="font-semibold text-gray-900">Point-in-time limitations</h3>
          <p className="mt-2 whitespace-pre-wrap">{scanFindings.disclaimer}</p>
        </section>
      </div>
    </section>
  );
}

function ArtifactProvenance({ artifact }: { artifact: PublishedScanFindings }) {
  return (
    <section aria-labelledby="scan-provenance-heading">
      <h3 id="scan-provenance-heading" className="font-semibold text-gray-900">Report provenance</h3>
      <dl className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        <ReportField label="Publication state">{artifact.publication_state}</ReportField>
        <ReportField label="Scan timestamp (UTC)"><time dateTime={artifact.scan_date_utc}>{artifact.scan_date_utc}</time></ReportField>
        <ReportField label="Published timestamp (UTC)"><time dateTime={artifact.published_at_utc}>{artifact.published_at_utc}</time></ReportField>
        <ReportField label="Artifact version">{artifact.artifact_version}</ReportField>
        <ReportField label="Verification series ID">{artifact.verification_series_id}</ReportField>
        <ReportField label="Epoch ID">{artifact.epoch_id}</ReportField>
        <ReportField label="Listing ID">{artifact.listing_id}</ReportField>
        <ReportField label="Spec ID">{artifact.spec.id}</ReportField>
        <ReportField label="Spec version">{artifact.spec.version}</ReportField>
        <ReportField label="Spec hash">{artifact.spec.hash}</ReportField>
        <ReportField label="Depth class">{artifact.spec.depth_class}</ReportField>
        <ReportField label="Canonicalization version">{artifact.spec.canonicalization_version}</ReportField>
        <ReportField label="Agent version">{artifact.execution.agent_version}</ReportField>
        <ReportField label="Connector type">{artifact.execution.connector_type}</ReportField>
        <ReportField label="Connector version">{artifact.execution.connector_version}</ReportField>
        <ReportField label="Content SHA-256 reference">{artifact.execution.content_sha256_reference}</ReportField>
        <ReportField label="Fingerprint hash">{artifact.fingerprint_hash}</ReportField>
        <ReportField label="Row-count algorithm">{artifact.methods.row_count_algorithm_version}</ReportField>
        <ReportField label="Distinct-count algorithm">{artifact.methods.distinct_algorithm_version}</ReportField>
        <ReportField label="Histogram method">{artifact.methods.histogram_version}</ReportField>
        <ReportField label="Numeric-bucket method">{artifact.methods.numeric_bucket_version}</ReportField>
        <ReportField label="Seller context provided">{String(artifact.seller_context_provided)}</ReportField>
        <ReportField label="Schema preview requested">{String(artifact.preview_requested)}</ReportField>
      </dl>
    </section>
  );
}

function Coverage({ artifact }: { artifact: PublishedScanFindings }) {
  return (
    <section aria-labelledby="scan-coverage-heading">
      <h3 id="scan-coverage-heading" className="font-semibold text-gray-900">Coverage</h3>
      <dl className="mt-2 grid gap-3 sm:grid-cols-2">
        <ReportField label="Objects discovered">{artifact.coverage.objects_discovered}</ReportField>
        <ReportField label="Objects scanned">{artifact.coverage.objects_scanned}</ReportField>
      </dl>
      <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-3">
        {Object.entries(artifact.coverage.objects_skipped_by_reason).map(([reason, count]) => (
          <ReportField key={reason} label={`Skipped: ${reason}`}>{count}</ReportField>
        ))}
      </dl>
      <div className="mt-3">
        <p className="font-medium text-gray-900">Skipped object details</p>
        {artifact.coverage.skipped.length > 0 ? (
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {artifact.coverage.skipped.map((skipped) => (
              <li key={`${skipped.object_id}:${skipped.reason}`}>
                <span className="font-mono break-all">{skipped.object_id}</span>: {skipped.reason}
              </li>
            ))}
          </ul>
        ) : <p className="mt-1">None</p>}
      </div>
    </section>
  );
}

function DeterministicFacts({ artifact }: { artifact: PublishedScanFindings }) {
  return (
    <section aria-labelledby="scan-facts-heading">
      <h3 id="scan-facts-heading" className="font-semibold text-gray-900">Facts computed by AIM Data</h3>
      <div className="mt-3 space-y-5">
        {artifact.deterministic_facts.length > 0 ? artifact.deterministic_facts.map((object) => (
          <article key={object.object_id} className="rounded-lg border border-gray-200 bg-white p-4">
            <h4 className="font-medium text-gray-900">Object <span className="font-mono break-all">{object.object_id}</span></h4>
            <div className="mt-3 space-y-4">
              {object.columns.map((column) => (
                <FactColumn key={column.position} column={column} />
              ))}
            </div>
          </article>
        )) : <p>None</p>}
      </div>
    </section>
  );
}

function FactColumn({ column }: { column: VerificationFactColumn }) {
  const distinct = column.approx_distinct_count;

  return (
    <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
      <ReportField label="Column position">{column.position}</ReportField>
      <ReportField label="Null rate">{column.null_rate}</ReportField>
      {distinct === 'suppressed_low_occupancy' ? (
        <ReportField label="Approximate distinct count">{distinct}</ReportField>
      ) : (
        <>
          <ReportField label="Approximate distinct algorithm">{distinct.algorithm}</ReportField>
          <ReportField label="Approximate distinct estimate">{distinct.estimate}</ReportField>
          <ReportField label="Approximate distinct relative error (ppm)">{distinct.relative_error_ppm}</ReportField>
        </>
      )}
      <ReportField label="Length histogram">{displayAggregate(column.length_histogram)}</ReportField>
      <ReportField label="Numeric range buckets">{displayAggregate(column.numeric_range_buckets)}</ReportField>
    </dl>
  );
}

function Interpretation({ artifact }: { artifact: PublishedScanFindings }) {
  return (
    <section aria-labelledby="scan-interpretation-heading">
      <h3 id="scan-interpretation-heading" className="font-semibold text-gray-900">allAI interpretation</h3>
      <dl className="mt-2 space-y-3">
        <ReportField label="Narrative state">{artifact.narrative_state}</ReportField>
        <ReportField label="Narrative">{displayNullable(artifact.narrative)}</ReportField>
        <ReportField label="Listing claim comparison">{displayNullable(artifact.listing_claim_comparison)}</ReportField>
        <ReportField label="Narrative notice">{displayNullable(artifact.narrative_notice)}</ReportField>
      </dl>
    </section>
  );
}

function D8Preview({ artifact }: { artifact: PublishedScanFindings }) {
  const hasSchemaPreview = artifact.schema_preview !== undefined;
  const hasRowCounts = artifact.row_counts !== undefined;
  if (!hasSchemaPreview && !hasRowCounts) return null;

  return (
    <section aria-labelledby="scan-preview-heading">
      <h3 id="scan-preview-heading" className="font-semibold text-gray-900">Schema preview and row counts</h3>
      {hasSchemaPreview && (
        <div className="mt-3 space-y-3">
          <h4 className="font-medium text-gray-900">Schema preview</h4>
          {artifact.schema_preview!.length > 0 ? artifact.schema_preview!.map((object) => (
            <article key={object.object_id} className="rounded-lg border border-gray-200 bg-white p-4">
              <p>Object <span className="font-mono break-all">{object.object_id}</span></p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {object.columns.map((column, index) => (
                  <li key={`${column.name}:${index}`}><span className="font-mono">{column.name}</span>: {column.type}</li>
                ))}
              </ul>
            </article>
          )) : <p>None</p>}
        </div>
      )}
      {hasRowCounts && (
        <div className="mt-4">
          <h4 className="font-medium text-gray-900">Row counts</h4>
          {artifact.row_counts!.length > 0 ? (
            <ul className="mt-2 space-y-2">
              {artifact.row_counts!.map((rowCount) => (
                <li key={rowCount.object_id}>
                  Object <span className="font-mono break-all">{rowCount.object_id}</span>: {rowCount.count} rows; method: {rowCount.method}
                </li>
              ))}
            </ul>
          ) : <p className="mt-2">None</p>}
        </div>
      )}
    </section>
  );
}

function ReportField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-medium text-gray-600">{label}</dt>
      <dd className="mt-0.5 break-words whitespace-pre-wrap">{children}</dd>
    </div>
  );
}

function displayAggregate(value: number[] | 'suppressed_low_occupancy' | null | undefined): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  return Array.isArray(value) ? JSON.stringify(value) : value;
}

function displayNullable(value: string | null): string {
  return value === null ? 'null' : value;
}
