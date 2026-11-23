/** Display only: equality matches the generator shape, not submission provenance. */
export function requestDisplayTitle(title: string | undefined, description: string, variant: 'card' | 'detail' = 'card'): string | undefined {
  if (!title) return title;
  const prefix = /^\*\*Title:(?:\*\*)?[ \t]+/.exec(title);
  if (!prefix && variant === 'card') return title;

  // data_request_service.py at 6b702dae: first sentence, then word-boundary truncation.
  // Python counts Unicode code points, rather than JavaScript UTF-16 code units.
  const fullSentence = description.split('.')[0].trim();
  const sentence = Array.from(fullSentence);
  let generated = fullSentence;
  if (sentence.length > 80) {
    const cut = sentence.slice(0, 77).join('');
    const lastSpace = cut.lastIndexOf(' ');
    generated = (lastSpace < 0 ? cut : cut.slice(0, lastSpace)) + '...';
  }
  if (title !== generated) return title;

  const displayTitle = variant === 'detail' ? fullSentence : title;
  if (!prefix) return displayTitle;

  let display = displayTitle.slice(prefix[0].length);
  if (!prefix[0].includes('Title:**') && display.endsWith('**')) {
    display = display.slice(0, -2);
  }
  return display.trim() ? display : title;
}
