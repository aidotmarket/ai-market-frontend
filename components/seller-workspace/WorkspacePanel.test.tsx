// @vitest-environment jsdom
import { createContext, useContext, useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { RecoverableWorkspacePanel, WorkspacePanel } from './WorkspacePanel';
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

const DraftTitle = createContext('');

function SyntheticStep({ fail }: { fail: boolean }) {
  const title = useContext(DraftTitle);
  if (fail) throw new Error('Synthetic render failure');
  return <p>Draft title in this step: {title}</p>;
}

function PanelHarness({ fail }: { fail: boolean }) {
  const [view, setView] = useState<'licence' | 'listing'>('licence');
  const [title, setTitle] = useState('');
  return (
    <DraftTitle.Provider value={title}>
      <nav aria-label="Workspace steps">
        <button onClick={() => setView('licence')}>Choose a licence</button>
        <button onClick={() => setView('listing')}>Describe and price</button>
      </nav>
      <RecoverableWorkspacePanel active={view === 'licence'}>
        <SyntheticStep fail={fail} />
      </RecoverableWorkspacePanel>
      <RecoverableWorkspacePanel active={view === 'listing'}>
        <label>Draft title<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label>Unsaved description<input /></label>
      </RecoverableWorkspacePanel>
    </DraftTitle.Provider>
  );
}

it.each(['visible', 'hidden'])('contains a render error in a visited %s step and retries only that step', (visibility) => {
  const onCaughtError = vi.fn();
  const { rerender } = render(<PanelHarness fail={false} />, { onCaughtError });
  const openListing = () => fireEvent.click(screen.getByRole('button', { name: 'Describe and price' }));
  const openLicence = () => fireEvent.click(screen.getByRole('button', { name: 'Choose a licence' }));
  const retry = () => fireEvent.click(screen.getByRole('button', { name: 'Retry this step' }));
  const expectFallback = (message: string) => {
    expect(screen.getByRole('alert').textContent).toBe(message);
    expect(screen.getByText(/Unsaved changes in this step may be lost/)).toBeTruthy();
    expect(screen.queryByText('Synthetic render failure')).toBeNull();
  };

  openListing();
  fireEvent.change(screen.getByRole('textbox', { name: 'Draft title' }), { target: { value: 'My offering' } });
  const description = screen.getByRole('textbox', { name: 'Unsaved description' }) as HTMLInputElement;
  fireEvent.change(description, { target: { value: 'Local edit' } });
  if (visibility === 'visible') openLicence();

  rerender(<PanelHarness fail />);
  expect(onCaughtError).toHaveBeenCalledTimes(1);
  if (visibility === 'hidden') {
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry this step' })).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Unsaved description' })).toBe(description);
    openLicence();
  }

  expectFallback('This step could not be displayed.');
  const firstAlert = screen.getByRole('alert');
  expect(screen.getByRole('navigation', { name: 'Workspace steps' })).toBeTruthy();
  retry();
  expect(onCaughtError).toHaveBeenCalledTimes(2);
  expectFallback('This step still could not be displayed.');
  expect(screen.getByRole('alert')).not.toBe(firstAlert);

  rerender(<PanelHarness fail={false} />);
  expectFallback('This step still could not be displayed.');
  retry();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(document.activeElement).toBe(screen.getByText('Draft title in this step: My offering').parentElement);

  openListing();
  expect(screen.getByRole('textbox', { name: 'Unsaved description' })).toBe(description);
  expect(description.value).toBe('Local edit');
});
