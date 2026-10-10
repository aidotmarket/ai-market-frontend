import { nativeClient, nativeSession, uuid, digest } from '@/api/connector-seller-settings';
import { isCompleteLicenseSelection, type LicenseSelection } from '@/api/listingLicenses';
export interface PreparationBinding {
  preparation_id: string; seller_id: string; organization_id: string | null; draft_id: string; draft_version: number;
  approval_id: string; listing_id: string; version_id: string; base_version_id: string | null;
  source_hash: string; render_hash: string; enrichment_hash: string; sample_set_hash: string;
  legal_selection_hash: string; legal_document_hash: string; legal_identity_hash: string; legal_identity_version: number | null;
}
export interface PreparationView {
  id: string; status: 'prepared' | 'signed' | 'published' | 'superseded'; binding: PreparationBinding;
  coverage_hash: string; acceptance_id: string | null; signing_required: boolean;
}
export interface SigningInstrument extends PreparationView { license_selection: LicenseSelection }
export interface SigningRequest { request_id: string; csrf: string; reauth_token?: string; instruments: { preparation_id: string; coverage_hash: string; selection: LicenseSelection }[] }
const base = '/seller-workspace';
function validView(v: PreparationView) {
  const b = v?.binding;
  return v && uuid(v.id) && b && b.preparation_id === v.id && digest(v.coverage_hash)
    && ['prepared', 'signed', 'published', 'superseded'].includes(v.status) && typeof v.signing_required === 'boolean'
    && (v.acceptance_id === null || uuid(v.acceptance_id))
    && [b.seller_id, b.draft_id, b.approval_id, b.listing_id, b.version_id].every(uuid)
    && (b.organization_id === null || uuid(b.organization_id)) && (b.base_version_id === null || uuid(b.base_version_id))
    && Number.isSafeInteger(b.draft_version) && b.draft_version >= 1
    && (b.legal_identity_version === null || Number.isSafeInteger(b.legal_identity_version))
    && [b.source_hash, b.render_hash, b.enrichment_hash, b.sample_set_hash, b.legal_selection_hash, b.legal_document_hash, b.legal_identity_hash].every(digest);
}
export async function readSigningInstruments(ids: string[]): Promise<SigningInstrument[]> {
  if (!ids.length || ids.length > 50 || new Set(ids).size !== ids.length || !ids.every(uuid)) throw new Error('INVALID_BATCH');
  const session = nativeSession();
  const results = await Promise.all(ids.map(async id => {
    const { data } = await nativeClient.get<SigningInstrument>(`${base}/listing-preparation/${id}`, { headers: session.headers });
    if (!validView(data) || data.id !== id || !data.license_selection || !isCompleteLicenseSelection(data.license_selection)) throw new Error('INVALID_INSTRUMENT');
    return data;
  }));
  if (nativeSession().token !== session.token) throw new Error('SESSION_CHANGED');
  return results;
}
export async function signInstruments(body: SigningRequest): Promise<PreparationView[]> {
  const session = nativeSession();
  if (body.csrf !== session.csrf || !uuid(body.request_id) || !body.instruments.length || body.instruments.length > 50
    || new Set(body.instruments.map(i => i.preparation_id)).size !== body.instruments.length) throw new Error('INVALID_BATCH');
  const { data } = await nativeClient.post<{ instruments: PreparationView[] }>(`${base}/listing-licences/sign`, body, { headers: session.headers });
  if (nativeSession().token !== session.token || !Array.isArray(data?.instruments) || data.instruments.length !== body.instruments.length
    || new Set(data.instruments.map(i => i.id)).size !== body.instruments.length
    || !data.instruments.every(v => validView(v) && v.status === 'signed' && !v.signing_required && uuid(v.acceptance_id)
      && body.instruments.some(i => i.preparation_id === v.id && i.coverage_hash === v.coverage_hash))) throw new Error('INVALID_RECEIPT');
  return data.instruments;
}
