import {api} from './client';
import type {SellerAcceptance} from './listingLicenses';

export const LEGAL_IDENTITY_SUPPORT_PATH = '/seller-workspace/support/legal-identity';

export async function readLatestSellerSigner(signal:AbortSignal):Promise<Pick<SellerAcceptance,'signer_name'|'signer_title'> | null> {
  const {data}=await api.get('/seller-workspace/listing-licences/latest-signer',{signal});
  if(typeof data?.signer_name!=='string'||typeof data?.signer_title!=='string')return null;
  const signer_name=data.signer_name.trim();
  const signer_title=data.signer_title.trim();
  return signer_name&&signer_title&&Array.from(signer_name).length<=255&&Array.from(signer_title).length<=255
    ? {signer_name,signer_title} : null;
}

export type SellerLegalIdentity =
  | {status:'known';source:'stripe_connect'|'seller_typed';legal_name:string;jurisdiction:string;version:number;seller_editable?:boolean}
  | {status:'required';source:null;legal_name:null;jurisdiction:null;version:null;seller_editable?:boolean};

export type LegalIdentityFailure = 'conflict'|'required'|'unavailable'|'invalid'|'other';

export function legalIdentityFailure(error:unknown):LegalIdentityFailure {
  const response=(error as {response?:{status?:number;data?:{detail?:{code?:string}}}})?.response;
  if (response?.status===409 && response.data?.detail?.code==='LEGAL_IDENTITY_CONFLICT') return 'conflict';
  if (response?.status===409 && response.data?.detail?.code==='SELLER_LEGAL_IDENTITY_REQUIRED') return 'required';
  if (response?.status===503 && response.data?.detail?.code==='IDENTITY_SERVICE_UNAVAILABLE') return 'unavailable';
  if (response?.status===422 && response.data?.detail?.code==='LEGAL_IDENTITY_INVALID') return 'invalid';
  return 'other';
}

export async function getSellerLegalIdentity():Promise<SellerLegalIdentity> {
  return (await api.get<SellerLegalIdentity>('/seller-workspace/legal-identity')).data;
}

export async function refreshSellerLegalIdentity():Promise<SellerLegalIdentity> {
  return (await api.post<SellerLegalIdentity>('/seller-workspace/legal-identity/refresh')).data;
}

export async function saveSellerLegalIdentity(legal_name:string,jurisdiction:string,expected_version:number):Promise<SellerLegalIdentity> {
  return (await api.put<SellerLegalIdentity>('/seller-workspace/legal-identity',
    {legal_name,jurisdiction,expected_version})).data;
}
