// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { advanceAuthSessionOwner } from '@/lib/auth-session-owner';
import { explainCopy, explainQuestions, matchExplainQuestion } from '@/lib/i18n/explain';
import { useAuthStore } from '@/store/auth';
import { answerFixture, bearer, explainUser, ids, questions } from '@/tests/explain-fixtures';
import { guidedConnection, guidedObjects } from '@/tests/guidedListingFixture';
import { nativeClient } from '@/api/connector-seller-settings';
import type { ApprovalReceipt } from '@/api/sellerListingReview';
import SellerPublication from '@/components/seller-workspace/SellerPublication';
import { WorkspaceData } from '@/components/seller-workspace/WorkspaceData';
import { WorkspaceOverview } from '@/components/seller-workspace/WorkspaceOverview';
import type { ExplainRequest } from '@/api/explain';
import { AllAIProvider, useAllAI } from './AllAIContext';
import AllAIPanel from './AllAIPanel';
import { ExplainEntry, useExplainPage, type ExplainPage } from './ExplainContext';

const mock = vi.hoisted(() => ({
  path: '/dashboard/seller-workspace', query: '', append: vi.fn(), objects: vi.fn(),
  readPublication: vi.fn(), publishListing: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => mock.path,
  useSearchParams: () => new URLSearchParams(mock.query),
}));
vi.mock('@/api/explain', async original => ({ ...await original<typeof import('@/api/explain')>(), appendExplain: mock.append }));
vi.mock('@/api/sellerWorkspace', async original => ({
  ...await original<typeof import('@/api/sellerWorkspace')>(), listWorkspaceObjects: mock.objects,
}));
vi.mock('@/api/sellerListingPublication', () => ({ readPublication: mock.readPublication, publishListing: mock.publishListing }));

function Page({ page }: { page: ExplainPage }) {
  useExplainPage(page);
  const { open } = useAllAI();
  return <>
    <button onClick={open}>Open assistant</button>
    {Object.keys(page.targets).length > 0 && explainQuestions.map(question => <ExplainEntry key={question} question={question} />)}
  </>;
}

const tree = (page: Omit<ExplainPage, 'route'>, controls?: ReactNode) => <AllAIProvider>
  <Page page={{ route: '/dashboard/seller-workspace', ...page }} />{controls}<AllAIPanel />
</AllAIProvider>;
const workspace: Omit<ExplainPage, 'route'> = { scope: 'data', targets: { where_am_i: questions.where_am_i } };
const panel = () => screen.getByRole('dialog');
const input = () => within(panel()).getByRole('textbox', { name: explainCopy().input });
const setLocale = (locale: string) => fireEvent.change(within(panel()).getByRole('combobox'), { target: { value: locale } });

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_STAGE_A_EXPLAIN_ENABLED', 'true');
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fixture network denied')));
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => window.setTimeout(() => fn(0), 0));
  window.history.replaceState(null, '', '/dashboard/seller-workspace');
  vi.stubGlobal('innerWidth', 1200);
  mock.path = '/dashboard/seller-workspace'; mock.query = '';
  mock.append.mockReset().mockImplementation((_admit, request: ExplainRequest) => Promise.resolve({
    kind: 'answer', answer: answerFixture(request),
  }));
  mock.objects.mockReset().mockResolvedValue({ objects: guidedObjects, next_cursor: null });
  mock.readPublication.mockReset().mockResolvedValue({ publication_available: true, publication: null });
  mock.publishListing.mockReset();
  advanceAuthSessionOwner(false);
  useAuthStore.setState({ token: bearer(), user: explainUser, isAuthenticated: true });
  sessionStorage.clear();
  localStorage.clear();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it.each(explainQuestions)('dispatches only the closed selector for %s and renders approved output', async question => {
  const target = questions[question];
  render(tree({ scope: question, targets: { [question]: target } }));
  fireEvent.click(await screen.findByRole('button', { name: explainCopy().question(question) }));
  const fixture = answerFixture({ intent: 'explain', question, locale: 'en', target });
  await within(panel()).findByText(fixture.turn.answer);
  expect(mock.append).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ signal: expect.any(AbortSignal) }),
    { intent: 'explain', question, locale: 'en', target });
  expect(sessionStorage.length).toBe(0);
  expect(localStorage.length).toBe(0);
  expect(fetch).not.toHaveBeenCalled();
});

