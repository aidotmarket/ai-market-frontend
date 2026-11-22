'use client';

import { useState, type ReactNode } from 'react';

// Mount only on first visit, then preserve edits while other sections are shown.
// Unmounting the workspace still discards its temporary state.
export function WorkspacePanel({ active, children }: { active: boolean; children: ReactNode }) {
  const [visited, setVisited] = useState(active);
  if (active && !visited) setVisited(true);
  return <div hidden={!active}>{(active || visited) && children}</div>;
}

// Workspace confirmations stay beside the item they affect.
export function WorkspaceConfirmation({label, children, className = 'mt-4 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4'}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return <div className={className} role="alertdialog" aria-label={label}>
    {children}
  </div>;
}
