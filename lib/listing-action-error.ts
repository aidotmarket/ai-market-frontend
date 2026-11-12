import { ACTION_AUTH_REFRESH, isLegacyActionAuthError } from './action-auth-error';

export const LISTING_ACTION_FALLBACK = 'The change could not be confirmed. Refresh your listings and try again.';
export const LISTING_ACTION_WORKSPACE = 'Manage this listing in Seller Workspace.';

interface ListingActionError {
  message: string;
  workspaceHref?: '/dashboard/seller-workspace';
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

export function formatListingActionError(error: unknown): ListingActionError {
  if (isLegacyActionAuthError(error)) return { message: ACTION_AUTH_REFRESH };

  const data = record(record(record(error)?.response)?.data);
  const detail = data?.detail;
  if (record(detail)?.code === 'capability_required' || data?.code === 'capability_required') {
    return { message: LISTING_ACTION_WORKSPACE, workspaceHref: '/dashboard/seller-workspace' };
  }

  const draftFailure = listingDraftError(error);
  if (draftFailure) return { message: draftFailure.message };

  // Only plain text detail is eligible for display. Never coerce response data.
  if (isPlainListingMessage(detail)) {
    return { message: detail };
  }
  return { message: LISTING_ACTION_FALLBACK };
}

export function isPlainListingMessage(message:unknown):message is string {
  return typeof message==='string'&&!!message.trim()&&!/[<>\u0000-\u001f\u007f]/.test(message)&&!/^\s*[\[{]/.test(message)&&!message.includes('[object Object]');
}

export function listingDraftError(error:unknown):{message:string;alreadyPublished:boolean}|null {
  const detail=record(record(record(record(error)?.response)?.data)?.detail);
  if(!detail||!['DRAFT_IN_PROGRESS','DRAFT_ALREADY_PUBLISHED'].includes(typeof detail.code==='string'?detail.code:''))return null;
  const message=detail.message;
  if(!isPlainListingMessage(message))return null;
  return {message,alreadyPublished:detail.code==='DRAFT_ALREADY_PUBLISHED'};
}
