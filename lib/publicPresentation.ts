import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex} from '@noble/hashes/utils.js';
/** Public presentation wire. Integrity is not seller consent. */
export const CORRECTION_KIND = 'platform-license-correction-v1' as const;
export const CORRECTION_NOTICE = 'Platform-corrected licence display; original seller approval retained';
export const CORRECTION_NOTICE_BUYER = 'ai.market updated the licence shown here. The seller approved the original listing.';
export const CORRECTION_TITLE = 'Listing with platform-corrected licence display';
export const CURRENT_LICENSE_LABEL = 'ai.market Standard Data Licence v1.1' as const;
export const HASH = /^[0-9a-f]{64}$/;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export type PresentationVersion = 'seller-listing-review-v2' | 'seller-listing-review-v3' | 'seller-listing-review-v4';
interface PresentationBytes { approved_display_html?: string | null; presentation_display_version?: 'approved-display-v1' | null; presentation_version: PresentationVersion; rendered_html: string; render_hash: string; sample_files?: Array<{index:number;key_basename:string;size:number;binding:'etag_md5'|'size_only';state:'available'|'unavailable';url:string}> | null }
export interface OriginalPresentation extends PresentationBytes { presentation_kind?: never }
export interface CorrectedPresentation extends PresentationBytes {
  presentation_kind: typeof CORRECTION_KIND;
  listing_id: string; publication_id: string; listing_version_id: string; approval_id: string;
  original_render_hash: string; original_admitted_render_hash: string;
  correction_id: string; correction_digest: string;
  provenance: 'platform_license_correction'; license_label: string;
}
export type PublicPresentation = OriginalPresentation | CorrectedPresentation;
export interface LicenseDisplay {
  license_label: string; provenance: 'platform_license_correction';
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
// at the original-evidence boundary.
const correctionMarkers = ['presentation_kind', 'provenance', 'license_label', 'original_render_hash', 'original_admitted_render_hash',
  'correction_id', 'correction_digest', 'license_display', 'public_presentation', 'approved_presentation'];
export function refusePlatformCorrection(value: unknown): void {
  if (!record(value) || correctionMarkers.some(key => key in value)) throw new Error('Original signing evidence required');
}
export function refuseCorrectionFields(value: unknown): void {
  if (!record(value) || correctionMarkers.some(key => key in value))
    throw new Error('Saved review must contain original seller evidence only');
}
export function readLicenseDisplay(value: unknown, expectedLabel: string = CURRENT_LICENSE_LABEL): LicenseDisplay | null {
  if (value == null) return null;
  if (!record(value) || value.license_label !== expectedLabel ||
      value.provenance !== 'platform_license_correction' || typeof value.correction_id !== 'string' || !UUID.test(value.correction_id) ||
      typeof value.correction_digest !== 'string' || !HASH.test(value.correction_digest))
    throw new Error('Current licence display could not be verified');
  return {license_label: value.license_label, provenance: value.provenance,
    correction_id: value.correction_id, correction_digest: value.correction_digest};
}
export async function verifyPresentation(value: unknown, identity?: {
  listing_id: string; publication_id?: string; listing_version_id?: string; approval_id?: string;
}, scope: 'public' | 'purchased' = 'public'): Promise<PublicPresentation> {
  const fail = () => { throw new Error('The approved listing presentation could not be verified'); };
  if (!record(value)) return fail();
  const corrected = value.presentation_kind === CORRECTION_KIND;
  const required = corrected ? [...baseFields, ...correctionFields] : baseFields;
  const optional = ['sample_files', 'approved_display_html', 'presentation_display_version'];
  if (required.some(key => !(key in value)) || (!corrected && correctionMarkers.some(key => key in value)) ||
      (scope === 'purchased' && Object.keys(value).some(key => ![...required, ...optional].includes(key))) ||
      !supportedVersion(value.presentation_version) || typeof value.rendered_html !== 'string' ||
      typeof value.render_hash !== 'string' || !HASH.test(value.render_hash)) return fail();
  // Display HTML is a separate description fragment; rendered_html remains the hashed evidence.
  if ((value.presentation_display_version != null && value.presentation_display_version !== 'approved-display-v1') ||
      (value.approved_display_html != null && (typeof value.approved_display_html !== 'string' || value.presentation_display_version !== 'approved-display-v1'))) return fail();
  if (corrected) {
    if (value.provenance !== 'platform_license_correction' || typeof value.license_label !== 'string' || !value.license_label.trim() ||
        ['listing_id', 'publication_id', 'listing_version_id', 'approval_id', 'correction_id'].some(key => typeof value[key] !== 'string' || !UUID.test(value[key] as string)) ||
        ['original_render_hash', 'original_admitted_render_hash', 'correction_digest'].some(key => typeof value[key] !== 'string' || !HASH.test(value[key] as string)) ||
        (identity && Object.entries(identity).some(([key, expected]) => expected !== undefined && value[key] !== expected))) return fail();
  }
  const bytes = new TextEncoder().encode(value.rendered_html);
  if (bytes.length > 100000) return fail();
  const hash = bytesToHex(sha256(bytes));
  if (hash !== value.render_hash) return fail();
  if (corrected) {
    // The canonical renderer escapes licence text in the hashed evidence.
    const label = (value.license_label as string).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
    const terms = [...value.rendered_html.matchAll(/<dt>License<\/dt><dd>([^<]*)<\/dd>/g)];
    if (terms.length !== 1 || terms[0][1] !== label) return fail();
  }
  return Object.fromEntries([...required, ...optional].filter(key => key in value).map(key => [key, value[key]])) as unknown as PublicPresentation;
}
/** Check every independent response binding actually supplied by this backend. */
export async function verifyCurrentListing(listing: Record<string, unknown>): Promise<{
  approved: PublicPresentation | null; display: LicenseDisplay | null;
}> {
  if (!record(listing)) throw new Error('Invalid listing');
  let approved: PublicPresentation | null = null;
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
    approved = await verifyPresentation(value, identity);
  }
  const correction = approved?.presentation_kind === CORRECTION_KIND ? approved : null;
  const display = readLicenseDisplay(listing.license_display, correction?.license_label);
  if (correction && (!display || display.correction_id !== correction.correction_id ||
      display.correction_digest !== correction.correction_digest)) throw new Error('Inconsistent current licence display');
  if (display && approved && !correction) throw new Error('Inconsistent original presentation');
  if (display && record(listing.license) && listing.license.code === 'standard' &&
      (typeof listing.license.version !== 'string' || display.license_label !== `ai.market Standard Data Licence v${listing.license.version}`))
    throw new Error('Inconsistent current instrument');
  if (display && typeof listing.license === 'string' && listing.license !== display.license_label)
    throw new Error('Inconsistent current licence label');
  return {approved, display};
}
