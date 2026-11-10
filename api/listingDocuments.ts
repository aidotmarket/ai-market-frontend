import {nativeRead, nativeWrite} from './connector-seller-settings';
import type {DocumentDraft, DocumentKind, SellerDocument, SellerDocuments} from '@/types/listingDocuments';

const path = (listingId: string) => `/seller/listings/${encodeURIComponent(listingId)}/documents`;
export const readListingDocuments = (listingId: string, signal?: AbortSignal) =>
  nativeRead<SellerDocuments>(path(listingId), {signal});

export const saveDocumentDraft = (listingId: string, kind: DocumentKind, body: DocumentDraft, signal?: AbortSignal) =>
  nativeWrite<SellerDocument>(`${path(listingId)}/${kind}/draft`, body, signal, 'put');

export const publishDocument = (listingId: string, kind: DocumentKind, revision: number, render_hash: string, signal?: AbortSignal) =>
  nativeWrite<SellerDocument>(`${path(listingId)}/${kind}/publish`, {revision, render_hash}, signal);

export const withdrawDocument = (listingId: string, kind: DocumentKind, revision: number, signal?: AbortSignal) =>
  nativeWrite<SellerDocument>(`${path(listingId)}/${kind}/withdraw`, {revision}, signal);

export const discardDocumentDraft = (listingId: string, kind: DocumentKind, revision: number, signal?: AbortSignal) =>
  nativeWrite<SellerDocument>(`${path(listingId)}/${kind}/discard-draft`, {revision}, signal);
