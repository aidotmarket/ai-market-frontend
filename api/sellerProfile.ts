'use client';

import { isAxiosError } from 'axios';
import { api } from './client';

// This owner-only view deliberately excludes legal identity and payment fields.
export interface SellerPublicProfile {
  public_display_name: string | null;
  show_public_display_name: boolean;
}

export type SellerProfileField = keyof SellerPublicProfile;

export class SellerProfileError extends Error {
  constructor(
    message: string,
    readonly status: number | undefined,
    readonly fieldErrors: Partial<Record<SellerProfileField, string>> = {},
  ) {
    super(message);
    this.name = 'SellerProfileError';
  }
}

function profileError(error: unknown): SellerProfileError {
  const response = isAxiosError(error) ? error.response : undefined;
  const detail: unknown = response?.data?.detail;
  const fields: SellerProfileError['fieldErrors'] = {};
  const addField = (field: unknown, message: unknown) => {
    if ((field === 'public_display_name' || field === 'show_public_display_name') && typeof message === 'string') {
      fields[field] = message;
    }
  };
  // FastAPI schema validation and the shared public-text validator use different
  // detail shapes. Both must stay actionable at the corresponding control.
  if (Array.isArray(detail)) {
    for (const issue of detail) {
      if (issue && Array.isArray(issue.loc)) addField(issue.loc.at(-1), issue.msg);
    }
  } else if (detail && typeof detail === 'object') {
    const issue = detail as { field?: unknown; message?: unknown };
    addField(issue.field, issue.message);
  }
  const message = typeof detail === 'string' ? detail
    : detail && typeof detail === 'object' && 'message' in detail && typeof detail.message === 'string' ? detail.message
    : response?.status === 503 ? 'Business name validation is unavailable. Please try again.'
    : 'Could not update public business name settings. Please try again.';
  return new SellerProfileError(message, response?.status, fields);
}

function publicSettings(data: SellerPublicProfile): SellerPublicProfile {
  return {
    public_display_name: data.public_display_name ?? null,
    show_public_display_name: data.show_public_display_name ?? false,
  };
}

export async function getSellerPublicProfile(signal?: AbortSignal): Promise<SellerPublicProfile> {
  try {
    return publicSettings((await api.get<SellerPublicProfile>('/profiles/seller/me', { signal })).data);
  } catch (error) {
    throw profileError(error);
  }
}

export async function updateSellerPublicProfile(settings: SellerPublicProfile, signal?: AbortSignal): Promise<SellerPublicProfile> {
  try {
    return publicSettings((await api.patch<SellerPublicProfile>('/profiles/seller/me', {
      public_display_name: settings.public_display_name,
      show_public_display_name: settings.show_public_display_name,
    }, { signal })).data);
  } catch (error) {
    throw profileError(error);
  }
}
