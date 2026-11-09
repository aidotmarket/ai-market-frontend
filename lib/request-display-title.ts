/** Display only: equality matches the generator shape, not submission provenance. */
export function requestDisplayTitle(title: string | undefined, description: string): string | undefined {
  if (!title) return title;
  const prefix = /^\*\*Title:(?:\*\*)?[ \t]+/.exec(title);
  if (!prefix) return title;

  // data_request_service.py at 6b702dae: first sentence, then word-boundary truncation.
  // Python counts Unicode code points, rather than JavaScript UTF-16 code units.
  const sentence = Array.from(description.split('.')[0].trim());
  let generated = sentence.join('');
  if (sentence.length > 80) {
    const cut = sentence.slice(0, 77).join('');
    const lastSpace = cut.lastIndexOf(' ');
    generated = (lastSpace < 0 ? cut : cut.slice(0, lastSpace)) + '...';
  }
  if (title !== generated) return title;

  let display = title.slice(prefix[0].length);
  if (!prefix[0].includes('Title:**') && display.endsWith('**')) {
    display = display.slice(0, -2);
  }
  return display.trim() ? display : title;
}
