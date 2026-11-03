import MarkdownIt, {type Options} from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import listBlock from 'markdown-it/lib/rules_block/list.mjs';
import paragraph from 'markdown-it/lib/rules_block/paragraph.mjs';
import reference from 'markdown-it/lib/rules_block/reference.mjs';

export const PARITY_CORPUS_SHA256 = 'b0da0779cf59ab28f09985844070657818985ca0cd9470d7d9d4c1d96e7b657a';
export const EXTRA_PARITY_CORPUS_SHA256 = '2f286c9ae71b544f1aa3850f553cf8364d8d5d501e6124a413c9fa982fdfa86d';
export const MAX_LIST_NESTING = 8;

// Keep the parser rules and token walk in sync with backend acfbed2f's
// app/services/listing_markdown.py. Never use markdown-it's HTML renderer.
// maxNesting is supported by markdown-it but omitted from its Options type.
const parserOptions: Options & {maxNesting: number} = {maxNesting: 64};
const parser = new MarkdownIt('commonmark', parserOptions).disable('entity').enable('table');
parser.block.ruler.at('reference', (state, startLine, endLine, silent) => {
  if (!reference(state, startLine, endLine, silent)) return false;
  if (!silent) {
    delete state.env.references;
    const token = state.push('literal_reference', '', 0);
    token.map = [startLine, state.line];
  }
  return true;
});
parser.block.ruler.at('list', (state, startLine, endLine, silent) => {
  if (silent) return listBlock(state, startLine, endLine, true);
  const depth = state.env.listing_list_depth ?? 0;
  if (depth >= MAX_LIST_NESTING && listBlock(state, startLine, endLine, true)) {
    const firstToken = state.tokens.length;
    paragraph(state, startLine, endLine, false);
    state.tokens.length = firstToken;
    const token = state.push('literal_list_overflow', '', 0);
    token.map = [startLine, state.line];
    return true;
  }
  state.env.listing_list_depth = depth + 1;
  try {
    return listBlock(state, startLine, endLine, false);
  } finally {
    state.env.listing_list_depth = depth;
  }
}, {alt: ['paragraph', 'reference', 'blockquote']});

const inlineTypes = new Set(['text', 'softbreak', 'hardbreak', 'strong_open', 'strong_close', 'em_open', 'em_close']);
const blockTags: Record<string, string> = {paragraph: 'p', bullet_list: 'ul', ordered_list: 'ol', list_item: 'li'};

// All source/token text is escaped before entering the fixed-tag HTML below.
function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}

function inlineContent(tokens: Token[]): string {
  return tokens.map(token => {
    if (token.type === 'text') return escapeText(token.content);
    if (token.type === 'softbreak') return '\n';
    if (token.type === 'hardbreak') return '<br>';
    const tag = token.type.startsWith('strong_') ? 'strong' : 'em';
    return token.nesting === 1 ? `<${tag}>` : `</${tag}>`;
  }).join('');
}

function renderSource(source: string): string {
  const lines = source.split('\n');
  const tokens = parser.parse(source, {});
  function walk(start: number, stop: number): string {
    const output: string[] = [];
    let index = start;
    while (index < stop) {
      const token = tokens[index];
      let end = index + 1;
      let depth: number = token.nesting;
      while (depth && end < stop) depth += tokens[end++].nesting;
      const kind = token.type.replace(/_open$/, '');
      const tag = kind === 'heading' ? `h${Math.min(Number(token.tag.slice(1)) + 1, 4)}` : blockTags[kind];
      const children = token.nesting ? tokens.slice(index + 1, end - 1) : [token];
      const overflow = token.level === 0 && tokens.slice(index, end).some(child => child.type === 'literal_list_overflow');
      const literal = overflow || !tag || children.some(child => child.level === token.level + 1 && child.type === 'inline' && child.children?.some(item => !inlineTypes.has(item.type)));
      if (literal) {
        if (!token.map) throw new Error('literal Markdown block has no source line map');
        const content = escapeText(lines.slice(token.map[0], token.map[1]).join('\n'));
        output.push(token.hidden ? content : '<p>' + content + '</p>');
      } else if (kind === 'paragraph' || kind === 'heading') {
        const content = inlineContent(children.flatMap(child => child.children ?? []));
        output.push(token.hidden ? content : `<${tag}>${content}</${tag}>`);
      } else {
        const number = Number(token.attrGet('start') || 1);
        const attrs = kind === 'ordered_list' && number > 1 ? ` start="${number}"` : '';
        output.push(`<${tag}${attrs}>${walk(index + 1, end - 1)}</${tag}>`);
      }
      index = end;
    }
    return output.join('');
  }
  return walk(0, tokens.length);
}

// Display only: never write rendered text back to storage or hash verification.
// HTML contains only our fixed tags, numeric ol[start], and escaped text.
// Serializing inline tokens directly avoids React recursion on deep emphasis.
export default function ListingMarkdown({text}: {text: string}) {
  return <div dir="auto" className="break-words text-sm leading-6 [tab-size:4] [&_h2]:text-xl [&_h3]:text-lg [&_h4]:text-base [&_h2]:font-semibold [&_h3]:font-semibold [&_h4]:font-semibold [&_p]:my-2 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-6 [&_ol]:pl-6" dangerouslySetInnerHTML={{__html: renderSource(text.replace(/\r\n?/g, '\n'))}}/>;
}
