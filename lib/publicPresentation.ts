import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex} from '@noble/hashes/utils.js';
/** Closed backend19ff184 wire. Integrity is not seller consent. */
export const CORRECTION_KIND = 'platform-license-correction-v1' as const;
export const CORRECTION_NOTICE = 'Platform-corrected licence display; original seller approval retained';
export const CORRECTION_TITLE = 'Listing with platform-corrected licence display';
export const CURRENT_LICENSE_LABEL = 'ai.market Standard Data Licence v1.1' as const;
export const HASH = /^[0-9a-f]{64}$/;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export type PresentationVersion = 'seller-listing-review-v2' | 'seller-listing-review-v3' | 'seller-listing-review-v4';
interface PresentationBytes { presentation_version: PresentationVersion; rendered_html: string; render_hash: string; sample_files?: Array<{index:number;key_basename:string;size:number;binding:'etag_md5'|'size_only';state:'available'|'unavailable';url:string}> | null }
export interface OriginalPresentation extends PresentationBytes { presentation_kind?: never }
export interface CorrectedPresentation extends PresentationBytes {
  presentation_kind: typeof CORRECTION_KIND;
  listing_id: string; publication_id: string; listing_version_id: string; approval_id: string;
  original_render_hash: string; original_admitted_render_hash: string;
  correction_id: string; correction_digest: string;
  provenance: 'platform_license_correction'; license_label: typeof CURRENT_LICENSE_LABEL;
}
export type PublicPresentation = OriginalPresentation | CorrectedPresentation;
export interface LicenseDisplay {
  license_label: typeof CURRENT_LICENSE_LABEL; provenance: 'platform_license_correction';
  correction_id: string; correction_digest: string;
}
export function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
export function supportedVersion(value: unknown): value is PresentationVersion {
  return value === 'seller-listing-review-v2' || value === 'seller-listing-review-v3' || value === 'seller-listing-review-v4';
}
const baseFields = ['presentation_version', 'rendered_html', 'render_hash'];
export const correctionFields = ['presentation_kind', 'listing_id', 'publication_id', 'listing_version_id', 'approval_id',
  'original_render_hash', 'original_admitted_render_hash', 'correction_id', 'correction_digest', 'provenance', 'license_label'];
// Public envelopes require binding IDs, but those IDs also occur in ordinary
// saved reviews and signing bindings. Only correction-specific data is refused
// at the original-evidence boundary; the public schema stays closed above.
const correctionMarkers = ['presentation_kind', 'provenance', 'license_label', 'original_render_hash', 'original_admitted_render_hash',
  'correction_id', 'correction_digest', 'license_display', 'public_presentation', 'approved_presentation'];
export function refusePlatformCorrection(value: unknown): void {
  if (!record(value) || correctionMarkers.some(key => key in value)) throw new Error('Original signing evidence required');
}
export function refuseCorrectionFields(value: unknown): void {
  if (!record(value) || correctionMarkers.some(key => key in value))
    throw new Error('Saved review must contain original seller evidence only');
}
export function readLicenseDisplay(value: unknown): LicenseDisplay | null {
  if (value == null) return null;
  if (!record(value) || Object.keys(value).length !== 4 || value.license_label !== CURRENT_LICENSE_LABEL ||
      value.provenance !== 'platform_license_correction' || typeof value.correction_id !== 'string' || !UUID.test(value.correction_id) ||
      typeof value.correction_digest !== 'string' || !HASH.test(value.correction_digest))
    throw new Error('Current licence display could not be verified');
  return value as unknown as LicenseDisplay;
}
export async function verifyPresentation(value: unknown, identity?: {
  listing_id: string; publication_id?: string; listing_version_id?: string; approval_id?: string;
}): Promise<PublicPresentation> {
  const fail = () => { throw new Error('The approved listing presentation could not be verified'); };
  if (!record(value)) return fail();
  const corrected = value.presentation_kind === CORRECTION_KIND;
  const required = corrected ? [...baseFields, ...correctionFields] : baseFields;
  if (required.some(key => !(key in value)) || Object.keys(value).some(key => ![...required, 'sample_files'].includes(key)) ||
      !supportedVersion(value.presentation_version) || typeof value.rendered_html !== 'string' ||
      typeof value.render_hash !== 'string' || !HASH.test(value.render_hash)) return fail();
  if (corrected) {
    if (value.provenance !== 'platform_license_correction' || value.license_label !== CURRENT_LICENSE_LABEL ||
        ['listing_id', 'publication_id', 'listing_version_id', 'approval_id', 'correction_id'].some(key => typeof value[key] !== 'string' || !UUID.test(value[key] as string)) ||
        ['original_render_hash', 'original_admitted_render_hash', 'correction_digest'].some(key => typeof value[key] !== 'string' || !HASH.test(value[key] as string)) ||
        (identity && Object.entries(identity).some(([key, expected]) => expected !== undefined && value[key] !== expected))) return fail();
  }
  const bytes = new TextEncoder().encode(value.rendered_html);
  if (bytes.length > 100000) return fail();
  const hash = bytesToHex(sha256(bytes));
  if (hash !== value.render_hash) return fail();
  return value as unknown as PublicPresentation;
}
/** Check every independent response binding actually supplied by this backend. */
export async function verifyCurrentListing(listing: Record<string, unknown>): Promise<void> {
  const display = readLicenseDisplay(listing.license_display);
  const value = listing.approved_presentation;
  if (value != null) {
    if (typeof listing.id !== 'string') throw new Error('Missing listing identity');
    const identity: {listing_id:string;publication_id?:string;listing_version_id?:string;approval_id?:string} = {listing_id: listing.id};
    for (const key of ['publication_id', 'listing_version_id', 'approval_id'] as const) {
      if (key in listing) {
        if (typeof listing[key] !== 'string' || !UUID.test(listing[key] as string)) throw new Error('Invalid publication identity');
        identity[key] = listing[key] as string;
      }
    }
    const approved = await verifyPresentation(value, identity);
    if (approved.presentation_kind === CORRECTION_KIND && (!display || display.correction_id !== approved.correction_id ||
        display.correction_digest !== approved.correction_digest)) throw new Error('Inconsistent current licence display');
    if (display && approved.presentation_kind !== CORRECTION_KIND) throw new Error('Inconsistent original presentation');
  }
  if (display && record(listing.license) && listing.license.code === 'standard' && listing.license.version !== '1.1')
    throw new Error('Inconsistent current instrument');
  if (display && typeof listing.license === 'string' && listing.license !== display.license_label)
    throw new Error('Inconsistent current licence label');
}
