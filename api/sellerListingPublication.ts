import axios from 'axios';
import {nativeRead,nativeWrite,sessionLifecycle} from './connector-seller-settings';
import {api} from './client';
import type {ApprovalReceipt} from './sellerListingReview';
export interface PublicationReceipt {
  id:string;approval_id:string;listing_id:string;listing_version_id:string;title:string;slug:string;
  status:string;is_listed:boolean;published_at:string;review_hash:string;render_hash:string;
}
export interface PublicationState {publication_available:boolean;publication:PublicationReceipt|null}
function validateReceipt(value:PublicationReceipt,approval:ApprovalReceipt):PublicationReceipt {
  if (!value || value.approval_id!==approval.id || value.review_hash!==approval.review_hash ||
      value.render_hash!==approval.render_hash || typeof value.slug!=='string' || !value.slug ||
      typeof value.title!=='string' || typeof value.status!=='string' || typeof value.is_listed!=='boolean' ||
      !Number.isFinite(Date.parse(value.published_at)) ||
      [value.id,value.listing_id,value.listing_version_id].some(id=>typeof id!=='string' || !/^[0-9a-f-]{36}$/.test(id)))
    throw new Error('Publication could not be verified');
  return value;
}
export async function readPublication(approval:ApprovalReceipt,signal:AbortSignal):Promise<PublicationState> {
  const state:PublicationState=(await api.get('/seller-workspace/listing-publication',{params:{approval_id:approval.id},signal})).data;
  signal.throwIfAborted();
  if (!state || typeof state.publication_available!=='boolean' || state.publication===undefined)
    throw new Error('Publication status could not be verified');
  return {...state,publication:state.publication===null?null:validateReceipt(state.publication,approval)};
}
export async function publishListing(approval:ApprovalReceipt,request_id:string,signal:AbortSignal,preparation_id?:string):Promise<PublicationReceipt> {
  const body={
    request_id,approval_id:approval.id,...(preparation_id?{preparation_id}:{}),review_hash:approval.review_hash,render_hash:approval.render_hash,
    ...(approval.license_selection ? {license_selection:approval.license_selection} : {}),
  };
  const receipt=preparation_id ? await nativeWrite<PublicationReceipt>('/seller-workspace/listing-publication',body,signal) : (await api.post('/seller-workspace/listing-publication',body,{signal})).data;
  signal.throwIfAborted();return validateReceipt(receipt,approval);
}

export interface PublicationPage {items:PublicationReceipt[];page:number;has_more:boolean}
export async function readPublicationPage(page:number,signal:AbortSignal):Promise<PublicationPage> {
  const value:PublicationPage=(await api.get('/seller-workspace/listing-publications',{params:{page},signal})).data;
  signal.throwIfAborted();
  if (!value || value.page!==page || typeof value.has_more!=='boolean' || !Array.isArray(value.items) || value.items.length>20)
    throw new Error('Listing status could not be verified');
  for (const item of value.items) validateReceipt(item,{id:item.approval_id,review_hash:item.review_hash,render_hash:item.render_hash} as ApprovalReceipt);
  return value;
}

export async function setPublicationVisibility(publication:PublicationReceipt,listed:boolean,request_id:string,signal:AbortSignal):Promise<PublicationReceipt> {
  const result=await writeVisibility(publication.listing_id,publication.status,listed,request_id,signal);
  if (result?.id!==publication.id || result?.listing_id!==publication.listing_id || result?.listing_version_id!==publication.listing_version_id)
    throw new Error('Listing status could not be verified');
  return validateReceipt(result,{id:publication.approval_id,review_hash:publication.review_hash,render_hash:publication.render_hash} as ApprovalReceipt);
}


async function writeVisibility(listingId: string, expectedStatus: string, listed: boolean, requestId: string, signal: AbortSignal) {
  const {data} = await api.post<PublicationReceipt>(`/seller-workspace/listing-publications/${encodeURIComponent(listingId)}/visibility`, {
    request_id: requestId, expected_status: expectedStatus, listed,
  }, {signal});
  signal.throwIfAborted();
  return data;
}

export async function pauseOwnerListing(listingId: string, requestId: string, signal: AbortSignal) {
  const result = await writeVisibility(listingId, 'published', false, requestId, signal);
  if (result?.listing_id !== listingId || result.status !== 'unlisted' || result.is_listed !== false) {
    throw new Error('Listing status could not be verified');
  }
}

export type RemovalAction = 'hide' | 'unhide' | 'withdraw';
type SellerStatus = 'published' | 'unlisted' | 'hidden' | 'withdrawn' | null;
type StaffRestriction = 'none' | 'hold' | 'takedown' | 'restricted';

interface ListingState {
  listing_id: string;
  status: string;
  seller_status: SellerStatus;
  staff_restriction: StaffRestriction;
  is_listed: boolean | null;
  confirmed_at: string | null;
  pending_effects: boolean;
  protected_buyer_count: number;
}

