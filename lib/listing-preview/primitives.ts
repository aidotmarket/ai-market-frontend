import type {Sibling} from './types';

export function requirePreview(condition: unknown, code = 'invalid_preview'): asserts condition {
  if (!condition) throw new Error(code); // Fixed codes only. Never attach input/cause.
}
export const utf8 = (value: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(value);
export function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0; for (const part of parts) {out.set(part, offset); offset += part.length;} return out;
}
export const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
export function b64(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, b => String.fromCharCode(b)).join('')).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
export function unb64(value: string, size?: number): Uint8Array<ArrayBuffer> {
  requirePreview(typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value), 'invalid_encoding');
  let result: Uint8Array<ArrayBuffer>;
  try {result = Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));}
  catch {throw new Error('invalid_encoding');}
  requirePreview(b64(result) === value && (size === undefined || result.length === size), 'invalid_encoding');
  return result;
}
export async function sha(...parts: Uint8Array[]): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', concat(...parts)));
}
export function unicode(value: string): string {
  return value;
}
export function codepointCompare(a: string, b: string): number {
  const aa = Array.from(a, c => c.codePointAt(0)!); const bb = Array.from(b, c => c.codePointAt(0)!);
  for (let i = 0; i < Math.min(aa.length, bb.length); i++) if (aa[i] !== bb[i]) return aa[i] < bb[i] ? -1 : 1;
  return aa.length - bb.length;
}
/** RFC8785 for the admitted 2a subset. Build object text directly so integer-like
 * keys are not reordered by JSON.stringify's property enumeration rules. */
