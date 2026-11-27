import MarkdownIt from 'markdown-it';

const markdown = new MarkdownIt('commonmark', { html: true }).enable('table');
const ruleLabel = /^(?:max['’]s\s+rule(?:[\s-]+check)?|rule[\s-]+check|restriction (?:review|rationale))(?:\s+answers?)?(?:\s*\([^)]*\))?(?:\s*:\s*(.*)|\s*[–—-]\s+.*)?$/iu;
const prPrefix = /^pr\s+/iu;
const detailsClose = /^<\/details\s*>$/i;
const placeholder = /^(?:n\s*\/?\s*a|none|nothing|no|not applicable|tbd|todo|pending|placeholder|yes|ok|fill (?:this )?in|(?:your )?answer(?: here)?|replace (?:this )?with (?:your )?answer|(?:no|this (?:pr|change) adds no) (?:new )?restrictions?)$/iu;
const fields = [
  /^(?:harm|incident|problem)$/i,
  /^(?:effect|mechanism|behavior)$/i,
  /^(?:alternatives?|prior approach|narrower approach)$/i,
  /^(?:costs?|trade.?offs?)$/i,
];
const labelSeparator = /:\s*|\s+[–—]\s+/u;
const prompts = new Set([
  'what concrete incident or problem calls for the new restriction',
  'what does the restriction do, and when does it apply',
  'why was the existing or less restrictive approach insufficient',
  'what does the restriction cost, and who bears that cost',
]);

// Keep the contents of a GitHub details block in the Markdown token stream.
// The regular HTML block rule would consume adjacent Markdown as raw HTML.
markdown.block.ruler.before('html_block', 'details', (state, start, end, silent) => {
  const line = index => state.src.slice(state.bMarks[index] + state.tShift[index], state.eMarks[index]).trim();
  const text = line(start);
  const opening = /^<details(?:\s+open)?\s*>\s*(.*)$/i.exec(text);
  if (!opening && !detailsClose.test(text)) return false;
  if (silent) return true;

  state.line = start + 1;
  if (!opening) {
    state.push('details_close', '', 0);
    return true;
  }
  const summary = /^<summary>(.*?)<\/summary>(.*<\/details\s*>)?$/i;
  let label = summary.exec(opening[1]);
  if (!opening[1]) {
    const next = state.skipEmptyLines(state.line);
    if (next < end && (label = summary.exec(line(next)))) state.line = next + 1;
  }
  state.push('details_open', '', 0).content = label?.[1].trim() ?? '';
  if (label?.[2]) {
    const token = state.push('inline', '', 0);
    token.content = label[2];
    token.children = [];
  }
  return true;
}, { alt: ['paragraph', 'reference', 'blockquote'] });

function answerText(line) {
  const text = line.trim().replace(/^\d+[.)]\s+/, '').replace(/^\[[ x]\]\s*/i, '');
  const [label, ...rest] = text.split(labelSeparator);
  const answer = (rest.length ? rest.join(':') : label).replace(/^[\s[<(]+|[\s\]>)!.…–—-]+$/gu, '');
  return /[\p{L}\p{N}]/u.test(answer) && !placeholder.test(answer) &&
    !fields.some(field => field.test(answer)) && !prompts.has(answer.replace(/\?$/, '').toLowerCase()) &&
    !answer.endsWith('?');
}

function* descriptionTokens(body) {
  for (const token of markdown.parse(body ?? '', {})) {
    if (token.type !== 'inline') {
      yield token;
      continue;
    }
    let content = '';
    for (const child of token.children) {
      if (child.type === 'html_inline' && detailsClose.test(child.content)) {
        if (content) yield { type: 'inline', content };
        yield { type: 'details_close' };
        content = '';
      }
      if (child.type === 'softbreak' || child.type === 'hardbreak') content += '\n';
      if (child.type === 'text' || child.type === 'code_inline') content += child.content;
    }
    yield { type: 'inline', content };
  }
}

// Follow the approved checker: require visible answer text when it is clearly
// absent. Reviewers assess the substance and completeness of the four answers.
export function hasRuleAnswers(body) {
  const answeredFields = new Set();
  let depth = 0;
  let heading = 0;
  let quotes = 0;
  let inSection = false;
  let tableHeader = false;
  const details = [];
  for (const token of descriptionTokens(body)) {
    if (token.type === 'blockquote_open') quotes++;
    if (token.type === 'blockquote_close') quotes--;
    if (quotes) continue;
    if (token.type === 'heading_open') heading = Number(token.tag.slice(1));
    if (token.type === 'heading_close') heading = 0;
    if (token.type === 'thead_open') tableHeader = true;
    if (token.type === 'thead_close') tableHeader = false;
    if (token.type === 'details_open') {
      const answers = ruleLabel.test(token.content.replace(prPrefix, '')) ? new Set() : null;
      details.push({ depth, answers });
      // An Answers wrapper can continue the enclosing Rule heading.
      if (!/^answers?$/i.test(token.content)) depth = 0;
    }
    if (token.type === 'details_close' && details.length) {
      const closed = details.pop();
      if (closed.answers?.size >= fields.length) return true;
      depth = closed.depth;
    }
    if (token.type !== 'inline' || tableHeader) continue;

    const lines = token.content.split('\n');
    const answers = details.at(-1)?.answers;
    if (answers) {
      if (!heading) {
        for (const line of lines.flatMap(line => line.split(/(?<=[.!])\s+/u))) {
          const text = line.trim();
          if (!ruleLabel.test(text) && answerText(text)) answers.add(text);
        }
      }
      continue;
    }
    if (details.length && !heading && !depth) continue;
    if (heading && !details.length) inSection = true;
    if (heading && heading <= depth) depth = 0;
    for (const line of lines) {
      const text = line.trim();
      const label = ruleLabel.exec(heading ? text.replace(prPrefix, '') : text);
      if (label) {
        depth = heading || 6;
        if (label[1] && answerText(label[1])) return true;
      } else if (depth && !heading && answerText(line)) {
        return true;
      } else if (!details.length && !inSection && !heading && answerText(line)) {
        const [field] = line.trim().split(labelSeparator, 1);
        const index = fields.findIndex(pattern => pattern.test(field));
        if (index !== -1) answeredFields.add(index);
      }
    }
  }
  return answeredFields.size === fields.length;
}
