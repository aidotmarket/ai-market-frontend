import MarkdownIt from 'markdown-it';

const markdown = new MarkdownIt('commonmark', { html: true });
const ruleLabel = /^(?:max['’]s\s+rule(?:[\s-]+check)?|rule[\s-]+check|restriction (?:review|rationale))(?:\s+answers?)?(?:\s*\([^)]*\))?(?:\s*:\s*(.*)|\s*[–—-]\s+.*)?$/iu;
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

function answerText(line) {
  const text = line.trim().replace(/^\d+[.)]\s+/, '').replace(/^\[[ x]\]\s*/i, '');
  const [label, ...rest] = text.split(labelSeparator);
  const answer = (rest.length ? rest.join(':') : label).replace(/^[\s[<(]+|[\s\]>)!.…–—-]+$/gu, '');
  return /[\p{L}\p{N}]/u.test(answer) && !placeholder.test(answer) &&
    !fields.some(field => field.test(answer)) && !prompts.has(answer.replace(/\?$/, '').toLowerCase()) &&
    !answer.endsWith('?');
}

function inlineText(token) {
  return token.children.map(child => {
    if (child.type === 'softbreak' || child.type === 'hardbreak') return '\n';
    if (child.type === 'text' || child.type === 'code_inline') return child.content;
    return '';
  }).join('');
}

// Follow the approved checker: require visible answer text when it is clearly
// absent. Reviewers assess the substance and completeness of the four answers.
export function hasRuleAnswers(body) {
  const answeredFields = new Set();
  let depth = 0;
  let heading = 0;
  let quotes = 0;
  for (const token of markdown.parse(body ?? '', {})) {
    if (token.type === 'blockquote_open') quotes++;
    if (token.type === 'blockquote_close') quotes--;
    if (quotes) continue;
    if (token.type === 'heading_open') heading = Number(token.tag.slice(1));
    if (token.type === 'heading_close') heading = 0;
    if (token.type !== 'inline') continue;

    const lines = inlineText(token).split('\n');
    if (heading && heading <= depth) depth = 0;
    for (const line of lines) {
      const label = ruleLabel.exec(line.trim());
      if (label) {
        depth = heading || 6;
        if (label[1] && answerText(label[1])) return true;
      } else if (depth && !heading && answerText(line)) {
        return true;
      } else if (!heading && answerText(line)) {
        const [field] = line.trim().split(labelSeparator, 1);
        const index = fields.findIndex(pattern => pattern.test(field));
        if (index !== -1) answeredFields.add(index);
      }
    }
  }
  return answeredFields.size === fields.length;
}
