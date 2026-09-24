import type { ListingLicenseDetails } from '@/types';

export function isListingLicenseDetails(value: unknown): value is ListingLicenseDetails {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ListingLicenseDetails>;
  return (candidate.code === 'standard' || candidate.code === 'custom') &&
    typeof candidate.version === 'string' && typeof candidate.full_text_url === 'string' &&
    typeof candidate.download_url === 'string' && /^[a-f0-9]{64}$/.test(candidate.sha256 ?? '') &&
    /^[a-f0-9]{64}$/.test(candidate.covenant_sha256 ?? '') &&
    typeof candidate.params?.ai_training === 'boolean' && Array.isArray(candidate.summary);
}
