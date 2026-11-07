// Exact backend696 recovery surface. Auth/account APIs remain on the API host.
export const SUPPORT_ACCOUNT_PATH = '/support/mailbox-account';
export const SUPPORT_RECOVERY_PATHS = [
  '/api/v1/support/mailbox-confirm',
  '/api/v1/support/mailbox-confirm/email',
  '/api/v1/support/email-visit/:ticket',
  '/api/v1/support/email-visit/:ticket/conversation',
  '/api/v1/support/email-visit/:ticket/draft',
  '/api/v1/support/email-visit/:ticket/messages',
  '/api/v1/support/email-visit/:ticket/customer-receipts',
] as const;
export function supportApiOrigin(value?: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) return null;
    return url.origin;
  } catch { return null; }
}
export function supportRecoveryRewrites(apiUrl?: string) {
  const origin = supportApiOrigin(apiUrl);
  return origin ? SUPPORT_RECOVERY_PATHS.map(source => ({ source, destination: origin + source })) : [];
}
export function supportAccountCsp(nonce: string, apiUrl?: string): string {
  const origin = supportApiOrigin(apiUrl);
  return `default-src 'none'; script-src 'self' 'nonce-${nonce}'; connect-src 'self'${origin ? ' ' + origin : ''}; style-src 'self'; font-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; object-src 'none'`;
}
export function isSupportPrivatePath(path: string): boolean {
  return path.replace(/\/$/, '') === SUPPORT_ACCOUNT_PATH || /^\/api\/v1\/support\/(?:mailbox-confirm(?:\/email)?|email-visit\/[^/]+(?:\/(?:conversation|draft|messages|customer-receipts))?)\/?$/.test(path);
}
