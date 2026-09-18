import {LIMITS} from './types';
import {parseJson, requirePreview as check} from './primitives';

/** Static admission matches the backend and additionally rejects numeric host
 * aliases after URL normalization. Browsers enforce CORS/private-network policy;
 * JavaScript cannot independently inspect DNS or the connected peer address. */
export function admitPackageUrl(value: string, platformOrigins: string[] = []): URL {
  check(typeof value === 'string' && value.length <= 2048 && /^[\x21-\x7e]+$/.test(value) && !/[?#\\]/.test(value), 'invalid_origin');
  let url: URL; try {url = new URL(value);} catch {throw new Error('invalid_origin');}
  const host = url.hostname.toLowerCase();
  check(url.protocol === 'https:' && !url.username && !url.password && url.port !== '0' && !host.endsWith('.') && host.includes('.'), 'invalid_origin');
  check(!host.includes(':') && !host.includes('[') && !host.includes('%'), 'private_origin');
  check(!['localhost', 'localhost.localdomain'].includes(host) && !/\.(localhost|local|internal|test|invalid)$/.test(host), 'private_origin');
  for (const h of ['ai.market', ...platformOrigins.map(o => new URL(o).hostname)]) check(host !== h && !host.endsWith('.' + h), 'platform_origin');
  // Admit DNS names only. Literal addresses include IPv4-mapped IPv6 and unusual
  // IPv4 encodings normalized by URL; all are refused without contacting them.
  check(!/^[\d.]+$/.test(host) && /^[a-z0-9.-]+$/.test(host) && host.split('.').every(p => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(p)), 'private_origin');
  return url;
}
export async function boundedBody(response: Response, ceiling: number, signal: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  check(response.ok && !response.redirected && response.type !== 'opaque', 'origin_unavailable');
  check(response.body, 'origin_unavailable'); const reader = response.body.getReader(), chunks: Uint8Array[] = []; let total = 0;
  const abort = () => {void reader.cancel().catch(() => undefined);}; signal.addEventListener('abort', abort, {once: true});
  try {
    while (true) {
      check(!signal.aborted, 'cancelled'); const {done, value} = await reader.read(); if (done) break;
      total += value.length; check(total <= ceiling, 'byte_limit'); chunks.push(value);
    }
    check(!signal.aborted, 'cancelled'); const output = new Uint8Array(total); let offset = 0;
    for (const chunk of chunks) {output.set(chunk, offset); offset += chunk.length;} return output;
  } finally {signal.removeEventListener('abort', abort); await reader.cancel().catch(() => undefined); reader.releaseLock();}
}
export async function fetchPackage(url: string, byteCeiling: number, signal: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  check(typeof window !== 'undefined', 'browser_only');
  admitPackageUrl(url, [window.location.origin, ...(process.env.NEXT_PUBLIC_API_URL ? [process.env.NEXT_PUBLIC_API_URL] : [])]);
  const response = await fetch(url, {credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', cache: 'no-store', mode: 'cors', signal});
  return boundedBody(response, Math.min(LIMITS.envelope_bytes, byteCeiling), signal);
}
export async function metadataResponse(response: Response, signal: AbortSignal): Promise<unknown> {
  return parseJson(await boundedBody(response, LIMITS.manifest_bytes, signal), LIMITS.manifest_bytes);
}
