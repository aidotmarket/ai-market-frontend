// @vitest-environment jsdom
import { createContext, use, useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { WorkspaceOverview, type WorkspaceView } from './WorkspaceOverview';
import { WorkspacePanel } from './WorkspacePanel';

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
  vi.restoreAllMocks();
});

it.each([false, true])('preserves healthy panel mounting and edits with reload fallback enabled=%s', showReloadOnError => {
  const panel = (active: boolean) => (
    <WorkspacePanel active={active} showReloadOnError={showReloadOnError}>
      <input aria-label="Draft title" />
    </WorkspacePanel>
  );
  const { rerender } = render(panel(false));
  expect(screen.queryByLabelText('Draft title')).toBeNull();
  rerender(panel(true));
  const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Draft title' });
  fireEvent.change(input, { target: { value: 'My offering' } });
  rerender(panel(false));
  expect(screen.queryByRole('textbox')).toBeNull();
  rerender(panel(true));
  expect(screen.getByRole('textbox')).toBe(input);
  expect(input.value).toBe('My offering');
  expect(screen.queryByRole('alert')).toBeNull();
});

it('contains a render failure and keeps the fallback through navigation and a reload request', () => {
  const submit = vi.fn(event => event.preventDefault());
  const save = vi.fn();
  const suggest = vi.fn();
  const reload = vi.fn();
  const onCaughtError = vi.fn();
  const logError = vi.spyOn(console, 'error');
  const Draft = createContext({ revision: 0, incrementRevision: () => {} });
  const ListingPanel = vi.fn(({ broken }: { broken: boolean }) => {
    if (broken) throw new Error('Synthetic render failure detail');
    return <button type="button" onClick={suggest}>Suggest a description</button>;
  });

  function SiblingPanel() {
    const { revision, incrementRevision } = use(Draft);
    return <>
      <input aria-label="Sibling edit" />
      <button type="button" onClick={incrementRevision}>Draft revision {revision}</button>
      <button type="button" onClick={save}>Save</button>
    </>;
  }

  function Workspace({ broken }: { broken: boolean }) {
    const [view, navigate] = useState<WorkspaceView>('data');
    const [revision, setRevision] = useState(0);
    return (
      <Draft.Provider value={{ revision, incrementRevision: () => setRevision(value => value + 1) }}>
        <WorkspaceOverview connections={[]} view={view} onViewChange={navigate} />
        <form onSubmit={submit}>
          <WorkspacePanel active={view === 'data'} showReloadOnError><SiblingPanel /></WorkspacePanel>
          <WorkspacePanel active={view === 'listing'} showReloadOnError><ListingPanel broken={broken} /></WorkspacePanel>
        </form>
      </Draft.Provider>
    );
  }

  const { rerender } = render(<Workspace broken={false} />, { onCaughtError });
  const navigation = screen.getByRole('navigation', { name: 'Workspace sections' });
  const chooseFiles = within(navigation).getByRole('button', { name: 'Choose your files' });
  const describe = within(navigation).getByRole('button', { name: 'Describe and price' });
  const siblingEdit = screen.getByRole<HTMLInputElement>('textbox', { name: 'Sibling edit' });
  fireEvent.change(siblingEdit, { target: { value: 'Local sibling edit' } });
  fireEvent.click(screen.getByRole('button', { name: 'Draft revision 0' }));
  fireEvent.click(describe);
  expect(screen.getByRole('button', { name: 'Suggest a description' })).toBeTruthy();

  rerender(<Workspace broken />);
  const alert = screen.getByRole('alert');
  const reloadButton = screen.getByRole('button', { name: 'Reload page' });
  expect(alert.textContent).toBe('Something went wrong in this section. Reload the page to continue from your last saved changes.');
  expect(screen.queryByText('Synthetic render failure detail')).toBeNull();
  expect(screen.getByRole('navigation', { name: 'Workspace sections' })).toBe(navigation);
  expect(onCaughtError).toHaveBeenCalledOnce();
  const rendersAfterFailure = ListingPanel.mock.calls.length;

  rerender(<Workspace broken={false} />);
  fireEvent.click(chooseFiles);
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByRole('textbox', { name: 'Sibling edit' })).toBe(siblingEdit);
  expect(siblingEdit.value).toBe('Local sibling edit');
  expect(screen.getByRole('button', { name: 'Draft revision 1' })).toBeTruthy();
  fireEvent.click(describe);
  expect(screen.getByRole('alert')).toBe(alert);
  expect(screen.getByRole('button', { name: 'Reload page' })).toBe(reloadButton);
  expect(reload).not.toHaveBeenCalled();

  vi.stubGlobal('window', Object.create(window, { location: { value: { reload } } }));
  fireEvent.click(reloadButton);
  expect(reload).toHaveBeenCalledOnce();
  expect(screen.getByRole('alert')).toBe(alert);
  expect(ListingPanel).toHaveBeenCalledTimes(rendersAfterFailure);
  expect(submit).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
  expect(suggest).not.toHaveBeenCalled();
  expect(logError).not.toHaveBeenCalled();
});