it.each(['es', 'zh-Hans'] as const)('uses the active %s labels, preserves IME and renders the two distinct steps', async locale => {
  render(tree(workspace));
  fireEvent.click(screen.getByRole('button', { name: 'Open assistant' }));
  fireEvent.click(within(panel()).getByRole('button', { name: 'Explain' }));
  setLocale(locale);
  const copy = explainCopy(locale);
  const textbox = within(panel()).getByRole('textbox', { name: copy.input });
  fireEvent.change(textbox, { target: { value: copy.question('where_am_i') } });
  fireEvent.keyDown(textbox, { key: 'Enter', isComposing: true, keyCode: 229 });
  expect(mock.append).not.toHaveBeenCalled();
  fireEvent.keyDown(textbox, { key: 'Enter' });
  const request: ExplainRequest = { intent: 'explain', question: 'where_am_i', locale, target: questions.where_am_i };
  const response = answerFixture(request);
  expect((await within(panel()).findByText(response.turn.answer)).closest('article')?.lang).toBe(locale);
  expect(mock.append.mock.calls[0][1]).toEqual(request);
});

it('shows reviewed suggestions locally for unmatched or ambiguous text', async () => {
  render(tree(workspace));
  fireEvent.click(screen.getByRole('button', { name: 'Open assistant' }));
  fireEvent.click(within(panel()).getByRole('button', { name: 'Explain' }));
  fireEvent.change(input(), { target: { value: "synthetic private text: where am I and why can't I publish?" } });
  fireEvent.keyDown(input(), { key: 'Enter' });
  expect(within(panel()).getByText(explainCopy().suggestions)).toBeTruthy();
  expect(within(panel()).getByRole('button', { name: explainCopy().question('order_status') })).toBeTruthy();
  expect(within(panel()).queryByText(/synthetic private text/)).toBeNull();
  expect(mock.append).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  expect(matchExplainQuestion('Where am I?', 'fr-CA')).toBe('where_am_i');
});

it('requires an explicit order role when the selected page belongs to both roles', async () => {
  const orderChoices = [questions.order_status, { ...questions.order_status, role: 'seller' as const }];
  render(tree({ scope: 'both', targets: {}, orderChoices }));
  fireEvent.click(screen.getByRole('button', { name: 'Open assistant' }));
  fireEvent.click(within(panel()).getByRole('button', { name: 'Explain' }));
  fireEvent.click(within(panel()).getByRole('button', { name: explainCopy().question('order_status') }));
  expect(mock.append).not.toHaveBeenCalled();
  fireEvent.click(within(panel()).getByRole('button', { name: 'Seller' }));
  await waitFor(() => expect(mock.append.mock.calls[0][1].target).toEqual(orderChoices[1]));
});

