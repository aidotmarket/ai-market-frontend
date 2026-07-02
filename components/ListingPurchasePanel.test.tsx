import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { VersionSelector, selectDefaultVersion, sortVersions } from './ListingPurchasePanel';
import type { ListingVersion } from '@/types';

const versions: ListingVersion[] = [
  {
    version_id: 'v1-id',
    version_label: 'v1',
    published_at: '2026-06-01T00:00:00Z',
    object_count: 10,
    total_size_bytes: 1024,
    status: 'superseded',
  },
  {
    version_id: 'v2-id',
    version_label: 'v2',
    published_at: '2026-06-02T00:00:00Z',
    object_count: 20,
    total_size_bytes: 2048,
    status: 'active',
  },
  {
    version_id: 'v3-id',
    version_label: 'v3',
    published_at: '2026-06-03T00:00:00Z',
    object_count: 30,
    total_size_bytes: 4096,
    status: 'quarantined',
  },
];

describe('VersionSelector', () => {
  it('renders a single active version with metadata', () => {
    const html = renderToStaticMarkup(
      <VersionSelector versions={[versions[1]]} selectedVersionId="v2-id" onSelectVersion={() => undefined} />,
    );

    expect(html).toContain('v2');
    expect(html).toContain('Jun 2, 2026');
    expect(html).toContain('2.0 KB');
    expect(html).toContain('20 objects');
  });

  it('defaults to the latest active version and keeps superseded versions visible', () => {
    const sorted = sortVersions(versions);

    expect(selectDefaultVersion(sorted)?.version_id).toBe('v2-id');

    const html = renderToStaticMarkup(
      <VersionSelector versions={versions} selectedVersionId="v2-id" onSelectVersion={() => undefined} />,
    );

    expect(html).toContain('v2');
    expect(html).toContain('v1 (superseded)');
    expect(html).toContain('Visible for provenance. Not purchasable.');
  });

  it('hides quarantined versions defensively', () => {
    const sorted = sortVersions(versions);
    const html = renderToStaticMarkup(
      <VersionSelector versions={versions} selectedVersionId="v2-id" onSelectVersion={() => undefined} />,
    );

    expect(sorted.map((version) => version.version_label)).toEqual(['v2', 'v1']);
    expect(html).not.toContain('v3');
    expect(html).not.toContain('quarantined');
  });

  it('honors an explicit selected superseded version without making it latest', () => {
    const selected = selectDefaultVersion(sortVersions(versions), 'v1-id');

    expect(selected?.version_label).toBe('v1');
    expect(selected?.status).toBe('superseded');
  });
});