export interface OwnerListing extends ListingState {
  action_id: string | null;
  title: string;
  slug: string;
  withdrawn_at: string | null;
  allowed_actions: RemovalAction[];
}

export interface RemovalReceipt extends ListingState {
  action_id: string;
  confirmed_at: string;
}

interface OwnerListingPage { items: OwnerListing[]; cursor: string | null }
export interface BulkWithdrawal {
  receipts: RemovalReceipt[];
  failed: { listing_id: string; code: string }[];
  partial: boolean;
}

export interface RemovalRequest {
  request_id: string;
  action: RemovalAction;
  expected_status: string;
  expected_seller_status: SellerStatus;
  expected_staff_restriction: StaffRestriction;
  confirm_permanent?: true;
}

export interface BulkWithdrawalRequest {
  request_id: string;
  listing_ids: string[];
  confirm_permanent: true;
}

export function removalError(error: unknown) {
  const response = axios.isAxiosError(error) ? error.response : undefined;
  const detail = response?.data?.detail;
  return {
    status: response?.status,
    code: typeof detail?.code === 'string' ? detail.code as string : undefined,
    message: typeof detail?.message === 'string' ? detail.message as string : undefined,
  };
}

async function readOwnerListingPage(signal: AbortSignal, limit: number, cursor?: string): Promise<OwnerListingPage | null> {
  try {
    return await nativeRead('/seller-workspace/listings', {signal, params: {limit, ...(cursor ? {cursor} : {})}});
  } catch (error) {
    if (removalError(error).status === 404) return null;
    throw error;
  }
}

export async function hasOwnerListings(signal: AbortSignal) {
  const page = await readOwnerListingPage(signal, 1);
  if (!page) return false;
  if (!Array.isArray(page.items)) throw new Error('Listings could not be confirmed');
  return page.items.length > 0;
}

export async function readOwnerListings(signal: AbortSignal): Promise<OwnerListing[] | null> {
  const sameSession = sessionLifecycle();
  const rows = new Map<string, OwnerListing>();
  const cursors = new Set<string>();
  let cursor: string | null = null;
  do {
    if (!sameSession()) throw new Error('SESSION_CHANGED');
    const page = await readOwnerListingPage(signal, 50, cursor ?? undefined);
    if (!sameSession()) throw new Error('SESSION_CHANGED');
    if (!page) return null;
    if (!Array.isArray(page.items) ||
        (page.cursor !== null && (typeof page.cursor !== 'string' || !page.cursor || cursors.has(page.cursor)))) {
      throw new Error('Listings could not be confirmed');
    }
    for (const row of page.items) {
      if (!row?.listing_id || !Array.isArray(row.allowed_actions) ||
          row.allowed_actions.some(action => action !== 'hide' && action !== 'unhide' && action !== 'withdraw') ||
          !Number.isSafeInteger(row.protected_buyer_count) || row.protected_buyer_count < 0) {
        throw new Error('Listings could not be confirmed');
      }
      rows.set(row.listing_id, row);
    }
    cursor = page.cursor;
    if (cursor) cursors.add(cursor);
  } while (cursor);
  return [...rows.values()];
}

export async function changeListingRemoval(listingId: string, body: RemovalRequest, signal: AbortSignal) {
  const receipt = await nativeWrite<RemovalReceipt>(`/seller-workspace/listings/${encodeURIComponent(listingId)}/state`, body, signal);
  const expected = body.action === 'hide' ? ['hidden'] : body.action === 'withdraw' ? ['withdrawn'] : ['published', 'unlisted'];
  if (receipt?.listing_id !== listingId || !receipt.action_id || !expected.includes(receipt.seller_status ?? '')) {
    throw new Error('Listing change could not be confirmed');
  }
  return receipt;
}

export async function withdrawOwnerListings(body: BulkWithdrawalRequest, signal: AbortSignal) {
  const result = await nativeWrite<BulkWithdrawal>('/seller-workspace/listings/withdraw-all', body, signal);
  if (!Array.isArray(result?.receipts) || !Array.isArray(result.failed) ||
      result.receipts.some(item => !item?.action_id || item.seller_status !== 'withdrawn') ||
      result.failed.some(item => typeof item?.code !== 'string' || !item.code)) {
    throw new Error('Withdrawal could not be confirmed');
  }
  const reported = [...result.receipts, ...result.failed].map(item => item.listing_id);
  const confirmed = new Set(body.listing_ids);
  if (reported.length !== confirmed.size || new Set(reported).size !== confirmed.size ||
      reported.some(id => !confirmed.has(id)) || result.partial !== (result.failed.length > 0)) {
    throw new Error('Withdrawal could not be confirmed');
  }
  return result;
}
