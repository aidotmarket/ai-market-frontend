// @vitest-environment jsdom
import {cleanup, render, screen, waitFor} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import ListingLicenseDisclosure from './ListingLicenseDisclosure';
import {hashLicenseComponentBytes, sha256} from '@/lib/customLicenseVerification';
import record10 from '@/tests/fixtures/s1735_license_record.json';
import record11 from '@/tests/fixtures/s1735_license_record_1_1.json';
import type {ListingLicenseDetails} from '@/types';

const get = vi.hoisted(() => vi.fn());
vi.mock('@/api/client', () => ({api: {get}}));
afterEach(() => {cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks();});

// Keep exactly the keys emitted by listing_license_block, including its public metadata.
async function backendBlock(kind: 'standard' | 'custom', version: '1.0' | '1.1') {
  const record = version === '1.0' ? record10 : record11;
  const text = kind === 'standard' ? record.license.text : 'Seller custom terms. Use the dataset internally.\n';
  const source_sha256 = await sha256(new TextEncoder().encode(text));
  const params: Record<string, string | boolean> & {ai_training: boolean} = kind === 'standard' ? {ai_training: true} : {ai_training: true, source_sha256};
  const licenseVersion = kind === 'standard' ? version : '1';
  const hash = kind === 'standard' ? record.license.sha256 : await hashLicenseComponentBytes(new TextEncoder().encode(text), {
    kind: 'license', code: 'custom', version: '1', params,
  });
  const publicUrl = kind === 'standard' ? `https://ai.market/licenses/standard/${version}/ai-training` : `https://ai.market/licenses/custom/${hash}`;
  const block = {
    code: kind, version: licenseVersion, variant: kind === 'standard' ? 'ai-training' : null, public_url: publicUrl, params,
    summary: ['Read the full licence before accepting.'],
    full_text_url: kind === 'standard' ? publicUrl : '/api/v1/listings/id/license-document',
    download_url: kind === 'standard' ? `${publicUrl}?download=1` : '/api/v1/listings/id/license-document?download=1',
    sha256: hash, covenant_sha256: record.covenant.sha256,
    rider_sha256: kind === 'custom' ? 'f9785144dc4d48af6446512cbabd03431a35015d71b92260f4dcfab164084140' : null,
    covenant_code: 'marketplace-listing', covenant_version: version,
  } satisfies ListingLicenseDetails & {variant: string | null; public_url: string};
  get.mockResolvedValue({data: new TextEncoder().encode(text).buffer, headers: {
    'content-type': 'text/plain; charset=utf-8', 'x-content-type-options': 'nosniff', 'cache-control': 'private, no-store',
    'content-disposition': 'attachment; filename="listing-id-licence.txt"',
    'x-license-source-sha256': source_sha256, 'x-license-sha256': hash,
  }});
  const fetched = vi.fn(async (input: RequestInfo | URL) => new Response(
    String(input).includes('marketplace-listing') ? record.covenant.text :
      String(input).includes('ai-training-rider') ? readFileSync('tests/fixtures/s1735_rider_true.txt', 'utf8') : text,
    {headers: {'content-type': 'text/plain'}},
  ));
  vi.stubGlobal('fetch', fetched);
  vi.stubGlobal('URL', Object.assign(URL, {createObjectURL: vi.fn(() => 'blob:verified'), revokeObjectURL: vi.fn()}));
  return {block, fetched};
}

it.each([['standard', '1.1'], ['custom', '1.1'], ['standard', '1.0']] as const)(
  'matches the exact backend %s block with covenant %s', async (kind, version) => {
    vi.stubGlobal('crypto', webcrypto);
    const {block, fetched} = await backendBlock(kind, version);
    expect(Object.keys(block).sort()).toEqual('code,version,variant,public_url,params,summary,full_text_url,download_url,sha256,covenant_sha256,rider_sha256,covenant_code,covenant_version'.split(',').sort());
    const verified = vi.fn();
    render(<ListingLicenseDisclosure license={block} onVerificationChange={verified}/>);
    await waitFor(() => expect(verified).toHaveBeenLastCalledWith(true));
    expect(screen.getAllByRole('status').every(node => node.textContent === 'Fetched bytes match the server hash')).toBe(true);
    expect(fetched).toHaveBeenCalledWith(`/licenses/marketplace-listing/${version}?download=1`, expect.anything());
  },
);

it.each(['1.0', '1.1'] as const)('infers an omitted covenant version only for the pinned 1.0 hash (%s)', async version => {
  vi.stubGlobal('crypto', webcrypto);
  const {block, fetched} = await backendBlock('standard', version);
  const {covenant_version: omitted, ...legacyBlock} = block;
  void omitted;
  const verified = vi.fn();
  render(<ListingLicenseDisclosure license={legacyBlock} onVerificationChange={verified}/>);
  if (version === '1.0') {
    await waitFor(() => expect(verified).toHaveBeenLastCalledWith(true));
    expect(fetched).toHaveBeenCalledWith('/licenses/marketplace-listing/1.0?download=1', expect.anything());
  } else {
    await screen.findByText('Could not verify — do not accept');
    expect(verified).not.toHaveBeenCalledWith(true);
    expect(fetched.mock.calls.some(([url]) => String(url).includes('marketplace-listing'))).toBe(false);
  }
});

it('uses the backend covenant code in the verification domain', async () => {
  vi.stubGlobal('crypto', webcrypto);
  const {block, fetched} = await backendBlock('standard', '1.1');
  const verified = vi.fn();
  render(<ListingLicenseDisclosure license={{...block, covenant_code: 'different-covenant'}} onVerificationChange={verified}/>);
  await screen.findByText('Hash mismatch — do not accept');
  expect(fetched).toHaveBeenCalledWith('/licenses/different-covenant/1.1?download=1', expect.anything());
  expect(verified).not.toHaveBeenCalledWith(true);
});
