import type {Descriptor, Json, LogicalType, VerifiedEntry} from './types';
import {requirePreview as check} from './primitives';

/** Event Ledger b8ddbd10: producer ML evidence is authenticated by F2. This
 * independent browser pass implements only the frozen deterministic corpus.
 * No network, logging, matched values or DOM operations are permitted here. */
export const DETERMINISTIC_POLICY = 'aim-preview-policy-v1-deterministic';
export const PRODUCER_POLICY = 'aim-preview-policy-v1';
export const POLICY_VERSION = '1.0.0';
// Python Unicode word boundaries expanded explicitly (JS \b is ASCII-only).
const rules: readonly [string, RegExp][] = [
  ["secret", new RegExp("(-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:(?<![\\p{L}\\p{N}_])(?=[\\p{L}\\p{N}_])|(?<=[\\p{L}\\p{N}_])(?![\\p{L}\\p{N}_]))(?:AKIA|ASIA)[A-Z0-9]{16}(?:(?<![\\p{L}\\p{N}_])(?=[\\p{L}\\p{N}_])|(?<=[\\p{L}\\p{N}_])(?![\\p{L}\\p{N}_]))|(?:(?<![\\p{L}\\p{N}_])(?=[\\p{L}\\p{N}_])|(?<=[\\p{L}\\p{N}_])(?![\\p{L}\\p{N}_]))(?:gh[pousr]_|github_pat_|sk_live_|sk_test_|sk-(?:proj-)?|xox[baprs]-)|(?:(?<![\\p{L}\\p{N}_])(?=[\\p{L}\\p{N}_])|(?<=[\\p{L}\\p{N}_])(?![\\p{L}\\p{N}_]))(?:password|passwd|secret|api[_-]?key|access[_-]?token|authorization)\\s*[:=]|(?:(?<![\\p{L}\\p{N}_])(?=[\\p{L}\\p{N}_])|(?<=[\\p{L}\\p{N}_])(?![\\p{L}\\p{N}_]))Bearer\\s+\\S+|(?:(?<![\\p{L}\\p{N}_])(?=[\\p{L}\\p{N}_])|(?<=[\\p{L}\\p{N}_])(?![\\p{L}\\p{N}_]))eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+)", "iu")],
  ["personal_data", new RegExp("([\\p{L}\\p{N}_.+-]+@[\\p{L}\\p{N}_.-]+\\.[a-z]{2,}|(?:(?<![\\p{L}\\p{N}_])(?=[\\p{L}\\p{N}_])|(?<=[\\p{L}\\p{N}_])(?![\\p{L}\\p{N}_]))\\p{Nd}{3}[- ]?\\p{Nd}{2}[- ]?\\p{Nd}{4}(?:(?<![\\p{L}\\p{N}_])(?=[\\p{L}\\p{N}_])|(?<=[\\p{L}\\p{N}_])(?![\\p{L}\\p{N}_]))|(?:(?<![\\p{L}\\p{N}_])(?=[\\p{L}\\p{N}_])|(?<=[\\p{L}\\p{N}_])(?![\\p{L}\\p{N}_]))(?:\\p{Nd}[ -]?){10,19}(?:(?<![\\p{L}\\p{N}_])(?=[\\p{L}\\p{N}_])|(?<=[\\p{L}\\p{N}_])(?![\\p{L}\\p{N}_]))|(?:(?<![\\p{L}\\p{N}_])(?=[\\p{L}\\p{N}_])|(?<=[\\p{L}\\p{N}_])(?![\\p{L}\\p{N}_]))[A-Z]{2}\\p{Nd}{2}[A-Z0-9]{11,30}(?:(?<![\\p{L}\\p{N}_])(?=[\\p{L}\\p{N}_])|(?<=[\\p{L}\\p{N}_])(?![\\p{L}\\p{N}_]))|(?:(?<![\\p{L}\\p{N}_])(?=[\\p{L}\\p{N}_])|(?<=[\\p{L}\\p{N}_])(?![\\p{L}\\p{N}_]))(?:\\p{Nd}{1,3}\\.){3}\\p{Nd}{1,3}(?:(?<![\\p{L}\\p{N}_])(?=[\\p{L}\\p{N}_])|(?<=[\\p{L}\\p{N}_])(?![\\p{L}\\p{N}_])))", "iu")],
  ["executable", new RegExp("(<\\s*/?\\s*[a-z][^>]*>|(?:(?<![\\p{L}\\p{N}_])(?=[\\p{L}\\p{N}_])|(?<=[\\p{L}\\p{N}_])(?![\\p{L}\\p{N}_]))on[a-z]+\\s*=|(?:(?<![\\p{L}\\p{N}_])(?=[\\p{L}\\p{N}_])|(?<=[\\p{L}\\p{N}_])(?![\\p{L}\\p{N}_]))(?:javascript|vbscript|data)\\s*:|(?:(?<![\\p{L}\\p{N}_])(?=[\\p{L}\\p{N}_])|(?<=[\\p{L}\\p{N}_])(?![\\p{L}\\p{N}_]))(?:Sub\\s+Auto_Open|AutoOpen|Workbook_Open|CreateObject|Shell\\s*\\())", "iu")],
  ["url", new RegExp("((?:(?<![\\p{L}\\p{N}_])(?=[\\p{L}\\p{N}_])|(?<=[\\p{L}\\p{N}_])(?![\\p{L}\\p{N}_]))[a-z][a-z0-9+.-]*:|(?:(?<![\\p{L}\\p{N}_])(?=[\\p{L}\\p{N}_])|(?<=[\\p{L}\\p{N}_])(?![\\p{L}\\p{N}_]))www\\.|(?:(?<![\\p{L}\\p{N}_])(?=[\\p{L}\\p{N}_])|(?<=[\\p{L}\\p{N}_])(?![\\p{L}\\p{N}_]))(?:mailto|tel|file|javascript|data):|\\]\\s*\\(|(?:^|\\s)//[a-z0-9])", "iu")],
  ["restricted_content", new RegExp("((?:(?<![\\p{L}\\p{N}_])(?=[\\p{L}\\p{N}_])|(?<=[\\p{L}\\p{N}_])(?![\\p{L}\\p{N}_]))copyright(?:(?<![\\p{L}\\p{N}_])(?=[\\p{L}\\p{N}_])|(?<=[\\p{L}\\p{N}_])(?![\\p{L}\\p{N}_]))|\u00a9|all rights reserved|licensed under|not for redistribution|reproduced (?:from|with)|excerpt (?:from|of)|attribution required)", "iu")],
];
export function checkPolicyText(text: string, numeric = false): void {
  check(Array.from(text).length <= 500 && text.trim().split(/\s+/u).filter(Boolean).length <= 80, 'long_prose');
  check(!/[\p{Cc}\p{Cf}\p{Cs}]/u.test(text), 'control_character');
  check(numeric || !/^[=+@-]/u.test(text.trimStart()), 'formula');
  for (const [reason, pattern] of rules) check(!pattern.test(text.replace(/[İı]/gu, 'i')), reason);
  for (const candidate of text.match(/[A-Za-z0-9_-]{24,}/g) ?? []) {
    const counts = new Map<string, number>();
    for (const c of candidate) counts.set(c, (counts.get(c) ?? 0) + 1);
    let entropy = 0;
    for (const n of counts.values()) {const p = n / candidate.length; entropy -= p * Math.log2(p);}
    check(entropy < 4, 'high_entropy');
  }
}
/** Rows have already passed complete-row/schema/digest admission. Scan original
 * keys and values, including unselected fields, before producing a DOM handle.
 * NumericText parity uses descriptor-proven types, including nested arrays. */
