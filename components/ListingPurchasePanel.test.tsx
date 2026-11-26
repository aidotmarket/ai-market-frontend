import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { VersionSelector, selectDefaultVersion, sortVersions } from './ListingPurchasePanel';
import { hashLicenseComponentBytes } from './ListingLicenseDisclosure';
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
    expect(html).toContain('2.05 KB');
    expect(html).toContain('20 individual files, 2.05 KB total.');
    expect(html).toContain('published a file list for this version.');
  });

  it('describes a single archive when its format is public', () => {
    const archive = { ...versions[1], object_count: 1, total_size_bytes: 7_520_000 };
    const html = renderToStaticMarkup(
      <VersionSelector versions={[archive]} selectedVersionId={archive.version_id} onSelectVersion={() => undefined} dataFormat=".zip" />,
    );

    expect(html).toContain('1 download file, a single ZIP archive, 7.52 MB total.');
    expect(html).toContain('published a file list for this version.');
  });

  it('shows the public inventory only for the current version', () => {
    const render = (selectedVersionId: string) => renderToStaticMarkup(
      <VersionSelector versions={versions} selectedVersionId={selectedVersionId} onSelectVersion={() => undefined}
        fileBreakdown={[{ format: 'csv', count: 2, size_bytes: 1200 }, { format: 'other', count: 1, size_bytes: 848 }]} />,
    );

    expect(render('v2-id')).toContain('CSV tables: 2 files · 1.2 KB');
    expect(render('v2-id')).toContain('Other files: 1 file · 848 B');
    expect(render('v1-id')).not.toContain('Files included');
    expect(render('v1-id')).toContain('published a file list for this version.');
  });

  it('does not infer an archive from a count of one', () => {
    const version = { ...versions[1], object_count: 1 };
    const html = renderToStaticMarkup(
      <VersionSelector versions={[version]} selectedVersionId={version.version_id} onSelectVersion={() => undefined} />,
    );

    expect(html).toContain('1 download file, 2.05 KB total. The file format is unspecified.');
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

describe('licence byte hashing', () => {
  it('hashes the fetched bytes inside the domain-separated licence construction', async () => {
    const digest = await hashLicenseComponentBytes(new TextEncoder().encode('exact fetched bytes\n'), {
      kind: 'license', code: 'standard', version: '1.0', params: { ai_training: true },
    });

    expect(digest).toBe('29d65b88da1372f457795712848a16374c3f308147ac93cecae2f16b17fc35e3');
  });
});
