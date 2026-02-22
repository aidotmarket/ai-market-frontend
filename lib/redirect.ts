const ALLOWED_PREFIXES = ['/listings', '/dashboard', '/checkout'];

/**
 * Validate a redirect URL to prevent open redirect attacks.
 * Returns the validated path or a safe default.
 */
export function validateRedirect(
  redirect: string | null | undefined,
  fallback: string = '/listings'
): string {
  if (!redirect || typeof redirect !== 'string') return fallback;

  const decoded = redirect;

  // Must start with /
  if (!decoded.startsWith('/')) return fallback;

  // Block protocol-relative and backslash tricks
  if (decoded.includes('://')) return fallback;
  if (decoded.includes('//')) return fallback;
  if (decoded.includes('\\')) return fallback;

  // Block encoded variants: %2F%2F (//) %5C (\) %3A (:)
  const upper = decoded.toUpperCase();
  if (upper.includes('%2F%2F')) return fallback;
  if (upper.includes('%5C')) return fallback;
  if (upper.includes('%3A%2F%2F')) return fallback;

  // Must match an allowed prefix
  const matchesPrefix = ALLOWED_PREFIXES.some(
    (prefix) => decoded === prefix || decoded.startsWith(prefix + '/')|| decoded.startsWith(prefix + '?')
  );
  if (!matchesPrefix) return fallback;

  return decoded;
}
