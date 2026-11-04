const pairedTags = new Set(['p', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'strong', 'em']);

/** Accept only the backend listing renderer's fixed tags and escaped text. */
export function isBackendListingHtml(html: unknown): html is string {
  if (typeof html !== 'string') return false;
  const stack: string[] = [];
  let offset = 0;
  while (offset < html.length) {
    if (html[offset] !== '<') {
      if (stack.at(-1) === 'ul' || stack.at(-1) === 'ol') return false;
      const next = html.indexOf('<', offset);
      const end = next === -1 ? html.length : next;
      if (/[<>]|&(?!amp;|lt;|gt;|quot;|#x27;)/.test(html.slice(offset, end))) return false;
      offset = end;
      continue;
    }
    const end = html.indexOf('>', offset);
    if (end === -1) return false;
    const token = html.slice(offset, end + 1);
    offset = end + 1;
    const parent = stack.at(-1);
    if ((parent === 'ul' || parent === 'ol') && token !== '<li>' && token !== `</${parent}>`) return false;
    if (token === '<br>') continue;
    if (/^<ol start="(?:[2-9]|[1-9][0-9]{1,8})">$/.test(token)) {
      stack.push('ol');
      continue;
    }
    const match = /^<(\/?)([a-z0-9]+)>$/.exec(token);
    if (!match || !pairedTags.has(match[2])) return false;
    const [, closing, tag] = match;
    if (closing) {
      if (stack.pop() !== tag) return false;
    } else {
      if (tag === 'li' && stack.at(-1) !== 'ul' && stack.at(-1) !== 'ol') return false;
      stack.push(tag);
    }
  }
  return stack.length === 0;
}

export default function BackendListingHtml({description, descriptionHtml}: {
  description: string;
  descriptionHtml?: string | null;
}) {
  if (!isBackendListingHtml(descriptionHtml)) {
    return <div dir="auto" className="whitespace-pre-wrap break-words text-sm leading-6 [tab-size:4]">{description}</div>;
  }
  return <div dir="auto" className="break-words text-sm leading-6 [tab-size:4] [&_h2]:text-xl [&_h3]:text-lg [&_h4]:text-base [&_h2]:font-semibold [&_h3]:font-semibold [&_h4]:font-semibold [&_p]:my-2 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-6 [&_ol]:pl-6" dangerouslySetInnerHTML={{__html: descriptionHtml}}/>;
}
