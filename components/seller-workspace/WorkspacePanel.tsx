'use client';

import { useLayoutEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { ErrorBoundary } from '../ErrorBoundary';

type WorkspacePanelProps = { active: boolean; children: ReactNode };

// Mount only on first visit, then preserve edits while other sections are shown.
// Unmounting the workspace still discards its temporary state.
export function WorkspacePanel({ active, children, panelRef }: WorkspacePanelProps & { panelRef?: Ref<HTMLDivElement> }) {
  const [visited, setVisited] = useState(active);
  if (active && !visited) setVisited(true);
  return <div hidden={!active} ref={panelRef} tabIndex={panelRef ? -1 : undefined}>{(active || visited) && children}</div>;
}

export function RecoverableWorkspacePanel({ active, children, onRecovery }: WorkspacePanelProps & { onRecovery?: () => void }) {
  const [attempt, setAttempt] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (attempt && !panelRef.current?.hidden) panelRef.current?.focus();
  }, [attempt]);
  return (
    <WorkspacePanel active={active} panelRef={panelRef}>
      <ErrorBoundary onError={onRecovery} fallback={(retry) => (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <p key={attempt} role="alert">{attempt ? 'This step still could not be displayed.' : 'This step could not be displayed.'}</p>
          <p>If the problem continues, reload the page. Unsaved changes in this step may be lost.</p>
          <button type="button" onClick={() => { onRecovery?.(); setAttempt(value => value + 1); retry(); }} className="mt-3 rounded-lg border px-4 py-2 text-sm font-medium">
            Retry this step
          </button>
        </div>
      )}>
        {children}
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
