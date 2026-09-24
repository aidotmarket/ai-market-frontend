import { describe, expect, it } from 'vitest';
import { isListingLicenseDetails } from './listingLicense';

describe('isListingLicenseDetails', () => {
  const valid = {
    code: 'standard',
    version: '1.0',
    full_text_url: '/licenses/standard/1.0',
    download_url: '/licenses/standard/1.0?download=1',
    sha256: 'a'.repeat(64),
    covenant_sha256: 'b'.repeat(64),
    params: { ai_training: false },
    summary: ['Standard terms'],
  };

  it('accepts a valid licence and rejects malformed licence details', () => {
    expect(isListingLicenseDetails(valid)).toBe(true);
    expect(isListingLicenseDetails({ ...valid, code: 'custom' })).toBe(true);
    expect(isListingLicenseDetails({ ...valid, sha256: 'invalid' })).toBe(false);
    expect(isListingLicenseDetails({ ...valid, params: { ai_training: 'false' } })).toBe(false);
    expect(isListingLicenseDetails(null)).toBe(false);
  });
});
