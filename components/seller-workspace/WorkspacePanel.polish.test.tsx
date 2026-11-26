// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { acceptPolish, type AcceptPolishBody } from '@/api/listingPolish';
import { finishPolishAccept, pausePendingPolishAccept, pendingPolishAccept, queuePolishAccept } from './pendingPolishAccept';
import { useListingPolish } from './useListingPolish';
import { RecoverableWorkspacePanel } from './WorkspacePanel';

vi.mock('@/api/connector-seller-settings', () => ({ sessionLifecycle: () => () => true }));
vi.mock('@/lib/auth-session-owner', () => ({ subscribeAuthSessionOwner: vi.fn() }));
vi.mock('@/api/listingPolish', async original => ({
  ...await original<typeof import('@/api/listingPolish')>(),
  acceptPolish: vi.fn(),
}));

const body: AcceptPolishBody = { expected_draft_version: 1, request_id: 'queued', change_ids: ['change'], fact_confirmations: [] };
const dispatch = vi.mocked(acceptPolish);
beforeEach(() => {
  dispatch.mockImplementation((_run, _body, signal) => new Promise((_, reject) => {
    signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
  }));
});
afterEach(() => {
  cleanup();
  const pending = pendingPolishAccept();
  if (pending) finishPolishAccept(pending);
  vi.resetAllMocks();
});

function SuggestionControls({ active }: { active: boolean }) {
  const lock = useRef(false);
  const { panel } = useListingPolish({ draft: null, lock, reload: async () => null },
    active, false, false, { id: undefined, version: undefined }, () => {});
  return panel;
}

function SyntheticStep({ fail, active }: { fail: boolean; active: boolean }) {
  if (fail) throw new Error('Synthetic render failure');
  return <SuggestionControls active={active} />;
}

function workspace({ fail = false, active = true, draft = 'first' } = {}) {
  return <RecoverableWorkspacePanel key={draft} active={active} onRecovery={pausePendingPolishAccept}>
    <SyntheticStep fail={fail} active={active} />
  </RecoverableWorkspacePanel>;
}

const resume = () => screen.getByRole('button', { name: 'Resume applying suggestions' });

it('keeps an unsent accept paused after retry and full workspace re-entry until explicit Resume', () => {
  const { rerender, unmount } = render(workspace(), { onCaughtError: vi.fn() });
  rerender(workspace({ fail: true }));
  act(() => queuePolishAccept('run', body));
  rerender(workspace());
  fireEvent.click(screen.getByRole('button', { name: 'Retry this step' }));
  expect(screen.getByRole('status').textContent).toBe('Applying suggestions is paused.');
  expect(dispatch).not.toHaveBeenCalled();
  unmount();

  render(workspace());
  expect(screen.getByRole('status').textContent).toBe('Applying suggestions is paused.');
  expect(dispatch).not.toHaveBeenCalled();
  fireEvent.click(resume());
  expect(dispatch).toHaveBeenCalledExactlyOnceWith('run', body, expect.any(AbortSignal));
});

it('aborts an in-flight accept on a crash and waits for Resume even when the draft key changes', () => {
  act(() => queuePolishAccept('run', body));
  const { rerender } = render(workspace(), { onCaughtError: vi.fn() });
  expect(dispatch).toHaveBeenCalledOnce();
  const signal = dispatch.mock.calls[0][2];
  rerender(workspace({ fail: true }));
  expect(signal?.aborted).toBe(true);
  rerender(workspace({ draft: 'replacement' }));
  expect(screen.getByRole('status').textContent).toMatch(/may already have been applied/);
  expect(dispatch).toHaveBeenCalledOnce();
  fireEvent.click(resume());
  expect(dispatch).toHaveBeenCalledTimes(2);
  expect(dispatch).toHaveBeenLastCalledWith('run', body, expect.any(AbortSignal));
});

it('dispatches a never-paused intent on a healthy panel visit', () => {
  const { rerender } = render(workspace({ active: false }));
  act(() => queuePolishAccept('run', body));
  expect(dispatch).not.toHaveBeenCalled();
  rerender(workspace());
  expect(screen.queryByRole('button', { name: 'Resume applying suggestions' })).toBeNull();
  expect(dispatch).toHaveBeenCalledExactlyOnceWith('run', body, expect.any(AbortSignal));
});
