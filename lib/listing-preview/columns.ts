import type {Manifest} from './types';
import {closed, hex, jcs, requirePreview as check, sha} from './primitives';
import {uuid} from './wire';

export interface ApprovedColumn {name: string; type: string; description?: string | null; unit?: string | null}
export type ApprovedDescription = Pick<ApprovedColumn, 'name' | 'description' | 'unit'>;

/** Exact-name join. No cell inference, mutable schema labels, or fuzzy matching. */
export function joinApprovedColumns(columns: readonly ApprovedColumn[], descriptions: readonly ApprovedDescription[] = []): ApprovedColumn[] {
  if (new Set(columns.map(c => c.name)).size !== columns.length || new Set(descriptions.map(c => c.name)).size !== descriptions.length) {
    throw new Error('approved_column_mismatch');
  }
  return columns.map(column => {
    const detail = descriptions.find(d => d.name === column.name);
    return {...column, ...(detail ? {description: detail.description, unit: detail.unit} : {})};
  });
}

/** Authenticate the original RFC8785 payload against the F2-bound current head.
 * This optional metadata can only add exact-name labels; failures omit labels.
 * approval_version is opaque metadata covered by render_hash, not a disclosure ID. */
export async function signedSummaryDescriptions(raw: unknown, manifest: Pick<Manifest, 'summary_hash' | 'render_hash' | 'source_revision' | 'selected_fields'>): Promise<ApprovedDescription[]> {
  try {
    closed(raw, 'payload summary_hash render_hash source_revision approval_version');
    uuid(raw.approval_version);
    check(raw.summary_hash === manifest.summary_hash && raw.render_hash === manifest.render_hash && raw.source_revision === manifest.source_revision, 'summary_identity_mismatch');
    // Snapshot prior to await; never retain mutable caller-supplied label data.
    const bytes = jcs(raw.payload), payload = JSON.parse(new TextDecoder().decode(bytes));
    check(hex(await sha(bytes)) === manifest.summary_hash, 'summary_hash_mismatch');
    check(payload.profile === 'aim-listing-enrichment-profile-v2', 'summary_profile');
    const fields = payload.key_fields?.value;
    check(Array.isArray(fields) && fields.length <= 500, 'approved_column_mismatch');
    const names = fields.map((field: unknown) => {closed(field, 'name type'); check(typeof field.name === 'string' && typeof field.type === 'string'); return field.name;});
    check(new Set(names).size === names.length && manifest.selected_fields.every(n => names.includes(n)), 'approved_column_mismatch');
    const descriptions = payload.field_descriptions?.value ?? [];
    check(Array.isArray(descriptions) && descriptions.length <= 500, 'approved_column_mismatch');
    const result: ApprovedDescription[] = descriptions.map((detail: unknown) => {
      closed(detail, 'name', 'description unit');
      check(typeof detail.name === 'string' && names.includes(detail.name), 'approved_column_mismatch');
      check(detail.description === undefined || typeof detail.description === 'string' && Array.from(detail.description).length <= 500, 'approved_column_mismatch');
      check(detail.unit === undefined || typeof detail.unit === 'string' && Array.from(detail.unit).length <= 80, 'approved_column_mismatch');
      return {name: detail.name, description: detail.description as string | undefined, unit: detail.unit as string | undefined};
    });
    check(new Set(result.map(d => d.name)).size === result.length, 'approved_column_mismatch');
    return result;
  } catch {return [];}
}
