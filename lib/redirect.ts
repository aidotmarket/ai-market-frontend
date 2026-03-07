const ALLOWED_PREFIXES = ['/listings', '/dashboard', '/checkout', '/requests'];

/**
 * Validate a redirect URL to prevent open redirect attacks.
 * Decodes iteratively to handle double/triple encoding, blocks protocol-relative
 * and absolute URLs, and enforces an allowlist of path prefixes.
 * Returns the decoded safe path, not the original.
 */
export function validateRedirect(
  redirect: string | null | undefined,
  fallback: string = '/dashboard'
): string {
  if (!redirect || typeof redirect !== 'string') return fallback;

  // Decode iteratively to handle double-encoding
  let decoded = redirect;
  let prev = '';
  for (let i = 0; i < 5 && decoded !== prev; i++) {
    prev = decoded;
    decoded = decodeURIComponent(decoded);
  }

  // Block protocol-relative URLs, backslashes, and protocol schemes
  if (decoded.includes('://') || decoded.startsWith('//') || decoded.includes('\\')) {
    return fallback;
  }

  // Must start with /
  if (!decoded.startsWith('/')) return fallback;

  // Allowlist prefixes
  if (!ALLOWED_PREFIXES.some((p) => decoded.startsWith(p))) return fallback;

  // Return the DECODED safe path, not the original
  return decoded;
}
