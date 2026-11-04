import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import record11 from '@/tests/fixtures/s1735_license_record_1_1.json';
import {LICENSE_HASHES} from '@/api/listingLicenses';
import record from '@/tests/fixtures/s1735_license_record.json';
import { fetchedBytesMatch, hashLicenseComponentBytes } from './ListingLicenseDisclosure';
import {sha256} from '@/lib/customLicenseVerification';

const trueClause = 'The Licensee may use the Data to train, fine-tune, test and evaluate artificial-intelligence and machine-learning systems, subject to every other restriction in this licence.';
const falseClause = 'The Licensee must not use the Data to train, fine-tune, test or evaluate artificial-intelligence or machine-learning systems. This does not prohibit ordinary analysis that does not train, fine-tune, test or evaluate such a system.';

describe('Gate 2 §3.2 frontend hash vectors', () => {
  it('matches Standard true/false, rider permitted/not-permitted and covenant through the frontend hasher', async () => {
    vi.stubGlobal('crypto', webcrypto);
    try {
      const vectors = [
        [record.license.text, 'license', 'standard', '1.0', { ai_training: true }, 6557, '4b05dbcd0c186746d3deab6c68beaebba88610de8e85122efb4d527edb1263c6'],
        [record.license.text.replace(trueClause, falseClause), 'license', 'standard', '1.0', { ai_training: false }, 6613, 'e83e03bb731fee832d108ef77689f7ff49e3409f88124b483b2ef34ca7ba3821'],
        [readFileSync('tests/fixtures/s1735_rider_true.txt', 'utf8'), 'rider', 'ai-training', '1.0', { ai_training: true }, 438, 'f9785144dc4d48af6446512cbabd03431a35015d71b92260f4dcfab164084140'],
        [readFileSync('tests/fixtures/s1735_rider_false.txt', 'utf8'), 'rider', 'ai-training', '1.0', { ai_training: false }, 317, '8878e2fb3327378e90a1d9206da9aa2b419255872cdfa6a883c0d2688f768416'],
        [record.covenant.text, 'covenant', 'marketplace-listing', '1.0', {}, 1211, 'a91234b67bf7467a0c80f6e1caa47b563032e94751146901b796eaaf220431af'],
      ] as const;
      for (const [text, kind, code, version, params, length, digest] of vectors) {
        const bytes = new TextEncoder().encode(text);
        expect(bytes.length).toBe(length);
        expect(await hashLicenseComponentBytes(bytes, { kind, code, version, params })).toBe(digest);
      }
    } finally { vi.unstubAllGlobals(); }
  });
});

describe('custom PDF source verification', () => {
  it('requires PDF media type and the exact pinned source bytes', async () => {
    vi.stubGlobal('crypto', webcrypto);
    try {
      const bytes = new TextEncoder().encode('%PDF-1.4 test');
      const sourceSha256 = 'd663640088750cf16276d623c2588d7233f2b84b45f4b2e20832f47b16aa5618';
      const reference = {
        kind: 'license' as const, label: "Seller's own licence", canonicalUrl: '/api/v1/listings/id/license-document',
        downloadUrl: '/api/v1/listings/id/license-document?download=1',
        sha256: '80a42b3f3b022e19ce60ad7b2cf59b524877b92320ec49f8af859833764a55f4',
        code: 'custom', version: '1', params: {ai_training: true, source_sha256: sourceSha256},
      };
      expect(await fetchedBytesMatch(bytes, 'application/pdf', reference)).toBe(true);
      expect(await fetchedBytesMatch(bytes, 'text/plain', reference)).toBe(false);
      expect(await fetchedBytesMatch(new TextEncoder().encode('%PDF-1.4 evil'), 'application/pdf', reference)).toBe(false);
    } finally { vi.unstubAllGlobals(); }
  });
});

