// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { WorkspacePanel } from './WorkspacePanel';
afterEach(cleanup);

it('mounts on first visit, preserves edits while hidden, and keeps hidden controls out of the accessible page', () => {
  const panel = (active: boolean) => <WorkspacePanel active={active}><input aria-label="Draft title" /></WorkspacePanel>;
  const { rerender } = render(panel(false));
  expect(screen.queryByLabelText('Draft title')).toBeNull();
  rerender(panel(true));
  fireEvent.change(screen.getByLabelText('Draft title'), { target: { value: 'My offering' } });
  rerender(panel(false));
  expect(screen.queryByRole('textbox')).toBeNull();
  rerender(panel(true));
  expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('My offering');
});
