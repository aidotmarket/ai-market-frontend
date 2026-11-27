'use client';

import { useState, type ReactNode } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { reportSellerWorkspaceCrash, type WorkspacePanelCrashStep } from '@/lib/seller-workspace-crash';

function PanelReloadFallback() {
  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-900">
      <p role="alert">Something went wrong in this section. Reload the page to continue from your last saved changes.</p>
      <button
        type="button"
        className="rounded-lg border border-gray-300 px-4 py-2 font-medium hover:bg-gray-50"
        onClick={() => window.location.reload()}
      >
        Reload page
      </button>
    </div>
  );
}

// Mount only on first visit, then preserve edits while other sections are shown.
// Unmounting the workspace still discards its temporary state.
export function WorkspacePanel({ active, children, showReloadOnError = false, crashStep }: {
  active: boolean;
  children: ReactNode;
  showReloadOnError?: boolean;
  crashStep?: WorkspacePanelCrashStep;
}) {
  const [visited, setVisited] = useState(active);
  if (active && !visited) setVisited(true);
  const content = showReloadOnError ? (
    <ErrorBoundary fallback={<PanelReloadFallback />} logErrors={false}
      onError={crashStep ? (error, info) => {
        void reportSellerWorkspaceCrash(crashStep, error, info.componentStack);
      } : undefined}>
      {children}
    </ErrorBoundary>
  ) : children;
  return <div hidden={!active}>{(active || visited) && content}</div>;
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
