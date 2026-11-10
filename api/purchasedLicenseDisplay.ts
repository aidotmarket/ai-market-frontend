import {api} from './client';
import {HASH, UUID, record, verifyPresentation, type OriginalPresentation} from '@/lib/publicPresentation';
export interface PurchasedLicenseDisplay {
  presentation_kind: 'purchased-license-display-v1'; order_id:string; listing_id:string; listing_version_id:string|null;
  original_snapshot_hash:string; original_license:unknown; license_record_url:string|null;
  instrument_display: null | {acceptance_id:string;license_code:string;license_version:string;license_label:string|null;
    license_sha256:string;covenant_sha256:string;rider_sha256:string|null;provenance:'purchased_instrument';notice:string};
  retained_presentation: null | {publication_id:string;approval_id:string;provenance:'original_seller_evidence';
    presentation:OriginalPresentation;original_render_hash:string;notice:string};
  retained_presentation_status?: 'unavailable'|'ambiguous';
}
const NOTICE = 'Purchased instrument display; original accepted evidence retained.';
const EVIDENCE_NOTICE = 'Original seller evidence for the purchased version; not a checkout receipt.';
function exactFields(value:Record<string,unknown>,required:string[],optional:string[]=[]):boolean {
  return required.every(key=>key in value)&&Object.keys(value).every(key=>required.includes(key)||optional.includes(key));
}
export async function parsePurchasedLicenseDisplay(value:unknown, orderId:string, listingId:string):Promise<PurchasedLicenseDisplay> {
  const fail=()=>{throw new Error('Purchased licence display could not be verified');};
  const uuid=(v:unknown)=>typeof v==='string'&&UUID.test(v);
  const hash=(v:unknown)=>typeof v==='string'&&HASH.test(v);
  if (!record(value) || !exactFields(value,['presentation_kind','order_id','listing_id','listing_version_id','original_snapshot_hash','original_license','license_record_url','instrument_display','retained_presentation'],['retained_presentation_status']) || value.presentation_kind!=='purchased-license-display-v1' || !uuid(value.order_id) || value.order_id!==orderId ||
      !uuid(value.listing_id) || value.listing_id!==listingId || (value.listing_version_id!==null&&!uuid(value.listing_version_id)) ||
      !hash(value.original_snapshot_hash) || !('original_license' in value) ||
      (value.license_record_url!==null&&value.license_record_url!==`/api/v1/orders/${orderId}/license-record`) ||
      (value.retained_presentation_status!==undefined&&!['unavailable','ambiguous'].includes(value.retained_presentation_status as string))) return fail();
  const instrument=value.instrument_display;
  if (instrument!==null) {
    if (!record(instrument) || !exactFields(instrument,['acceptance_id','license_code','license_version','license_label','license_sha256','covenant_sha256','rider_sha256','provenance','notice']) || !uuid(instrument.acceptance_id) || typeof instrument.license_code!=='string' || !instrument.license_code ||
        typeof instrument.license_version!=='string' || !instrument.license_version ||
        (instrument.license_label!==null&&typeof instrument.license_label!=='string') ||
        !hash(instrument.license_sha256) || !hash(instrument.covenant_sha256) || (instrument.rider_sha256!==null&&!hash(instrument.rider_sha256)) ||
        instrument.provenance!=='purchased_instrument' || instrument.notice!==NOTICE) return fail();
    if (instrument.license_code==='standard' && ['1.0','1.1'].includes(instrument.license_version) &&
        instrument.license_label!==`ai.market Standard Data Licence v${instrument.license_version}`) return fail();
  }
  const retained=value.retained_presentation;
  if (retained!==null) {
    if (!record(retained) || !exactFields(retained,['publication_id','approval_id','provenance','presentation','original_render_hash','notice']) || !uuid(retained.publication_id) || !uuid(retained.approval_id) ||
        retained.provenance!=='original_seller_evidence' || !hash(retained.original_render_hash) || retained.notice!==EVIDENCE_NOTICE) return fail();
    const presentation=await verifyPresentation(retained.presentation);
    if (presentation.presentation_kind!==undefined) return fail();
  }
  return value as unknown as PurchasedLicenseDisplay;
}
export async function getPurchasedLicenseDisplay(orderId:string, listingId:string, signal:AbortSignal):Promise<PurchasedLicenseDisplay> {
  const response=await api.get(`/orders/${encodeURIComponent(orderId)}/license-display`, {
    signal, adapter:'fetch', fetchOptions:{cache:'no-store'},
  });
  const policy=String(response.headers['cache-control']??'').toLowerCase().split(',').map(v=>v.trim());
  if (!policy.includes('private')||!policy.includes('no-store')) throw new Error('Purchased licence display must not be cached');
  const result=await parsePurchasedLicenseDisplay(response.data,orderId,listingId);
  signal.throwIfAborted();
  return result;
}
