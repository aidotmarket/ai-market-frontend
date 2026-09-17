import {readFileSync} from 'node:fs';
import {expect, it} from 'vitest';
import {joinApprovedColumns, signedSummaryDescriptions} from './columns';
import {hex, jcs, sha} from './primitives';
const fixture = JSON.parse(readFileSync('tests/fixtures/preview/signed-summary-payload.json', 'utf8'));
const manifest = {...fixture, selected_fields: ['id', 'name']};
it('recomputes the fixture RFC8785 summary hash and joins exact descriptions and units', async () => {
  expect(hex(await sha(jcs(fixture.payload)))).toBe(fixture.summary_hash);
  const labels = await signedSummaryDescriptions(fixture, manifest);
  expect(joinApprovedColumns([{name: 'name', type: 'string'}], labels)).toEqual([{name: 'name', type: 'string', description: 'Synthetic crop label', unit: 'crop'}]);
});
it.each(['summary_hash', 'render_hash', 'source_revision'])('omits descriptions on mismatched %s', async field => {
  expect(await signedSummaryDescriptions({...fixture, [field]: '0'.repeat(64)}, manifest)).toEqual([]);
});
it('refuses tampered payload even with unchanged claimed hashes', async () => {
  const raw = structuredClone(fixture); raw.payload.field_descriptions.value[1].description = 'unapproved';
  expect(await signedSummaryDescriptions(raw, manifest)).toEqual([]);
});
it('degrades missing, malformed, duplicate and mismatched column metadata to identity-only', async () => {
  for (const raw of [null, {}, {...fixture, approval_version: 'bad'}, {...fixture, payload: null}]) expect(await signedSummaryDescriptions(raw, manifest)).toEqual([]);
  expect(await signedSummaryDescriptions(fixture, {...manifest, selected_fields: ['Name']})).toEqual([]);
  const raw = structuredClone(fixture); raw.payload.field_descriptions.value.push(raw.payload.field_descriptions.value[0]);
  raw.summary_hash = hex(await sha(jcs(raw.payload)));
  expect(await signedSummaryDescriptions(raw, {...manifest, summary_hash: raw.summary_hash})).toEqual([]);
});
