'use client';

import { useState, type ReactNode } from 'react';

// Mount only on first visit, then preserve edits while other sections are shown.
// Unmounting the workspace still discards its temporary state.
export function WorkspacePanel({ active, children }: { active: boolean; children: ReactNode }) {
  const [visited, setVisited] = useState(active);
  if (active && !visited) setVisited(true);
  return <div hidden={!active}>{(active || visited) && children}</div>;
}
