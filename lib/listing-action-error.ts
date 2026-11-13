import { ACTION_AUTH_REFRESH, isLegacyActionAuthError } from './action-auth-error';
import { SELLER_SETUP_STEPS } from './seller-setup-steps';

export const LISTING_ACTION_FALLBACK = "That didn't work. Please try again or contact support.";
export const LISTING_ACTION_WORKSPACE = 'Manage this listing in Seller Workspace.';

interface ListingActionError {
  message: string;
  workspaceHref?: '/dashboard/seller-workspace';
  setupHref?: '/dashboard';
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

export function formatListingActionError(error: unknown): ListingActionError {
  if (isLegacyActionAuthError(error)) return { message: ACTION_AUTH_REFRESH };

  const responseData = record(record(error)?.response)?.data;
  const data = record(responseData);
  const detail = data?.detail;
  const capabilityFailure = [record(detail), data].find(value =>
    value?.code === 'capability_required' || value?.error === 'capability_required');
  if (capabilityFailure) {
    const missingSteps = capabilityFailure.missing_steps;
    if (Array.isArray(missingSteps) && missingSteps.length) {
      const labels = [...new Set(missingSteps.map(id =>
        SELLER_SETUP_STEPS.find(step => step.id === id)?.label ?? 'remaining setup steps'))];
      return {
        message: `Finish seller setup first: ${labels.join(', ')}, then try again.`,
        setupHref: '/dashboard',
      };
    }
    return { message: LISTING_ACTION_WORKSPACE, workspaceHref: '/dashboard/seller-workspace' };
  }

  const draftFailure = listingDraftError(error);
  if (draftFailure) return { message: draftFailure.message };

  // Only plain text detail is eligible for display. Never coerce response data.
  if (isPlainListingMessage(detail)) {
    return { message: detail };
  }
  if (isPlainListingMessage(responseData)) return { message: responseData };
  if (isPlainListingMessage(error)) return { message: error };
  console.error('Listing action failed', error);
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
