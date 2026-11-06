'use client';
import { pendingActionError } from '@/api/pending-actions';
import { ACTION_AUTH_REFRESH } from '@/lib/action-auth-error';

/** Legacy authentication refusals never start another sign-in or code challenge. */
export default function NativeSellerAuth({ error }: { error: unknown }) {
  if (!error) return null;
  const kind = pendingActionError(error);
  return <p role="alert">{['login', 'company_login', 'second_factor', 'enrollment'].includes(kind)
    ? ACTION_AUTH_REFRESH : 'The decision could not be verified. Refresh and review again before submitting.'}</p>;
}