export async function scanLocalPreview(entries: readonly VerifiedEntry[], signal: AbortSignal, schema: readonly Descriptor[]): Promise<void> {
  check(!signal.aborted, 'cancelled');
  check(entries.length >= 1 && entries.length <= 100, 'invalid_selection');
  function walk(value: Json, tag: LogicalType, params: Record<string, Json>, depth: number): void {
    check(!signal.aborted, 'cancelled'); check(depth <= 16, 'depth_limit');
    if (value === null || typeof value === 'boolean') return;
    if (typeof value === 'string' || typeof value === 'number') {
      check(typeof value !== 'number' || Number.isFinite(value), 'invalid_row');
      const numeric = tag === 'signed_integer' || tag === 'decimal';
      checkPolicyText(String(value), numeric);
      // Scan normalized text as well as the complete fetched representation.
      checkPolicyText(String(value).normalize('NFC'), numeric);
    } else if (Array.isArray(value)) {
      const element = params.element_type as {type: LogicalType; type_parameters: Record<string, Json>};
      check(tag === 'array' && !!element, 'invalid_row');
      for (const child of value) walk(child, element.type, element.type_parameters, depth + 1);
    } else {
      check(tag === 'object', 'invalid_row');
      const fields = params.object_fields as {name: string; type: LogicalType; type_parameters: Record<string, Json>}[];
      object(value, fields.map(f => [f.name, f.type, true, f.type_parameters]), depth);
    }
  }
  function object(row: Readonly<Record<string, Json>>, fields: readonly Descriptor[], depth: number) {
    check(row !== null && typeof row === 'object' && !Array.isArray(row), 'invalid_row');
    for (const [name, value] of Object.entries(row)) {
      checkPolicyText(name); checkPolicyText(name.normalize('NFC'));
      const field = fields.find(f => f[0] === name.normalize('NFC')); check(field, 'invalid_row');
      walk(value, field[1], field[3], depth + 1);
    }
  }
  for (const entry of entries) object(entry.row, schema, 0);
}
