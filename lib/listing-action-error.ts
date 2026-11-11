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

  // Only plain text detail is eligible for display. Never coerce response data.
  if (typeof detail === 'string' && detail.trim() &&
      !/[<>\u0000-\u001f\u007f]/.test(detail) &&
      !/^[\s]*[\[{]/.test(detail) && !detail.includes('[object Object]')) {
    return { message: detail };
  }
  return { message: LISTING_ACTION_FALLBACK };
}
