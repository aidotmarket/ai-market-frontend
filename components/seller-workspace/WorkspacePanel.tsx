'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { ErrorBoundary } from '../ErrorBoundary';

type WorkspacePanelProps = { active: boolean; children: ReactNode };
const RetriedWorkspacePanel = createContext(false);

export function useRetriedWorkspacePanel() {
  return useContext(RetriedWorkspacePanel);
}

// Mount only on first visit, then preserve edits while other sections are shown.
// Unmounting the workspace still discards its temporary state.
export function WorkspacePanel({ active, children }: WorkspacePanelProps) {
  const [visited, setVisited] = useState(active);
  if (active && !visited) setVisited(true);
  return <div hidden={!active}>{(active || visited) && children}</div>;
}

export function RecoverableWorkspacePanel({ active, children }: WorkspacePanelProps) {
  const [retried, setRetried] = useState(false);
  return (
    <WorkspacePanel active={active}>
      <ErrorBoundary fallback={(retry) => (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <p role="alert">This step could not be displayed.</p>
          <button type="button" onClick={() => { setRetried(true); retry(); }} className="mt-3 rounded-lg border px-4 py-2 text-sm font-medium">
            Retry this step
          </button>
        </div>
      )}>
        <RetriedWorkspacePanel.Provider value={retried}>{children}</RetriedWorkspacePanel.Provider>
      </ErrorBoundary>
    </WorkspacePanel>
  );
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
