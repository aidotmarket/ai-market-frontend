export const AIM_DATA_CONTINUATION = /^\/oauth\/authorize\?request=([A-Za-z0-9_-]{43})(?![\s\S])/;

const ALLOWED_PREFIXES = ['/listings', '/dashboard', '/checkout', '/requests'];
const LISTING_DETAIL_REDIRECT = /^\/listings\/[a-z0-9](?:[a-z0-9._~-]*[a-z0-9])?(?:[?#][^\r\n]*)?$/i;
const REDIRECT_CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/u;

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

  if (AIM_DATA_CONTINUATION.test(redirect)) return redirect;
  // Decode iteratively to handle double-encoding
  let decoded = redirect;
  let prev = '';
  for (let i = 0; i < 5 && decoded !== prev; i++) {
    prev = decoded;
    try { decoded = decodeURIComponent(decoded); } catch { return fallback; }
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

/** Return only a validated, single-listing detail redirect. */
export function validateListingRedirect(
  redirect: string | null | undefined
): string {
  try {
    const validated = validateRedirect(redirect, '');
    return !REDIRECT_CONTROL_CHARACTERS.test(validated) && LISTING_DETAIL_REDIRECT.test(validated)
      ? validated
      : '';
  } catch {
    return '';
  }
}
