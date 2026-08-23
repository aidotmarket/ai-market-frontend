import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PublishedScanFindings } from '@/types';
import ListingPurchaseAdvisory from './ListingPurchaseAdvisory';

const publishedFindings: PublishedScanFindings = {
  publication_state: 'PUBLISHED',
  artifact_version: 'data-verification-public-artifact-v1',
  verification_series_id: 'series-1',
  epoch_id: 'epoch-1',
  listing_id: 'listing-1',
  title: 'Scan findings — 2026-08-23',
  scan_date_utc: '2026-08-23T12:00:00Z',
  published_at_utc: '2026-08-23T12:01:00Z',
  spec: {
    id: 'scan-spec-v1',
    version: '1',
    hash: 'a'.repeat(64),
    depth_class: 'complete_standard_v1',
    canonicalization_version: 'python-json-sort-compact-v1',
  },
  execution: {
    agent_version: 'aim-data-1',
    connector_type: 'eolymp',
    connector_version: 'eolymp-v1',
    content_sha256_reference: 'b'.repeat(12),
  },
  methods: {
    row_count_algorithm_version: 'exact-v1',
    distinct_algorithm_version: 'hll-sha256-v1',
    histogram_version: 'fixed-buckets-v1',
    numeric_bucket_version: 'fixed-buckets-v1',
  },
  coverage: {
    objects_discovered: 1,
    objects_scanned: 1,
    objects_skipped_by_reason: { permission_denied: 0, unsupported_type: 0, timeout: 0 },
    skipped: [],
  },
  deterministic_facts: [],
  fingerprint_hash: 'c'.repeat(64),
  narrative_state: 'grounded',
  narrative: 'One object was scanned.',
  listing_claim_comparison: null,
  narrative_notice: null,
  seller_context_provided: false,
  preview_requested: false,
  attestation: 'Point-in-time attestation.',
  disclaimer: 'Point-in-time disclaimer.',
};

describe('ListingPurchaseAdvisory', () => {
  it('does not render on a free listing', () => {
    const html = renderToStaticMarkup(
      <ListingPurchaseAdvisory price={0} scanFindings={null} />,
    );

    expect(html).toBe('');
  });

  it('states honestly when no active findings are published', () => {
    const html = renderToStaticMarkup(
      <ListingPurchaseAdvisory price={10} scanFindings={null} />,
    );

    expect(html).toContain('No active scan findings are published for this listing');
    expect(html).toContain('does not establish the data’s condition or suitability');
  });

  it('describes published findings as point-in-time and not a guarantee', () => {
    const html = renderToStaticMarkup(
      <ListingPurchaseAdvisory price={10} scanFindings={publishedFindings} />,
    );

    expect(html).toContain('Seller-published, point-in-time scan findings are available');
    expect(html).toContain('not a warranty or guarantee');
  });

  it('does not treat a withdrawal marker as active findings', () => {
    const html = renderToStaticMarkup(
      <ListingPurchaseAdvisory
        price={10}
        scanFindings={{
          publication_state: 'WITHDRAWN',
          withdrawn_at_utc: '2026-08-23T12:00:00Z',
          marker: 'Scan findings withdrawn by seller on 2026-08-23',
        }}
      />,
    );

    expect(html).toContain('No active scan findings are published for this listing');
    expect(html).not.toContain('scan findings are available');
  });
});
