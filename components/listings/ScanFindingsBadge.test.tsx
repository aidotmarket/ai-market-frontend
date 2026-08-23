import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PublishedScanFindings, ScanFindings } from '@/types';
import ScanFindingsBadge from './ScanFindingsBadge';

const ATTESTATION = "On 2026-08-23 12:00:00 UTC, at the data owner's authorization and expense, ai.market directed AIM Data to scan the seller-designated source for this listing inside the owner's environment; the structural facts below were computed by ai.market-authored conduit code executed by the owner's AIM Data installation, and the findings are published unedited.";
const DISCLAIMER = 'This is a seller-published, point-in-time scan of what the seller-designated source exposed through AIM Data on 2026-08-23; the source may change at any time, and this is not a continuing audit, warranty, compliance certification, or guarantee that data delivered later will match or remain available, accurate, complete, or unchanged. Verification does not assess data accuracy, legality, or fitness for any purpose.';
const OBJECT_ID = 'a'.repeat(64);

function makePublishedFindings(overrides: Partial<PublishedScanFindings> = {}): PublishedScanFindings {
  return {
    publication_state: 'PUBLISHED',
    artifact_version: 'data-verification-public-artifact-v1',
    verification_series_id: '11111111-1111-4111-8111-111111111111',
    epoch_id: '22222222-2222-4222-8222-222222222222',
    listing_id: '33333333-3333-4333-8333-333333333333',
    title: 'Scan findings — 2026-08-23',
    scan_date_utc: '2026-08-23T12:00:00Z',
    published_at_utc: '2026-08-23T12:01:00Z',
    spec: {
      id: 'scan-spec-v1',
      version: '1',
      hash: 'b'.repeat(64),
      depth_class: 'complete_standard_v1',
      canonicalization_version: 'python-json-sort-compact-v1',
    },
    execution: {
      agent_version: 'aim-data-1.0.0',
      connector_type: 'eolymp',
      connector_version: 'eolymp-v1',
      content_sha256_reference: 'c'.repeat(12),
    },
    methods: {
      row_count_algorithm_version: 'exact-v1',
      distinct_algorithm_version: 'hll-sha256-v1',
      histogram_version: 'fixed-buckets-v1',
      numeric_bucket_version: 'fixed-buckets-v1',
    },
    coverage: {
      objects_discovered: 2,
      objects_scanned: 1,
      objects_skipped_by_reason: {
        permission_denied: 1,
        unsupported_type: 0,
        timeout: 0,
      },
      skipped: [{ object_id: 'd'.repeat(64), reason: 'permission_denied' }],
    },
    deterministic_facts: [{
      object_id: OBJECT_ID,
      columns: [{
        position: 0,
        null_rate: '0.125000',
        approx_distinct_count: {
          algorithm: 'hll-sha256-v1',
          estimate: 7,
          relative_error_ppm: 1200,
        },
        length_histogram: [1, 2, 3],
        numeric_range_buckets: 'suppressed_low_occupancy',
      }],
    }],
    fingerprint_hash: 'e'.repeat(64),
    narrative_state: 'grounded',
    narrative: 'The scan found one readable object.',
    listing_claim_comparison: 'The listing says two objects; one object was scanned and one was skipped.',
    narrative_notice: null,
    seller_context_provided: true,
    preview_requested: true,
    schema_preview: [{
      object_id: OBJECT_ID,
      columns: [{ name: '&lt;script&gt;alert(1)&lt;/script&gt;', type: 'string' }],
    }],
    row_counts: [{ object_id: OBJECT_ID, count: 12, method: 'exact' }],
    attestation: ATTESTATION,
    disclaimer: DISCLAIMER,
    ...overrides,
  };
}

function render(scanFindings: ScanFindings | null): string {
  return renderToStaticMarkup(<ScanFindingsBadge scanFindings={scanFindings} />);
}

describe('ScanFindingsBadge', () => {
  it('renders the complete published artifact, D8 fields, coverage, and exact public wording', () => {
    const findings = makePublishedFindings();
    const html = render(findings);

    for (const expected of [
      findings.title,
      findings.scan_date_utc,
      findings.published_at_utc,
      findings.artifact_version,
      findings.verification_series_id,
      findings.epoch_id,
      findings.listing_id,
      findings.spec.id,
      findings.spec.hash,
      findings.spec.depth_class,
      findings.spec.canonicalization_version,
      findings.execution.agent_version,
      findings.execution.connector_type,
      findings.execution.connector_version,
      findings.execution.content_sha256_reference,
      findings.fingerprint_hash,
      findings.methods.row_count_algorithm_version,
      findings.methods.distinct_algorithm_version,
      findings.methods.histogram_version,
      findings.methods.numeric_bucket_version,
      findings.narrative!,
      findings.listing_claim_comparison!,
      DISCLAIMER,
      'Objects discovered',
      'Objects scanned',
      'permission_denied',
      '0.125000',
      'hll-sha256-v1',
      '1200',
      'method: exact',
    ]) {
      expect(html).toContain(expected);
    }
    expect(html).toContain(ATTESTATION.replaceAll("'", '&#x27;'));
    expect(html).toContain('View full report');
    expect(html).toContain('&amp;lt;script&amp;gt;alert(1)&amp;lt;/script&amp;gt;');
    expect(html).not.toContain('<script>');
  });

  it('renders only the exact withdrawal marker inside the backend window', () => {
    const marker = 'Scan findings withdrawn by seller on 2026-08-23';
    const html = render({
      publication_state: 'WITHDRAWN',
      withdrawn_at_utc: '2026-08-23T12:00:00Z',
      marker,
    });

    expect(html).toContain(`>${marker}</time>`);
    expect(html).not.toContain('View full report');
    expect(html).not.toContain('Report provenance');
  });

  it('renders nothing for a withdrawn artifact after the backend window', () => {
    expect(render(null)).toBe('');
  });

  it('renders only the later active artifact after supersession', () => {
    const html = render(makePublishedFindings({
      epoch_id: '44444444-4444-4444-8444-444444444444',
      title: 'Scan findings — 2026-08-24',
      narrative: 'Later active artifact narrative.',
    }));

    expect(html).toContain('Scan findings — 2026-08-24');
    expect(html).toContain('Later active artifact narrative.');
    expect(html).not.toContain('22222222-2222-4222-8222-222222222222');
  });

  it('renders nothing when public scan findings are absent', () => {
    expect(render(null)).toBe('');
  });

  it('does not derive D8 content when the backend omits it', () => {
    const findings = makePublishedFindings({
      preview_requested: false,
      schema_preview: undefined,
      row_counts: undefined,
    });
    const html = render(findings);

    expect(html).not.toContain('Schema preview and row counts');
    expect(html).not.toContain('method: exact');
  });

  it('contains no score or unqualified truth, accuracy, compliance, fitness, monitoring, or delivery claim', () => {
    const html = render(makePublishedFindings()).toLowerCase();
    const forbiddenClaims = [
      'quality score',
      'truth status',
      'certified accurate',
      'guaranteed accurate',
      'compliant data',
      'fit for purpose',
      'continuously monitored',
      'will match the scanned artifact',
    ];

    for (const forbidden of forbiddenClaims) {
      expect(html).not.toContain(forbidden);
    }
    expect(html).not.toMatch(/\bverified\b/);
    expect(html).toContain('does not assess data accuracy');
    expect(html).toContain('not a continuing audit, warranty, compliance certification, or guarantee');
  });
});
