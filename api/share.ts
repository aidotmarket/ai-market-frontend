'use client';

import { api } from './client';

export type ListingShareCaptionStatus = 'machine' | 'seller_edited' | 'flagged' | string;

export interface ListingShareCaption {
  og_title: string;
  og_description: string;
  caption_text: string;
  status: ListingShareCaptionStatus;
  confidence?: number | null;
  locale?: string;
}

export type PromoteNetwork = 'x' | 'li' | 'rd' | 'bs' | 'wa' | 'tg' | 'em';
export interface PromoteOut {
  enabled: boolean;
  can_share: boolean;
  ttl_seconds: 45;
  links: Record<PromoteNetwork, { share_url: string; compose_url: string; prefilled: boolean }>;
  copy_text: string;
  share_title: string;
  counts: Array<{
    network: PromoteNetwork | 'other';
    opens: { all: number; d30: number };
    inquiries: {
      all: { value: number | null; masked: boolean };
      d30: { value: number | null; masked: boolean };
    };
  }>;
  rules: string;
}

export interface ListingShareResponse {
  promote: PromoteOut | null;
  listing_id: string;
  short_code: string;
  share_url: string;
  card_url: string;
  locale?: string;
  caption: ListingShareCaption | null;
}

export type ListingShareCaptionUpdateBody =
  | {
      mode: 'draft' | 'regenerate';
      locale?: string;
      target_locales?: string[];
    }
  | {
      mode: 'accept_edit';
      locale?: string;
      target_locales?: string[];
      og_title?: string;
      og_description?: string;
      caption_text?: string;
    };

export interface ListingShareCaptionDraftResponse {
  status: 'drafted' | string;
  fallback_used?: boolean;
  captions: ListingShareCaption[];
}

export interface ListingShareCaptionAcceptedResponse {
  status: 'accepted' | string;
  caption: ListingShareCaption;
}

export type ListingShareCaptionUpdateResponse =
  | ListingShareCaptionDraftResponse
  | ListingShareCaptionAcceptedResponse;

export async function fetchListingShare(
  listingId: string,
  options?: { uiLocale?: string; locale?: string },
): Promise<ListingShareResponse> {
  const res = await api.get<ListingShareResponse>(
    `/listings/${encodeURIComponent(listingId)}/share`,
    {
      params: {
        ...(options?.locale ? { locale: options.locale } : {}),
        ...(options?.uiLocale ? { ui_locale: options.uiLocale } : {}),
      },
    },
  );
  return res.data;
}

export async function updateListingShareCaption(
  listingId: string,
  body: ListingShareCaptionUpdateBody,
): Promise<ListingShareCaptionUpdateResponse> {
  const res = await api.post<ListingShareCaptionUpdateResponse>(
    `/listings/${encodeURIComponent(listingId)}/share/caption`,
    body,
  );
  return res.data;
}
