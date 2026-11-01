// Railway's edge is the only ingress and preserves the caller as the first XFF address.
export function trustedClientIp(headers: Headers): string | null {
  const value = headers.get('x-forwarded-for')?.split(',')[0].trim();
  if (!value) return null;
  if (value.includes(':')) {
    try {
      const parsed = new URL(`http://[${value}]/`);
      return parsed.hostname ? value : null;
    } catch { return null; }
  }
  const parts = value.split('.');
  return parts.length === 4 && parts.every(part => /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255) ? value : null;
}
