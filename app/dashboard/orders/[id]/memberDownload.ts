'use server';

// Browser fetch hides a manual redirect's Location. Resolve only the redirect
// on the Next server; never fetch file bytes or forward the grant to storage.
export async function resolveMemberDownload(orderId: string, index: number, downloadToken: string, accessToken: string): Promise<{ url: string } | { reason: unknown }> {
  if (!/^[a-zA-Z0-9-]+$/.test(orderId) || !Number.isSafeInteger(index) || index < 0 || !downloadToken || !accessToken) {
    return { reason: 'download_request_failed' };
  }
  // The refresh cookie is API-host-only and scoped to /api/v1/auth; it
  // cannot authenticate this Next action. Keep the in-memory buyer bearer.
  const origin = process.env.API_URL;
  if (!origin) {
    const error = new Error('API_URL must be configured for member downloads.');
    error.name = 'MemberDownloadApiUrlMissingError';
    throw error;
  }
  try {
    const response = await fetch(`${origin}/api/v1/orders/${encodeURIComponent(orderId)}/members/${index}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}`, 'X-Download-Token': downloadToken },
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(30000),
    });
    if (response.status === 302) {
      const location = response.headers.get('Location');
      if (!location) return { reason: 'download_request_failed' };
      const url = new URL(location);
      if (url.protocol !== 'https:' || url.username || url.password || location.includes(downloadToken) || location.includes(accessToken)) {
        return { reason: 'download_request_failed' };
      }
      return { url: url.href };
    }
    const body = await response.json();
    const detail = body.detail;
    // Return only named reasons, never arbitrary backend diagnostics or tokens.
    const reason = typeof detail === 'string' ? detail : detail?.code;
    const allowed = ['grant_rate_limit', 'download_limit_reached', 'delivery_not_complete', 'grant_expiring', 'invalid_grant', 'member_unavailable', 'byte_budget_exceeded', 'delivery_busy', 'delivery_retention_expired'];
    return { reason: allowed.includes(reason) ? reason : 'download_request_failed' };
  } catch {
    return { reason: 'download_request_failed' };
  }
}
