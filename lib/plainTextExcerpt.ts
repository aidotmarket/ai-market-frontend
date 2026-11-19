/** Display-only Markdown cleanup for plain-text request cards. */
export function plainTextExcerpt(value: string | undefined): string {
  if (!value) return '';
  return value
    .replace(/!?\[([^\]]*)\]\([^\n]*?\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+|\s+#+\s*$/gm, '')
    .replace(/^\s*(?:[-+*]|\d+[.)])\s+/gm, '')
    .replace(/\*+/g, '')
    .replace(/(?<!\w)_+|_+(?!\w)/g, '')
    .replace(/`+/g, '')
    .replace(/^\s*Title:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}