export function canonical(value: unknown, depth = 0): string {
  requirePreview(depth <= 64, 'depth_limit');
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(unicode(value));
  if (typeof value === 'number') {
    requirePreview(Number.isSafeInteger(value), 'unsafe_integer'); return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + value.map(v => canonical(v, depth + 1)).join(',') + ']';
  requirePreview(typeof value === 'object' && value !== null, 'invalid_json');
  const object = value as Record<string, unknown>, keys = Object.keys(object).sort();
  requirePreview(keys.every((k, i) => k === [...keys].sort(codepointCompare)[i]), 'noncanonical_key_order');
  return '{' + keys.map(k => canonical(k) + ':' + canonical(object[k], depth + 1)).join(',') + '}';
}
export const jcs = (value: unknown) => utf8(canonical(value));

/** Bounded JSON parser rejects duplicate/NFC-colliding keys and unsafe numeric
 * literals before JavaScript can round them. No reviver can detect these later. */
export function parseJson(raw: Uint8Array, ceiling: number): unknown {
  requirePreview(raw.length <= ceiling, 'byte_limit');
  let text: string;
  try {text = new TextDecoder('utf-8', {fatal: true}).decode(raw);} catch {throw new Error('invalid_unicode');}
  let pos = 0, nodes = 0;
  function ws() {while (/[\x20\t\r\n]/.test(text[pos] ?? '') && pos < text.length) pos++;}
  function string(): string {
    const start = pos++; let escaped = false;
    while (pos < text.length) {
      const c = text[pos++];
      if (!escaped && c === '"') {
        try {return unicode(JSON.parse(text.slice(start, pos)));} catch {throw new Error('invalid_json');}
      }
      if (!escaped && c === '\\') escaped = true; else escaped = false;
    }
    throw new Error('invalid_json');
  }
  function value(depth: number): unknown {
    requirePreview(depth <= 64 && ++nodes <= 100000, 'resource_limit'); ws();
    const c = text[pos];
    if (c === '"') return string();
    if (c === '{' || c === '[') {
      pos++; ws(); const object: Record<string, unknown> = Object.create(null), array: unknown[] = [], seen = new Set<string>();
      const close = c === '{' ? '}' : ']';
      if (text[pos] === close) {pos++; return c === '{' ? object : array;}
      while (pos < text.length) {
        if (c === '{') {
          ws(); requirePreview(text[pos] === '"'); const key = string();
          requirePreview(!seen.has(key.normalize('NFC')), 'duplicate_key'); seen.add(key.normalize('NFC'));
          ws(); requirePreview(text[pos++] === ':'); object[key] = value(depth + 1);
        } else array.push(value(depth + 1));
        ws(); const next = text[pos++]; if (next === close) return c === '{' ? object : array;
        requirePreview(next === ',');
      }
      throw new Error('invalid_json');
    }
    for (const [literal, result] of [['true', true], ['false', false], ['null', null]] as const) {
      if (text.startsWith(literal, pos)) {pos += literal.length; return result;}
    }
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(text.slice(pos));
    requirePreview(match, 'invalid_json'); pos += match[0].length;
    requirePreview(!/[.eE]/.test(match[0]) && Number.isSafeInteger(Number(match[0])), 'unsafe_integer');
    return Number(match[0]);
  }
  const result = value(0); ws(); requirePreview(pos === text.length, 'invalid_json'); canonical(result); return result;
}
export function closed(value: unknown, fields: string, optional = ''): asserts value is Record<string, unknown> {
  requirePreview(value && typeof value === 'object' && !Array.isArray(value), 'contract_mismatch');
  const required = fields.split(' ').filter(Boolean), allowed = new Set([...required, ...optional.split(' ')]);
  requirePreview(required.every(k => Object.hasOwn(value, k)) && Object.keys(value).every(k => allowed.has(k)), 'contract_mismatch');
}
export const natural = (n: unknown, min = 0): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= min;
export function timestamp(value: string): number {
  requirePreview(typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(value), 'invalid_timestamp');
  const ms = Date.parse(value); requirePreview(Number.isFinite(ms) && new Date(ms).toISOString() === value.slice(0, 23) + 'Z', 'invalid_timestamp'); return ms;
}
export async function verifyEd25519(key: string, signature: string, bytes: Uint8Array<ArrayBuffer>): Promise<boolean> {
  const raw = unb64(key, 32), sig = unb64(signature, 64);
  try {
    const imported = await crypto.subtle.importKey('raw', raw, {name: 'Ed25519'}, false, ['verify']);
    return await crypto.subtle.verify('Ed25519', imported, sig, bytes);
  } catch (error) {
    // Only unsupported algorithms use the pinned local fallback. Invalid
    // signatures and arbitrary crypto failures never become alternate success.
    if (!(error instanceof Error) || error.name !== 'NotSupportedError') return false;
    const {ed25519} = await import('@noble/curves/ed25519.js');
    return ed25519.verify(sig, bytes, raw, {zip215: false});
  }
}
export async function leaf(base: string, ordinal: number) {
  requirePreview(natural(ordinal), 'invalid_duplicate_ordinal'); const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, BigInt(ordinal)); return sha(utf8('\0aim-leaf-v1\0'), unb64(base, 32), bytes);
}
export const node = (left: Uint8Array, right: Uint8Array) => sha(new Uint8Array([1]), left, right);
function directions(index: number, size: number): string[] {
  requirePreview(natural(size, 1) && natural(index) && index < size, 'invalid_path');
  if (size === 1) return [];
  let split = 1; while (split * 2 < size) split *= 2;
  return index < split ? [...directions(index, split), 'right'] : [...directions(index - split, size - split), 'left'];
}
export async function inclusion(hash: Uint8Array, index: number, size: number, siblings: Sibling[], root: string): Promise<boolean> {
  const path = directions(index, size);
  if (siblings.length > 63 || siblings.length !== path.length) return false;
  for (let i = 0; i < siblings.length; i++) {
    const s = siblings[i]; closed(s, 'hash direction'); if (s.direction !== path[i]) return false;
    const other = unb64(s.hash, 32); hash = s.direction === 'left' ? await node(other, hash) : await node(hash, other);
  }
  return b64(hash) === root;
}
export async function consistency(oldSize: number, newSize: number, oldRoot: string, newRoot: string, proof: string[]): Promise<boolean> {
  if (!natural(oldSize, 1) || !natural(newSize, oldSize) || proof.length > 63) return false;
  if (oldSize === newSize) return proof.length === 0 && oldRoot === newRoot;
  let fn = BigInt(oldSize - 1), sn = BigInt(newSize - 1), i = 0;
  while (fn & 1n) {fn >>= 1n; sn >>= 1n;}
  if (fn !== 0n && !proof.length) return false;
  let first = unb64(fn === 0n ? oldRoot : proof[i++], 32), second = first;
  for (; i < proof.length; i++) {
    if (sn === 0n) return false; const item = unb64(proof[i], 32);
    if ((fn & 1n) || fn === sn) {
      first = await node(item, first); second = await node(item, second);
      while (fn && !(fn & 1n)) {fn >>= 1n; sn >>= 1n;}
    } else second = await node(second, item);
    fn >>= 1n; sn >>= 1n;
  }
  return sn === 0n && b64(first) === oldRoot && b64(second) === newRoot;
}
