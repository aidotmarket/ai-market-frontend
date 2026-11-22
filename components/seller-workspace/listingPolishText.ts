import type { CompletedReview, ReviewField } from "@/api/listingPolish";

export function expandReviewSelection(run: CompletedReview, ids: Iterable<string>) {
  const selected = new Set(ids);
  let size = -1;
  while (size !== selected.size) {
    size = selected.size;
    for (const group of run.proposal.atomic_groups) {
      if (group.change_ids.some(id => selected.has(id))) {
        group.change_ids.forEach(id => selected.add(id));
      }
    }
  }
  return selected;
}

export function reviewBaseline(run: CompletedReview, field: ReviewField, accepted: Set<string>) {
  const original = run.original[field];
  if (!original) return;
  // Backend splice offsets count Unicode code points, not UTF-16 code units.
  const source = Array.from(original.text);
  const edits = run.proposal.changes.flatMap(change =>
    change.field === field && accepted.has(change.change_id) ? change.edits ?? [] : [],
  ).sort((a, b) => a.start - b.start || a.end - b.end || a.order - b.order);
  let cursor = 0;
  const parts: string[] = [];
  for (const { start, end, text } of edits) {
    if (start < cursor || end < start || end > source.length) return;
    parts.push(source.slice(cursor, start).join(""), text);
    cursor = end;
  }
  return parts.join("") + source.slice(cursor).join("");
}

const sentences = (text: string) => text.match(/[^\n]+?(?:[.!?](?=\s|$)|(?=\n|$))|\n+/gu) ?? [];
type DiffPart = { kind: "same" | "before" | "after"; text: string };

export function sentenceDiff(before: string, after: string): DiffPart[] {
  const a = sentences(before);
  const b = sentences(after);
  // Bound comparison cost for unusually long lists. A whole-field change still
  // shows all affected text if a more granular comparison is too expensive.
  if ((a.length + 1) * (b.length + 1) > 250_000) {
    return [{ kind: "before", text: before }, { kind: "after", text: after }];
  }
  const width = b.length + 1;
  const matches = new Uint16Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      const next = (i + 1) * width + j;
      matches[i * width + j] = a[i] === b[j] ? 1 + matches[next + 1] :
        Math.max(matches[next], matches[i * width + j + 1]);
    }
  }
  const result: DiffPart[] = [];
  for (let i = 0, j = 0; i < a.length || j < b.length;) {
    if (i < a.length && a[i] === b[j]) {
      result.push({ kind: "same", text: a[i++] });
      j++;
    }
    else if (j === b.length || (i < a.length && matches[(i + 1) * width + j] >= matches[i * width + j + 1])) {
      result.push({ kind: "before", text: a[i++] });
    } else result.push({ kind: "after", text: b[j++] });
  }
  return result;
}
