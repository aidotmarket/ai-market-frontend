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
export async function publishListing(approval:ApprovalReceipt,request_id:string,signal:AbortSignal):Promise<PublicationReceipt> {
  const receipt=(await api.post('/seller-workspace/listing-publication',{
    request_id,approval_id:approval.id,review_hash:approval.review_hash,render_hash:approval.render_hash,
  },{signal})).data;
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
  const result=(await api.post(`/seller-workspace/listing-publications/${encodeURIComponent(publication.listing_id)}/visibility`,{
    request_id,expected_status:publication.status,listed,
  },{signal})).data;
  signal.throwIfAborted();
  if (result?.id!==publication.id || result?.listing_id!==publication.listing_id || result?.listing_version_id!==publication.listing_version_id)
    throw new Error('Listing status could not be verified');
  return validateReceipt(result,{id:publication.approval_id,review_hash:publication.review_hash,render_hash:publication.render_hash} as ApprovalReceipt);
}