it.each(['selector', 'path', 'route', 'account', 'organization', 'tab', 'restore', 'logout'] as const)(
  'aborts work and clears the draft input and prior answer on %s changes', async event => {
    const view = render(tree(workspace));
    fireEvent.click(await screen.findByRole('button', { name: 'Where am I?' }));
    const first = await within(panel()).findByText(/Your last saved step was Review/);
    expect(first).toBeTruthy();
    let finish!: (reply: unknown) => void;
    mock.append.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    fireEvent.change(input(), { target: { value: 'which step am I on?' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    fireEvent.change(input(), { target: { value: 'another private edit' } });
    expect(mock.append).toHaveBeenCalledTimes(2);
    const signal = mock.append.mock.calls[1][0].signal;
    await act(async () => {
      if (event === 'selector') view.rerender(tree({ ...workspace, targets: { where_am_i: { ...questions.where_am_i, source_version: 5 } } }));
      if (event === 'path') { mock.path = '/dashboard/orders'; window.history.replaceState(null, '', mock.path); view.rerender(tree(workspace)); }
      if (event === 'route') { mock.query = 'view=new'; window.history.replaceState(null, '', '?view=new'); view.rerender(tree(workspace)); }
      if (event === 'account') useAuthStore.setState({ user: { ...explainUser, id: 'replacement' }, token: bearer('new', 'other', 'replacement') });
      if (event === 'organization') useAuthStore.setState({ token: bearer('new', 'other') });
      if (event === 'tab') advanceAuthSessionOwner(false);
      if (event === 'restore') window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
      if (event === 'logout') { advanceAuthSessionOwner(); useAuthStore.setState({ user: null, token: null, isAuthenticated: false }); }
    });
    expect(signal.aborted).toBe(true);
    await act(async () => finish({ kind: 'answer', answer: answerFixture(mock.append.mock.calls[1][1]) }));
    expect(screen.queryByText(/Your last saved step was Review/)).toBeNull();
    expect(screen.queryByDisplayValue('another private edit')).toBeNull();
    expect(mock.append).toHaveBeenCalledTimes(2);
    if (event === 'restore' || event === 'selector' || event === 'route') {
      expect(within(panel()).queryByRole('log', { name: 'Conversation history' })).toBeNull();
      expect((input() as HTMLTextAreaElement).value).toBe('');
      fireEvent.click(within(panel()).getByRole('button', { name: 'Where am I?' }));
      await within(panel()).findByText(/Your last saved step was Review/);
      expect(mock.append).toHaveBeenCalledTimes(3);
      expect(mock.append.mock.calls[2][1]).toMatchObject({
        target: { source_version: event === 'selector' ? 5 : 4 },
      });
      expect(mock.append.mock.calls[2][1]).not.toHaveProperty('conversation_id');
    } else {
      expect(screen.queryByRole('button', { name: 'Where am I?' })).toBeNull();
    }
  },
);

it('maps only the authorized current action and returns mobile focus on Escape', async () => {
  vi.stubGlobal('innerWidth', 390);
  const saveControl = vi.fn();
  const page = { ...workspace, actions: ['save_files', 'publish'] as const };
  render(tree(page, <>
    <button data-explain-control="save_files" onClick={saveControl}>Save selection</button>
    <button data-explain-control="publish">Publish listing</button>
  </>));
  const entry = await screen.findByRole('button', { name: 'Where am I?' });
  entry.focus();
  fireEvent.click(entry);
  await within(panel()).findByText(/Your last saved step was Review/);
  expect(panel().getAttribute('aria-modal')).toBe('true');
  expect(within(panel()).queryByRole('button', { name: 'Go to Publish' })).toBeNull();
  await waitFor(() => expect(document.activeElement).toBe(input()));
  fireEvent.keyDown(input(), { key: 'Escape' });
  await waitFor(() => expect(document.activeElement).toBe(entry));
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(entry);
  fireEvent.click(await within(panel()).findByRole('button', { name: 'Go to Save selected files' }));
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Save selection' })));
  expect(saveControl).not.toHaveBeenCalled();
});

it('follows the real Save control through empty selection, folder resolution and enabled focus', async () => {
  const save = vi.fn();
  const savedSource = {
    version: 4, connection_current: true,
    content: { connection_id: guidedConnection.id, connection_version: guidedConnection.version, version_mode: 'current' as const, objects: guidedObjects },
  };
  render(tree({ ...workspace, actions: ['save_files'] },
    <WorkspaceData connections={[guidedConnection]} enabled savedSource={savedSource} onSaveSelection={save} />));
  const file = await screen.findByRole('checkbox', { name: 'Select weekly/sales.csv' });
  const folder = screen.getByRole('button', { name: 'Select entire connected folder' });
  fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
  const control = screen.getByRole<HTMLButtonElement>('button', { name: 'Save selected files' });
  expect(control.disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Where am I?' }));
  await within(panel()).findByText(/Your last saved step was Review/);
  const actionName = 'Go to Save selected files';
  expect(within(panel()).queryByRole('button', { name: actionName })).toBeNull();

  const extraFile = { ...guidedObjects[0], key: 'weekly/extra.csv' };
  let finish!: () => void;
  mock.objects.mockImplementationOnce(() => new Promise(resolve => {
    finish = () => resolve({ objects: [extraFile], next_cursor: null });
  }));
  fireEvent.click(folder);
  expect(control.disabled).toBe(true);
  expect(within(panel()).queryByRole('button', { name: actionName })).toBeNull();
  await act(async () => finish());
  const action = await within(panel()).findByRole('button', { name: actionName });

  // Exercise the click guard before the mutation observer can remove the action.
  fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
  expect(control.disabled).toBe(true);
  fireEvent.click(action);
  expect(input()).toBeTruthy();

  fireEvent.click(file);
  expect(screen.queryByRole('button', { name: 'Save selected files' })).toBeNull();
  mock.objects.mockResolvedValueOnce({ objects: [extraFile], next_cursor: null });
  fireEvent.click(folder);
  const current = await screen.findByRole<HTMLButtonElement>('button', { name: 'Save selected files' });
  await waitFor(() => expect(current.disabled).toBe(false));
  fireEvent.click(await within(panel()).findByRole('button', { name: actionName }));
  await waitFor(() => expect(document.activeElement).toBe(current));
  expect(save).not.toHaveBeenCalled();
  expect(screen.queryByRole('region', { name: 'Confirm file selection' })).toBeNull();
});

it('offers Publish only when the real control becomes ready and focuses it without publishing', async () => {
  let finish!: () => void;
  vi.spyOn(nativeClient, 'get').mockImplementationOnce(() => new Promise((_, reject) => {
    finish = () => reject({ isAxiosError: true, response: { status: 404, data: { detail: 'NOT_FOUND' } } });
  }));
  mock.append.mockImplementation((_admit, request: ExplainRequest) => {
    const answer = answerFixture(request);
    return Promise.resolve({ kind: 'answer', answer: { ...answer, facts: { availability: 'known', next_action: 'publish' } } });
  });
  const approval = { id: 'approval', review_hash: 'a', render_hash: 'b', draft_id: ids.draft } as ApprovalReceipt;
  render(tree({ scope: 'publish', targets: { publish: questions.publish }, actions: ['publish'] },
    <SellerPublication approval={approval} active rendered />));
  const control = await screen.findByRole<HTMLButtonElement>('button', { name: 'Publish this listing' });
  expect(control.disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: explainCopy().question('publish') }));
  await within(panel()).findByText(/listing is still a draft/);
  const name = explainCopy().action('publish');
  expect(within(panel()).queryByRole('button', { name })).toBeNull();
  await act(async () => finish());
  fireEvent.click(await within(panel()).findByRole('button', { name }));
  await waitFor(() => expect(document.activeElement).toBe(control));
  expect(mock.publishListing).not.toHaveBeenCalled();
});

it('leaves the answer open when the active publication control has a stale review', async () => {
  mock.publishListing.mockRejectedValueOnce({ isAxiosError: true, response: { status: 409 } });
  mock.append.mockImplementation((_admit, request: ExplainRequest) => {
    const answer = answerFixture(request);
    return Promise.resolve({ kind: 'answer', answer: { ...answer, facts: { availability: 'known', next_action: 'publish' } } });
  });
  const approval = { id: 'approval', review_hash: 'a', render_hash: 'b' } as ApprovalReceipt;
  render(tree({ scope: 'publish', targets: { publish: questions.publish }, actions: ['publish'] },
    <SellerPublication approval={approval} active rendered />));
  fireEvent.click(await screen.findByRole('button', { name: 'Publish this listing' }));
  await screen.findByText('Refresh the saved review and approve it again before publishing.');
  fireEvent.click(screen.getByRole('button', { name: explainCopy().question('publish') }));
  await within(panel()).findByText(/listing is still a draft/);
  expect(within(panel()).queryByRole('button', { name: explainCopy().action('publish') })).toBeNull();
  expect(input()).toBeTruthy();
  expect(mock.publishListing).toHaveBeenCalledOnce(); // The explicit Workspace click is the sole write.
});

it('focuses the mounted Workspace section button without changing sections', async () => {
  const navigate = vi.fn();
  render(tree({ scope: 'storage', targets: { storage: questions.storage }, actions: ['open_files'] },
    <WorkspaceOverview connections={[guidedConnection]} view="storage" onViewChange={navigate} />));
  fireEvent.click(screen.getByRole('button', { name: explainCopy().question('storage') }));
  fireEvent.click(await within(panel()).findByRole('button', { name: explainCopy().action('open_files') }));
  const control = within(screen.getByRole('navigation', { name: 'Workspace sections' })).getByRole('button', { name: 'Choose your files' });
  await waitFor(() => expect(document.activeElement).toBe(control));
  expect(navigate).not.toHaveBeenCalled();
});

it('leaves the ordinary panel entry available while the frontend switch is off', () => {
  vi.stubEnv('NEXT_PUBLIC_STAGE_A_EXPLAIN_ENABLED', 'false');
  render(tree(workspace));
  fireEvent.click(screen.getByRole('button', { name: 'Open assistant' }));
  expect(screen.queryByRole('button', { name: 'Explain' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Where am I?' })).toBeNull();
  expect(within(panel()).getByRole('textbox')).toBeTruthy();
  expect(mock.append).not.toHaveBeenCalled();
});


it('keeps a signed-out visitor on the existing anonymous guide when the frontend interface is enabled', () => {
  useAuthStore.setState({ user: null, token: null, isAuthenticated: false });
  render(tree(workspace));
  fireEvent.click(screen.getByRole('button', { name: 'Open assistant' }));
  expect(within(panel()).queryByRole('button', { name: 'Explain' })).toBeNull();
  expect(within(panel()).queryByRole('textbox', { name: 'Ask about this page' })).toBeNull();
  expect(within(panel()).getByRole('textbox')).toBeTruthy();
  expect(mock.append).not.toHaveBeenCalled();
});