describe('custom plain text byte verification', () => {
  it('checks both hashes before literal rendering for NFC, LF and trailing whitespace', async () => {
    vi.stubGlobal('crypto', webcrypto);
    try {
      const canonical = 'Café\nC\n';
      const bytes = new TextEncoder().encode(canonical);
      const source_sha256 = await sha256(bytes);
      const reference = {kind:'license' as const,label:'Custom',canonicalUrl:'/api/v1/listings/id/license-document',downloadUrl:'/api/v1/listings/id/license-document?download=1',
        sha256:await hashLicenseComponentBytes(bytes,{kind:'license',code:'custom',version:'1',params:{ai_training:true,source_sha256}}),
        code:'custom',version:'1',params:{ai_training:true,source_sha256}};
      expect(await fetchedBytesMatch(bytes,'text/plain; charset=utf-8',reference)).toBe(true);
      expect(await fetchedBytesMatch(new TextEncoder().encode('Cafe\u0301\rC\t\n\n'),'text/plain',reference)).toBe(false);
      expect(await fetchedBytesMatch(bytes,'application/pdf',reference)).toBe(false);
      expect(await fetchedBytesMatch(bytes,'text/plain',{...reference,sha256:'0'.repeat(64)})).toBe(false);
      expect(await fetchedBytesMatch(bytes,'text/plain',{...reference,params:{...reference.params,source_sha256:'0'.repeat(64)}})).toBe(false);
    } finally {vi.unstubAllGlobals();}
  });
});

it('pins the exact 1.1 amendments and the current seller selection hashes',async()=>{
  vi.stubGlobal('crypto',webcrypto);
  try {
    expect(record11.license.text).toBe(record.license.text.replace('v1.0','v1.1')
      .replace("6. Licensor promises. The Licensor promises that it has the rights needed to offer and license the Data; that it sourced and provides the Data lawfully; that providing and using the Data as this licence permits does not knowingly infringe another person's rights; and that the Data contains no regulated personal data or special-category data. The Licensor also promises that the listing's express statements about the Data are materially accurate when delivered.","6. Licensor promises. The Licensor promises that it has the rights needed to offer and license the Data; that it sourced and provides the Data lawfully; and that providing and using the Data as this licence permits does not knowingly infringe another person's rights. If the Data contains personal data, the Licensor also promises that it has a lawful basis to sell the Data and to transfer it to the Licensee, including across borders; that it holds the consent, notice and provenance records the law requires for that sale and transfer and will make them available through ai.market on reasonable request; and that the listing clearly discloses any special-category or other sensitive personal data. The Licensor is responsible for meeting these obligations. The Licensor also promises that the listing's express statements about the Data are materially accurate when delivered.").replace("Applicable law always applies.","If the Data contains personal data, the Licensee will use it only as this licence permits and as data protection law allows, keep it secure, and honour the rights of the people it concerns. Applicable law always applies."));
    expect(record11.covenant.text).toBe(record.covenant.text.replace('v1.0','v1.1').replace("(3) the dataset contains no regulated personal data or special-category data;","(3) if the dataset contains personal data, the seller has a lawful basis to sell it and to transfer it to buyers, including across borders, holds the consent, notice and provenance records the law requires, clearly discloses any special-category or other sensitive personal data in the listing, and remains responsible for meeting these obligations;"));
    expect(await hashLicenseComponentBytes(new TextEncoder().encode(record11.license.text),{kind:'license',code:'standard',version:'1.1',params:{ai_training:true}})).toBe(LICENSE_HASHES.standard.true);
    expect(record11.license.sha256).toBe(LICENSE_HASHES.standard.true);
    expect(await hashLicenseComponentBytes(new TextEncoder().encode(record11.license.text.replace(trueClause,falseClause)),{kind:'license',code:'standard',version:'1.1',params:{ai_training:false}})).toBe(LICENSE_HASHES.standard.false);
    expect(await hashLicenseComponentBytes(new TextEncoder().encode(record11.covenant.text),{kind:'covenant',code:'marketplace-listing',version:'1.1',params:{}})).toBe(LICENSE_HASHES.covenant);
    expect(record11.covenant.sha256).toBe(LICENSE_HASHES.covenant);
  } finally {vi.unstubAllGlobals();}
});
