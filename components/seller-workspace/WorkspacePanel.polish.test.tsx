// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useListingPolish } from './useListingPolish';
import { RecoverableWorkspacePanel } from './WorkspacePanel';

const { pendingAccept, runAction } = vi.hoisted(() => ({
  pendingAccept: vi.fn((): object | null => null),
  runAction: vi.fn(),
}));
vi.mock('@/api/listingPolish', () => ({}));
vi.mock('./pendingPolishAccept', () => ({ usePendingPolishAccept: pendingAccept }));
vi.mock('./usePolishAction', () => ({ usePolishAction: () => ({ status: '', run: runAction }) }));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function SuggestionControls() {
  const { panel } = useListingPolish({ draft: null, lock: { current: false }, reload: async () => null },
    true, false, false, { id: undefined, version: undefined }, () => {});
  return panel;
}

function SyntheticStep({ fail }: { fail: boolean }) {
  if (fail) throw new Error('Synthetic render failure');
  return <SuggestionControls />;
}

it('holds a pending suggestion write when retrying the listing step until the seller explicitly resumes it', () => {
  const panel = (fail: boolean) => <RecoverableWorkspacePanel active><SyntheticStep fail={fail} /></RecoverableWorkspacePanel>;
  const { rerender } = render(panel(false), { onCaughtError: vi.fn() });
  rerender(panel(true));

  pendingAccept.mockReturnValue({ sameSession: () => true });
  rerender(panel(false));
  fireEvent.click(screen.getByRole('button', { name: 'Retry this step' }));
  expect(screen.getByRole('status').textContent).toBe('Applying suggestions is paused.');
  expect(runAction).not.toHaveBeenCalled();

  // Observe the action dispatcher without executing its mutation callback.
  fireEvent.click(screen.getByRole('button', { name: 'Resume applying suggestions' }));
  expect(runAction).toHaveBeenCalledOnce();
});
