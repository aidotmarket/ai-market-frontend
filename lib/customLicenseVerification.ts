export const MAX_CUSTOM_LICENSE_CODEPOINTS = 65_536;

export function canonicalizeCustomText(value: string): string {
  return value.replace(/\r\n?/g, '\n').normalize('NFC')
    .split('\n').map(line => line.replace(/[\t ]+$/g, '')).join('\n')
    .replace(/\n+$/g, '') + '\n';
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function lengthPrefixed(bytes: Uint8Array): Uint8Array {
  const result = new Uint8Array(8 + bytes.length);
  new DataView(result.buffer).setBigUint64(0, BigInt(bytes.length));
  result.set(bytes, 8);
  return result;
}

function join(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

function canonicalJson(value: Record<string, string | boolean>): string {
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key.normalize('NFC'))}:${JSON.stringify(
    typeof value[key] === 'string' ? value[key].normalize('NFC') : value[key],
  )}`).join(',')}}`;
}

export async function hashLicenseComponentBytes(
  bytes: Uint8Array,
  reference: {kind: 'license' | 'covenant' | 'rider'; code: string; version: string; params: Record<string, string | boolean>},
): Promise<string> {
  const encoder = new TextEncoder();
  const domain = reference.kind === 'license' ? 'ai.market/license/v1' : reference.kind === 'rider' ? 'ai.market/rider/v1' : 'ai.market/covenant/v1';
  return sha256(join([
    lengthPrefixed(encoder.encode(domain)),
    lengthPrefixed(encoder.encode(reference.code.normalize('NFC'))),
    lengthPrefixed(encoder.encode(reference.version.normalize('NFC'))),
    lengthPrefixed(bytes),
    lengthPrefixed(encoder.encode(canonicalJson(reference.params))),
  ]));
}

export async function verifyCustomText(bytes: Uint8Array, sourceSha256: string, licenseSha256: string, aiTraining: boolean): Promise<string | null> {
  if (!/^[a-f0-9]{64}$/.test(sourceSha256) || !/^[a-f0-9]{64}$/.test(licenseSha256)) return null;
  let text: string;
  try { text = new TextDecoder('utf-8', {fatal: true}).decode(bytes); } catch { return null; }
  if (text !== canonicalizeCustomText(text) || !text.trim() || Array.from(text).length > MAX_CUSTOM_LICENSE_CODEPOINTS) return null;
  if (await sha256(bytes) !== sourceSha256) return null;
  if (await hashLicenseComponentBytes(bytes, {kind: 'license', code: 'custom', version: '1', params: {ai_training: aiTraining, source_sha256: sourceSha256}}) !== licenseSha256) return null;
  return text;
}
