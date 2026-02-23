const ALLOWED_PREFIXES = ['/listings', '/dashboard', '/checkout'];
const FALLBACK = '/';

/**
 * Validate a redirect URL to prevent open redirect attacks.
 * Decodes repeatedly to catch double/triple encoding, blocks protocol-relative
 * and absolute URLs, and enforces an allowlist of path prefixes.
 */
export function validateRedirect(
  redirect: string | null | undefined,
  fallback: string = FALLBACK
): string {
  if (!redirect || typeof redirect !== 'string') return fallback;

  // Decode repeatedly (max 3 iterations) to catch double/triple encoding
  let decoded = redirect;
  for (let i = 0; i < 3; i++) {
    const next = decodeURIComponent(decoded);
    if (next === decoded) break;
    decoded = next;
  }

  // Block protocol-relative, absolute URLs, backslashes
  if (decoded.includes('://') || decoded.startsWith('//') || decoded.includes('\\')) {
    return fallback;
  }

  // Must start with /
  if (!decoded.startsWith('/')) return fallback;

  // Must match an allowed prefix
  if (!ALLOWED_PREFIXES.some((p) => decoded.startsWith(p))) return fallback;

  // Return the ORIGINAL (not decoded) if safe
  return redirect;
}
