export const ACTION_AUTH_REFRESH = 'Please refresh the page and try again.';

export function isLegacyActionAuthError(error: unknown): boolean {
  const response = (error as { response?: { data?: { detail?: unknown; code?: string; error?: string } } })?.response;
  const detail = response?.data?.detail;
  const code = typeof detail === 'string' ? detail
    : (detail as { code?: string } | undefined)?.code ?? response?.data?.code ?? response?.data?.error;
  return typeof code === 'string' && (['RECENT_LOGIN_REQUIRED', 'REAUTH_REQUIRED', 'recent_login_required', 'insufficient_assurance'].includes(code) || code.startsWith('SECOND_FACTOR_'));
}
