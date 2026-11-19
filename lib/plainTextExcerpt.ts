/** Display-only Markdown cleanup for plain-text request cards. */
// Used server-side only; lookbehind needs Safari 16.4+ if ever imported client-side.
export function plainTextExcerpt(value: string | undefined): string {
  if (!value) return '';
  return value.slice(0, 600)
    .replace(/!?\[([^\]]*)\]\([^\n]*?\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+|\s+#+\s*$/gm, '')
    .replace(/^\s*(?:[-+*]|\d{1,2}[.)])\s+/gm, '')
    .replace(/\*\*([^*\n]*?)\*\*/g, '$1')
    .replace(/(?<!\*)\*([^\s*](?:[^*\n]*?[^\s*])?)?\*(?!\*)/g, '$1')
    .replace(/(?<![\p{L}\p{N}_])_+|_+(?![\p{L}\p{N}_])/gu, '')
    .replace(/`+/g, '')
    .replace(/^\s*Title:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}
