// @vitest-environment jsdom
import { StrictMode, useState, type ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';

let DashboardLayout: typeof import('./dashboard/layout').default;
let GlobalError: typeof import('./global-error').default;
let advanceAuthSessionOwner: typeof import('@/lib/auth-session-owner').advanceAuthSessionOwner;
let clearRootSellerCrashAccess: typeof import('@/lib/seller-workspace-crash-access').clearRootSellerCrashAccess;
let getRootSellerCrashAccess: typeof import('@/lib/seller-workspace-crash-access').getRootSellerCrashAccess;
let SellerListingDraftProvider: typeof import('@/components/seller-workspace/SellerListingDraftStore').SellerListingDraftProvider;
let useSellerListingDraft: typeof import('@/components/seller-workspace/SellerListingDraftStore').useSellerListingDraft;
let WorkspacePanel: typeof import('@/components/seller-workspace/WorkspacePanel').WorkspacePanel;
let readListingSource: typeof import('@/api/sellerListingSource').readListingSource;
let useAuthStore: typeof import('@/store/auth').useAuthStore;

const { getCapabilities, getWorkspaceCapabilities, listGateways, logout, push, readListingDraft, sourceGet } = vi.hoisted(() => ({
  getCapabilities: vi.fn(),
  getWorkspaceCapabilities: vi.fn(async () => null),
  listGateways: vi.fn(async () => []),
  logout: vi.fn(async () => {}),
  push: vi.fn(),
  readListingDraft: vi.fn(),
  sourceGet: vi.fn(),
}));
vi.mock('next/navigation', async importOriginal => ({
  ...await importOriginal<typeof import('next/navigation')>(),
  useRouter: () => ({ push }),
}));
vi.mock('@/api/capabilities', () => ({ getCapabilities }));
vi.mock('@/api/auth', () => ({ logout }));
vi.mock('@/api/sellerListingDraft', () => ({ readListingDraft }));
vi.mock('@/api/client', () => ({ api: { get: sourceGet } }));
vi.mock('@/api/connector-seller-settings', () => ({ nativeWrite: vi.fn() }));
vi.mock('@/api/sellerGateways', () => ({ listSellerGateways: listGateways }));
vi.mock('@/api/sellerWorkspace', () => ({
  getSellerWorkspaceCapabilities: getWorkspaceCapabilities,
  isAWSConnectionAvailable: () => false,
}));
vi.mock('@/components/onboarding/SellerSetupProgressBar', () => ({ default: () => null }));

const workspace = '/dashboard/seller-workspace';
const sibling = '/dashboard/orders';
const privateRoute = '/support/mailbox-account';
const draftUuid = '11111111-aaaa-4333-8444-555555555555';
const replacementUuid = '99999999-aaaa-4333-8444-555555555555';
const fetchMock = vi.fn<typeof fetch>();
const hydrate = vi.fn();

function signIn(role: 'buyer' | 'seller' = 'buyer', id = 'synthetic-user') {
  useAuthStore.setState({
    user: { id, role, status: 'active' } as NonNullable<ReturnType<typeof useAuthStore.getState>['user']>,
    token: 'synthetic-token', isAuthenticated: true, hydrated: true, isLoading: false, pendingTwoFactor: null,
  });
}

function capability(status: string) {
  return { seller: { persisted_status: status, effective_status: status } };
}

function DraftProbe() {
  const { loaded, reload } = useSellerListingDraft();
  return <button type="button" disabled={!loaded} onClick={() => void reload()}>Read draft again</button>;
}

function BrokenPanel(): never { throw new Error('synthetic panel failure'); }

function CrashPanelProbe({ label }: { label: string }) {
  const [broken, setBroken] = useState(false);
  return <>
    <button type="button" onClick={() => setBroken(true)}>Crash {label}</button>
    <WorkspacePanel active showReloadOnError crashPanel="WorkspaceData">
      {broken ? <BrokenPanel /> : <p>{label} ready</p>}
    </WorkspacePanel>
  </>;
}

async function observeActiveSeller(draftEnabled?: boolean, panels?: ReactNode, initialPath = workspace) {
  signIn();
  window.history.replaceState(null, '', initialPath);
  const layout = (pathname: string, enabled = draftEnabled) => (
    <PathnameContext.Provider value={pathname}>
      <DashboardLayout><p>Workspace ready</p>
        {enabled !== undefined && <SellerListingDraftProvider enabled={enabled} sampleCapability={false}><DraftProbe /></SellerListingDraftProvider>}
        {panels}
      </DashboardLayout>
    </PathnameContext.Provider>
  );
  const dashboard = render(layout(initialPath), { onCaughtError: vi.fn() });
  await screen.findByText('Workspace ready');
  return {
    ...dashboard,
    setDraftEnabled: (enabled: boolean) => dashboard.rerender(layout(workspace, enabled)),
    navigate: (pathname: string) => {
      window.history.replaceState(null, '', pathname);
      dashboard.rerender(layout(pathname));
    },
  };
}

function renderFallback(pathname: string | null = workspace) {
  const container = document.implementation.createHTMLDocument();
  function fallback(error: Error) {
    return (
      <StrictMode>
        <PathnameContext.Provider value={pathname}>
          <GlobalError error={error} />
        </PathnameContext.Provider>
      </StrictMode>
    );
  }
  const view = render(fallback(new Error('synthetic root failure')), { container });
  return {
    ...view, container,
    changeError: () => view.rerender(fallback(new Error('synthetic prop update'))),
  };
}

function expectBuiltInFallback(container: Document) {
  expect(container.documentElement.id).toBe('__next_error__');
  expect(container.querySelector('h2')?.textContent).toContain('Application error: a client-side exception');
  expect(container.querySelector('button')).toBeNull();
}

async function crashBoth(label: string) {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: `Crash ${label}` })); });
  expect(screen.getAllByRole('alert').at(-1)?.textContent).toContain('Reload the page');
  const fallback = renderFallback();
  expectBuiltInFallback(fallback.container);
  await Promise.resolve();
  fallback.unmount();
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(settle => { resolve = settle; });
  return { promise, resolve };
}

beforeEach(async () => {
  // Each case represents a fresh page with its own three-report budget.
  vi.resetModules();
  ({ default: DashboardLayout } = await import('./dashboard/layout'));
  ({ default: GlobalError } = await import('./global-error'));
  ({ advanceAuthSessionOwner } = await import('@/lib/auth-session-owner'));
  ({ clearRootSellerCrashAccess, getRootSellerCrashAccess } = await import('@/lib/seller-workspace-crash-access'));
  ({ SellerListingDraftProvider, useSellerListingDraft } = await import('@/components/seller-workspace/SellerListingDraftStore'));
  ({ WorkspacePanel } = await import('@/components/seller-workspace/WorkspacePanel'));
  ({ readListingSource } = await import('@/api/sellerListingSource'));
  ({ useAuthStore } = await import('@/store/auth'));
  window.history.replaceState(null, '', workspace);
  useAuthStore.setState({ user: null, token: null, isAuthenticated: false, hydrated: false,
    isLoading: false, pendingTwoFactor: null, hydrate: hydrate.mockClear() });
  getCapabilities.mockReset().mockResolvedValue(capability('active'));
  getWorkspaceCapabilities.mockClear();
  listGateways.mockClear();
  readListingDraft.mockReset().mockResolvedValue({ draft_id: draftUuid, version: 1, content: { title: 'synthetic private title' } });
  sourceGet.mockReset();
  vi.stubEnv('FRONTEND_BUILD_REVISION', 'a'.repeat(40));
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.ai.market');
  vi.stubGlobal('fetch', fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 204 })));
});

afterEach(() => {
  cleanup();
  clearRootSellerCrashAccess();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('reports once after the established dashboard observation outlives its provider', async () => {
  const dashboard = await observeActiveSeller(true);
  await waitFor(() => expect(getRootSellerCrashAccess(workspace)?.()?.draft?.uuid).toBe(draftUuid));
  dashboard.unmount();
  const fallback = renderFallback();
  expectBuiltInFallback(fallback.container);
  fallback.changeError();
  await Promise.resolve();
  expect(fetchMock).toHaveBeenCalledOnce();
  const [target, request] = fetchMock.mock.calls[0];
  expect(target).toBe('https://api.ai.market/api/v1/seller-workspace/client-crash');
  expect(request?.headers).toMatchObject({ Authorization: 'Bearer synthetic-token' });
  expect(JSON.parse(request!.body as string)).toEqual({
    schema_version: 1, route: 'seller_workspace', step: 'root', error_name: 'Error',
    error_code: 'unknown', react_code: null, component_frames: [], build_revision: 'a'.repeat(40),
    browser_family: expect.any(String), browser_major: null, draft_uuid: draftUuid,
  });
  expect(getCapabilities).toHaveBeenCalledOnce();
  expect(readListingDraft).toHaveBeenCalledOnce();
  expect(hydrate).not.toHaveBeenCalled();
});

it('omits the previous UUID after active capability is re-established without a fresh draft read', async () => {
  const dashboard = await observeActiveSeller(true);
  await waitFor(() => expect(getRootSellerCrashAccess(workspace)?.()?.draft?.uuid).toBe(draftUuid));
  await act(async () => { window.dispatchEvent(new Event('capabilities:changed')); });
  expect(getRootSellerCrashAccess(workspace)?.()?.token).toBe('synthetic-token');
  dashboard.unmount();
  renderFallback();
  await Promise.resolve();
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).not.toHaveProperty('draft_uuid');
  expect(readListingDraft).toHaveBeenCalledOnce();
});

it('omits a draft while loading and does not use a URL ID or a response after provider teardown', async () => {
  let finish!: (draft: unknown) => void;
  readListingDraft.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const dashboard = await observeActiveSeller(true);
  await waitFor(() => expect(readListingDraft).toHaveBeenCalledOnce());
  dashboard.unmount();
  window.history.replaceState(null, '', `${workspace}?draft_uuid=${replacementUuid}`);
  finish({ draft_id: draftUuid, version: 1, content: {} });
  renderFallback();
  await Promise.resolve();
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).not.toHaveProperty('draft_uuid');
  expect(readListingDraft).toHaveBeenCalledOnce();
});

it('clears on reload, uses only the newly observed pointer, and clears when drafts are disabled', async () => {
  const dashboard = await observeActiveSeller(true);
  await waitFor(() => expect(getRootSellerCrashAccess(workspace)?.()?.draft?.uuid).toBe(draftUuid));
  let finish!: (draft: unknown) => void;
  readListingDraft.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  fireEvent.click(screen.getByRole('button', { name: 'Read draft again' }));
  expect(getRootSellerCrashAccess(workspace)?.()?.draft).toBeUndefined();
  await act(async () => { finish({ draft_id: replacementUuid, version: 1, content: {} }); });
  expect(getRootSellerCrashAccess(workspace)?.()?.draft?.uuid).toBe(replacementUuid);
  dashboard.setDraftEnabled(false);
  expect(getRootSellerCrashAccess(workspace)?.()?.draft).toBeUndefined();
  expect(readListingDraft).toHaveBeenCalledTimes(2);
});

it('discards a draft response from before active capability was re-established', async () => {
  let finish!: (draft: unknown) => void;
  readListingDraft.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  await observeActiveSeller(true);
  await waitFor(() => expect(readListingDraft).toHaveBeenCalledOnce());
  await act(async () => { window.dispatchEvent(new Event('capabilities:changed')); });
  await act(async () => { finish({ draft_id: draftUuid, version: 1, content: {} }); });
  expect(getRootSellerCrashAccess(workspace)?.()?.token).toBe('synthetic-token');
  expect(getRootSellerCrashAccess(workspace)?.()?.draft).toBeUndefined();
  expect(readListingDraft).toHaveBeenCalledOnce();
});

it('clears conflicting pointers from normal source observations without adopting the source ID', async () => {
  await observeActiveSeller(true);
  await waitFor(() => expect(getRootSellerCrashAccess(workspace)?.()?.draft?.uuid).toBe(draftUuid));
  sourceGet.mockResolvedValueOnce({ data: { source: null, current_draft_id: draftUuid } });
  await readListingSource(draftUuid);
  expect(getRootSellerCrashAccess(workspace)?.()?.draft?.uuid).toBe(draftUuid);
  sourceGet.mockResolvedValueOnce({ data: { source: null, current_draft_id: replacementUuid } });
  await readListingSource(draftUuid);
  expect(getRootSellerCrashAccess(workspace)?.()?.draft).toBeUndefined();
  expect(readListingDraft).toHaveBeenCalledOnce();
});

it.each(['source first', 'draft first'] as const)('omits an ambiguous draft UUID from both fallbacks when the %s response wins', async order => {
  const currentDraft = deferred<unknown>();
  const source = deferred<unknown>();
  readListingDraft.mockReturnValueOnce(currentDraft.promise);
  sourceGet.mockReturnValueOnce(source.promise);
  await observeActiveSeller(true, <><CrashPanelProbe label="ambiguous" /><CrashPanelProbe label="fresh" /></>);
  await waitFor(() => expect(readListingDraft).toHaveBeenCalledOnce());
  const sourceRead = readListingSource();
  expect(sourceGet).toHaveBeenCalledExactlyOnceWith('/seller-workspace/listing-source', undefined);

  const finishSource = () => source.resolve({ data: { source: null, current_draft_id: replacementUuid } });
  const finishDraft = () => currentDraft.resolve({ draft_id: draftUuid, version: 1, content: {} });
  await act(async () => { if (order === 'source first') finishSource(); else finishDraft(); });
  expect(getRootSellerCrashAccess(workspace)?.()?.draft).toBeUndefined();
  await act(async () => { if (order === 'source first') finishDraft(); else finishSource(); });
  await sourceRead;
  expect(getRootSellerCrashAccess(workspace)?.()?.draft).toBeUndefined();

  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Crash ambiguous' })); });
  expect(screen.getByRole('alert').textContent).toContain('Reload the page');
  const fallback = renderFallback();
  await Promise.resolve();
  expect(fetchMock.mock.calls.map(([, request]) => JSON.parse(request!.body as string))).toEqual([
    expect.objectContaining({ step: 'data' }), expect.objectContaining({ step: 'root' }),
  ]);
  for (const [, request] of fetchMock.mock.calls) {
    expect(JSON.parse(request!.body as string)).not.toHaveProperty('draft_uuid');
  }
  fallback.unmount();
  expect(getCapabilities).toHaveBeenCalledOnce();
  expect(readListingDraft).toHaveBeenCalledOnce();
  expect(sourceGet).toHaveBeenCalledOnce();

  readListingDraft.mockResolvedValueOnce({ draft_id: replacementUuid, version: 1, content: {} });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Read draft again' })); });
  expect(getRootSellerCrashAccess(workspace)?.()?.draft?.uuid).toBe(replacementUuid);
  if (order === 'source first') {
    renderFallback();
    await Promise.resolve();
  } else {
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Crash fresh' })); });
  }
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(JSON.parse(fetchMock.mock.calls[2][1]!.body as string)).toMatchObject({
    step: order === 'source first' ? 'root' : 'data', draft_uuid: replacementUuid,
  });
  expect(getCapabilities).toHaveBeenCalledOnce();
  expect(readListingDraft).toHaveBeenCalledTimes(2);
  expect(sourceGet).toHaveBeenCalledOnce();
});

it('withholds a new draft proof while a same-visit source read from the prior capability observation can contradict it', async () => {
  const source = deferred<unknown>();
  sourceGet.mockReturnValueOnce(source.promise);
  await observeActiveSeller(true, <CrashPanelProbe label="conflict" />);
  await waitFor(() => expect(getRootSellerCrashAccess(workspace)?.()?.draft?.uuid).toBe(draftUuid));
  const sourceRead = readListingSource();
  await act(async () => { window.dispatchEvent(new Event('capabilities:changed')); });
  expect(getRootSellerCrashAccess(workspace)?.()?.token).toBe('synthetic-token');
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Read draft again' })); });
  expect(readListingDraft).toHaveBeenCalledTimes(2);
  expect(getRootSellerCrashAccess(workspace)?.()?.draft).toBeUndefined();

  source.resolve({ data: { source: null, current_draft_id: replacementUuid } });
  await sourceRead;
  await crashBoth('conflict');
  expect(fetchMock.mock.calls.map(([, request]) => JSON.parse(request!.body as string).step)).toEqual(['data', 'root']);
  for (const [, request] of fetchMock.mock.calls) {
    expect(JSON.parse(request!.body as string)).not.toHaveProperty('draft_uuid');
  }
  expect(getCapabilities).toHaveBeenCalledTimes(2);
  expect(getWorkspaceCapabilities).toHaveBeenCalledTimes(2);
  expect(listGateways).toHaveBeenCalledTimes(2);
  expect(readListingDraft).toHaveBeenCalledTimes(2);
  expect(sourceGet).toHaveBeenCalledExactlyOnceWith('/seller-workspace/listing-source', undefined);

  readListingDraft.mockResolvedValueOnce({ draft_id: replacementUuid, version: 1, content: {} });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Read draft again' })); });
  const fallback = renderFallback();
  expectBuiltInFallback(fallback.container);
  await Promise.resolve();
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(JSON.parse(fetchMock.mock.calls[2][1]!.body as string)).toMatchObject({ step: 'root', draft_uuid: replacementUuid });
  expect(getCapabilities).toHaveBeenCalledTimes(2);
  expect(getWorkspaceCapabilities).toHaveBeenCalledTimes(2);
  expect(listGateways).toHaveBeenCalledTimes(2);
  expect(readListingDraft).toHaveBeenCalledTimes(3);
  expect(sourceGet).toHaveBeenCalledOnce();
});

const sourceReadTimings = (['before', 'during', 'after'] as const).flatMap(start =>
  (['draft first', 'source first'] as const).flatMap(order =>
    (['conflicting', 'matching'] as const).map(pointer => ({ start, order, pointer })),
  ),
);

it.each(sourceReadTimings)(
  'tracks a $pointer source read starting $start capability replacement with $order completion',
  async ({ start, order, pointer }) => {
    const refresh = deferred<ReturnType<typeof capability>>();
    const draft = deferred<unknown>();
    const source = deferred<unknown>();
    await observeActiveSeller(true, <CrashPanelProbe label="after the source read" />);
    await waitFor(() => expect(getRootSellerCrashAccess(workspace)?.()?.draft?.uuid).toBe(draftUuid));
    const mounted = screen.getByText('Workspace ready');
    sourceGet.mockReturnValueOnce(source.promise);
    const sourceId = pointer === 'matching' ? draftUuid : replacementUuid;
    const startSource = () => start === 'during' ? readListingSource() : readListingSource(draftUuid);
    let sourceRead = start === 'before' ? startSource() : undefined;

    getCapabilities.mockReturnValueOnce(refresh.promise);
    act(() => window.dispatchEvent(new Event('capabilities:changed')));
    expect(getRootSellerCrashAccess(workspace)).toBeNull();
    if (start === 'during') sourceRead = startSource();
    await act(async () => { refresh.resolve(capability('active')); });
    expect(screen.getByText('Workspace ready')).toBe(mounted);
    expect(getRootSellerCrashAccess(workspace)?.()?.token).toBe('synthetic-token');
    if (start === 'after') sourceRead = startSource();

    readListingDraft.mockReturnValueOnce(draft.promise);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Read draft again' })); });
    const finishDraft = () => act(async () => { draft.resolve({ draft_id: draftUuid, version: 1, content: {} }); });
    const finishSource = async () => {
      source.resolve({ data: { source: null, current_draft_id: sourceId } });
      await sourceRead;
    };
    const finish = order === 'draft first' ? [finishDraft, finishSource] : [finishSource, finishDraft];
    await finish[0]();
    const intermediateDraft = getRootSellerCrashAccess(workspace)?.()?.draft;
    await finish[1]();

    await crashBoth('after the source read');
    const reports = fetchMock.mock.calls.map(([, request]) => JSON.parse(request!.body as string));
    const expectedDraft = pointer === 'matching' && order === 'draft first' ? draftUuid : undefined;
    expect(reports.map(report => [report.step, report.draft_uuid])).toEqual([
      ['data', expectedDraft], ['root', expectedDraft],
    ]);
    if (!expectedDraft) for (const report of reports) expect(report).not.toHaveProperty('draft_uuid');
    expect(intermediateDraft).toBeUndefined();

    readListingDraft.mockResolvedValueOnce({ draft_id: sourceId, version: 1, content: {} });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Read draft again' })); });
    renderFallback();
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetchMock.mock.calls[2][1]!.body as string)).toMatchObject({ step: 'root', draft_uuid: sourceId });
    expect(getCapabilities).toHaveBeenCalledTimes(2);
    expect(getWorkspaceCapabilities).toHaveBeenCalledTimes(2);
    expect(listGateways).toHaveBeenCalledTimes(2);
    expect(readListingDraft).toHaveBeenCalledTimes(3);
    expect(sourceGet).toHaveBeenCalledExactlyOnceWith('/seller-workspace/listing-source',
      start === 'during' ? undefined : { params: { draft_id: draftUuid } });
    expect(hydrate).not.toHaveBeenCalled();
  },
);

it('gates both fallbacks on active capability and omits the UUID while a source read started during refresh is pending', async () => {
  const refresh = deferred<ReturnType<typeof capability>>();
  const source = deferred<unknown>();
  await observeActiveSeller(true, <><CrashPanelProbe label="during refresh" /><CrashPanelProbe label="during source read" /></>);
  await waitFor(() => expect(getRootSellerCrashAccess(workspace)?.()?.draft?.uuid).toBe(draftUuid));
  getCapabilities.mockReturnValueOnce(refresh.promise);
  act(() => window.dispatchEvent(new Event('capabilities:changed')));
  sourceGet.mockReturnValueOnce(source.promise);
  const sourceRead = readListingSource();
  await crashBoth('during refresh');
  expect(fetchMock).not.toHaveBeenCalled();

  await act(async () => { refresh.resolve(capability('active')); });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Read draft again' })); });
  await crashBoth('during source read');
  const reports = fetchMock.mock.calls.map(([, request]) => JSON.parse(request!.body as string));
  expect(reports.map(report => [report.step, report.draft_uuid])).toEqual([['data', undefined], ['root', undefined]]);
  for (const report of reports) expect(report).not.toHaveProperty('draft_uuid');

  source.resolve({ data: { source: null, current_draft_id: draftUuid } });
  await sourceRead;
  expect(getRootSellerCrashAccess(workspace)?.()?.draft?.uuid).toBe(draftUuid);
  expect(getCapabilities).toHaveBeenCalledTimes(2);
  expect(readListingDraft).toHaveBeenCalledTimes(2);
  expect(sourceGet).toHaveBeenCalledOnce();
});

it('lets a later current-draft read establish proof after a source read finishes during capability refresh', async () => {
  const refresh = deferred<ReturnType<typeof capability>>();
  await observeActiveSeller(true, <CrashPanelProbe label="after refresh" />);
  await waitFor(() => expect(getRootSellerCrashAccess(workspace)?.()?.draft?.uuid).toBe(draftUuid));
  getCapabilities.mockReturnValueOnce(refresh.promise);
  act(() => window.dispatchEvent(new Event('capabilities:changed')));
  sourceGet.mockResolvedValueOnce({ data: { source: null, current_draft_id: replacementUuid } });
  await readListingSource();
  expect(getRootSellerCrashAccess(workspace)).toBeNull();

  await act(async () => { refresh.resolve(capability('active')); });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Read draft again' })); });
  await crashBoth('after refresh');
  expect(fetchMock.mock.calls.map(([, request]) => JSON.parse(request!.body as string))).toEqual([
    expect.objectContaining({ step: 'data', draft_uuid: draftUuid }),
    expect.objectContaining({ step: 'root', draft_uuid: draftUuid }),
  ]);
  expect(getCapabilities).toHaveBeenCalledTimes(2);
  expect(readListingDraft).toHaveBeenCalledTimes(2);
  expect(sourceGet).toHaveBeenCalledOnce();
});

it.each([
  ['route exit', 'before refresh'],
  ['account replacement', 'before refresh'],
  ['route exit', 'during refresh'],
  ['account replacement', 'during refresh'],
  ['credential gap', 'during refresh'],
  ['dashboard replacement', 'during refresh'],
] as const)('discards a pending source observation across %s after it starts %s', async (change, start) => {
  const refresh = deferred<ReturnType<typeof capability>>();
  const source = deferred<unknown>();
  sourceGet.mockReturnValueOnce(source.promise);
  const dashboard = await observeActiveSeller(true, <CrashPanelProbe label="new visit" />);
  await waitFor(() => expect(getRootSellerCrashAccess(workspace)?.()?.draft?.uuid).toBe(draftUuid));
  let sourceRead = start === 'before refresh' ? readListingSource() : undefined;
  getCapabilities.mockReturnValueOnce(refresh.promise);
  act(() => window.dispatchEvent(new Event('capabilities:changed')));
  sourceRead ??= readListingSource();
  if (change === 'route exit') {
    dashboard.navigate(sibling);
    dashboard.navigate(workspace);
  } else if (change === 'account replacement') {
    await act(async () => {
      advanceAuthSessionOwner(false);
      signIn('seller', 'replacement-owner');
    });
  } else if (change === 'credential gap') {
    act(() => {
      useAuthStore.setState({ token: null });
      useAuthStore.setState({ token: 'synthetic-token' });
    });
    await act(async () => { window.dispatchEvent(new Event('capabilities:changed')); });
  } else {
    dashboard.unmount();
    await observeActiveSeller(true, <CrashPanelProbe label="new visit" />);
  }
  await act(async () => { refresh.resolve(capability('active')); });
  await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Read draft again' }).disabled).toBe(false));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Read draft again' })); });
  expect(getRootSellerCrashAccess(workspace)?.()?.draft?.uuid).toBe(draftUuid);
  source.resolve({ data: { source: null, current_draft_id: replacementUuid } });
  await sourceRead;
  await crashBoth('new visit');

  expect(fetchMock.mock.calls.map(([, request]) => JSON.parse(request!.body as string))).toEqual([
    expect.objectContaining({ step: 'data', draft_uuid: draftUuid }),
    expect.objectContaining({ step: 'root', draft_uuid: draftUuid }),
  ]);
  const capabilityReads = change === 'route exit' ? 2 : 3;
  expect(getCapabilities).toHaveBeenCalledTimes(capabilityReads);
  expect(getWorkspaceCapabilities).toHaveBeenCalledTimes(2);
  expect(listGateways).toHaveBeenCalledTimes(2);
  expect(readListingDraft).toHaveBeenCalledTimes(change === 'route exit' || change === 'credential gap' ? 2 : 3);
  expect(sourceGet).toHaveBeenCalledOnce();
});

it('keeps mounted panels and the root silent after a batched token clear and restore until active capability is observed again', async () => {
  await observeActiveSeller(undefined, <>
    <CrashPanelProbe label="revoked" /><CrashPanelProbe label="pending" /><CrashPanelProbe label="revalidated" />
  </>);
  const stillMounted = screen.getByText('revalidated ready');
  expect(getRootSellerCrashAccess(workspace)?.()?.token).toBe('synthetic-token');
  act(() => {
    useAuthStore.setState({ token: null });
    useAuthStore.setState({ token: 'synthetic-token' });
    fireEvent.click(screen.getByRole('button', { name: 'Crash revoked' }));
  });
  expect(screen.getByRole('alert').textContent).toContain('Reload the page');
  const revoked = renderFallback();
  await Promise.resolve();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(getCapabilities).toHaveBeenCalledOnce();
  revoked.unmount();

  const revalidation = deferred<ReturnType<typeof capability>>();
  getCapabilities.mockReturnValueOnce(revalidation.promise);
  act(() => window.dispatchEvent(new Event('capabilities:changed')));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Crash pending' })); });
  const pending = renderFallback();
  await Promise.resolve();
  expect(screen.getAllByRole('alert')).toHaveLength(2);
  expect(fetchMock).not.toHaveBeenCalled();
  pending.unmount();

  await act(async () => { revalidation.resolve(capability('active')); });
  expect(screen.getByText('revalidated ready')).toBe(stillMounted);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Crash revalidated' })); });
  renderFallback();
  await Promise.resolve();
  expect(fetchMock.mock.calls.map(([, request]) => ({
    step: JSON.parse(request!.body as string).step, headers: request?.headers,
  }))).toEqual(['data', 'root'].map(step => ({
    step, headers: expect.objectContaining({ Authorization: 'Bearer synthetic-token' }),
  })));
  expect(getCapabilities).toHaveBeenCalledTimes(2);
  expect(readListingDraft).not.toHaveBeenCalled();
  expect(sourceGet).not.toHaveBeenCalled();
});

it.each([
  ['FRONTEND_BUILD_REVISION', undefined],
  ['FRONTEND_BUILD_REVISION', 'invalid-build-revision'],
  ['NEXT_PUBLIC_API_URL', undefined],
  ['NEXT_PUBLIC_API_URL', 'https://invalid.example'],
] as const)('renders the built-in root fallback and sends zero posts with %s set to %s', async (name, value) => {
  vi.stubEnv(name, value);
  await observeActiveSeller(undefined, <CrashPanelProbe label="unconfigured" />);
  expect(getRootSellerCrashAccess(workspace)?.()?.token).toBe('synthetic-token');
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Crash unconfigured' })); });
  expect(screen.getByRole('alert').textContent).toContain('Reload the page');
  const fallback = renderFallback();
  expectBuiltInFallback(fallback.container);
  await Promise.resolve();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(getCapabilities).toHaveBeenCalledOnce();
  expect(readListingDraft).not.toHaveBeenCalled();
  expect(sourceGet).not.toHaveBeenCalled();
});

it.each([
  [privateRoute, privateRoute],
  ['/confirm/synthetic', workspace],
  ['/dashboard/orders', '/dashboard/orders'],
  [workspace, '/dashboard/orders'],
  [workspace, null],
])('discards the established proof on %s with router path %s', async (browserPath, routerPath) => {
  (await observeActiveSeller()).unmount();
  window.history.replaceState(null, '', browserPath);
  const fallback = renderFallback(routerPath);
  expectBuiltInFallback(fallback.container);
  fallback.unmount();
  window.history.replaceState(null, '', workspace);
  renderFallback();
  await Promise.resolve();
  expect(fetchMock).not.toHaveBeenCalled();
});

it.each(['logout', 'account', 'generation', 'token', 'pre-auth', 'capability'] as const)(
  'stays silent when %s invalidates an established observation after dashboard teardown', async change => {
    const dashboard = await observeActiveSeller(true);
    await waitFor(() => expect(getRootSellerCrashAccess(workspace)?.()?.draft?.uuid).toBe(draftUuid));
    dashboard.unmount();
    if (change === 'logout') await useAuthStore.getState().logout();
    if (change === 'account') signIn('buyer', 'other-synthetic-user');
    if (change === 'generation') advanceAuthSessionOwner(false);
    if (change === 'token') useAuthStore.setState({ token: null });
    if (change === 'pre-auth') useAuthStore.setState({ pendingTwoFactor: { preAuthToken: 'synthetic-challenge', expiresAt: 0 } });
    if (change === 'capability') window.dispatchEvent(new Event('capabilities:changed'));
    signIn();
    const fallback = renderFallback();
    expectBuiltInFallback(fallback.container);
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getCapabilities).toHaveBeenCalledOnce();
    expect(hydrate).not.toHaveBeenCalled();
  },
);

it.each(['pending', 'provisioning', 'suspended'] as const)(
  'stays silent during capability revalidation (%s)', async status => {
    const dashboard = await observeActiveSeller();
    if (status === 'pending') getCapabilities.mockReturnValueOnce(new Promise(() => {}));
    else getCapabilities.mockResolvedValueOnce(capability(status));
    await act(async () => { window.dispatchEvent(new Event('capabilities:changed')); });
    dashboard.unmount();
    renderFallback();
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getCapabilities).toHaveBeenCalledTimes(2);
  },
);

it('does not reattach a revoked observation when the same dashboard returns to Workspace', async () => {
  const dashboard = await observeActiveSeller();
  act(() => {
    useAuthStore.setState({ token: null });
    useAuthStore.setState({ token: 'synthetic-token' });
  });
  dashboard.navigate('/dashboard/orders');
  dashboard.navigate(workspace);
  dashboard.unmount();
  renderFallback();
  await Promise.resolve();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(getCapabilities).toHaveBeenCalledOnce();
});

it.each(['while away', 'in the batch returning to Workspace'] as const)(
  'revokes a retained snapshot after the same token is cleared and restored %s', async timing => {
    const dashboard = await observeActiveSeller(true, <>
      <CrashPanelProbe label="retained" /><CrashPanelProbe label="revalidating" /><CrashPanelProbe label="current" />
    </>);
    await waitFor(() => expect(getRootSellerCrashAccess(workspace)?.()?.draft?.uuid).toBe(draftUuid));
    dashboard.navigate(sibling);
    act(() => {
      useAuthStore.setState({ token: null });
      useAuthStore.setState({ token: 'synthetic-token' });
      if (timing === 'in the batch returning to Workspace') dashboard.navigate(workspace);
    });
    if (timing === 'while away') dashboard.navigate(workspace);

    await crashBoth('retained');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getCapabilities).toHaveBeenCalledOnce();

    dashboard.navigate(sibling);
    const refresh = deferred<ReturnType<typeof capability>>();
    getCapabilities.mockReturnValueOnce(refresh.promise);
    act(() => window.dispatchEvent(new Event('capabilities:changed')));
    dashboard.navigate(workspace);
    await crashBoth('revalidating');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getCapabilities).toHaveBeenCalledTimes(2);
    expect(getWorkspaceCapabilities).toHaveBeenCalledOnce();
    expect(listGateways).toHaveBeenCalledOnce();

    await act(async () => { refresh.resolve(capability('active')); });
    await crashBoth('current');
    expect(fetchMock.mock.calls.map(([, request]) => JSON.parse(request!.body as string).step)).toEqual(['data', 'root']);
    for (const [, request] of fetchMock.mock.calls) {
      expect(request?.headers).toMatchObject({ Authorization: 'Bearer synthetic-token' });
      expect(JSON.parse(request!.body as string)).not.toHaveProperty('draft_uuid');
    }
    expect(getCapabilities).toHaveBeenCalledTimes(2);
    expect(getWorkspaceCapabilities).toHaveBeenCalledTimes(2);
    expect(listGateways).toHaveBeenCalledTimes(2);
    expect(readListingDraft).toHaveBeenCalledOnce();
    expect(sourceGet).not.toHaveBeenCalled();
    expect(hydrate).not.toHaveBeenCalled();
  },
);

it('reuses an uninterrupted active session on route return with its draft proof cleared', async () => {
  const dashboard = await observeActiveSeller(true, <CrashPanelProbe label="returned" />);
  await waitFor(() => expect(getRootSellerCrashAccess(workspace)?.()?.draft?.uuid).toBe(draftUuid));
  dashboard.navigate(sibling);
  dashboard.navigate(workspace);
  await crashBoth('returned');

  expect(fetchMock.mock.calls.map(([, request]) => JSON.parse(request!.body as string).step)).toEqual(['data', 'root']);
  for (const [, request] of fetchMock.mock.calls) {
    expect(JSON.parse(request!.body as string)).not.toHaveProperty('draft_uuid');
  }
  expect(getCapabilities).toHaveBeenCalledOnce();
  expect(getWorkspaceCapabilities).toHaveBeenCalledOnce();
  expect(listGateways).toHaveBeenCalledOnce();
  expect(readListingDraft).toHaveBeenCalledOnce();
  expect(sourceGet).not.toHaveBeenCalled();
});

it('rejects a capability response issued before a credential gap while away', async () => {
  const issued = deferred<ReturnType<typeof capability>>();
  getCapabilities.mockReturnValueOnce(issued.promise);
  const dashboard = await observeActiveSeller(undefined, <CrashPanelProbe label="stale" />, sibling);
  expect(getCapabilities).toHaveBeenCalledOnce();
  act(() => {
    useAuthStore.setState({ token: null });
    useAuthStore.setState({ token: 'synthetic-token' });
  });
  await act(async () => { issued.resolve(capability('active')); });
  dashboard.navigate(workspace);
  await crashBoth('stale');

  expect(fetchMock).not.toHaveBeenCalled();
  expect(getCapabilities).toHaveBeenCalledOnce();
  expect(getWorkspaceCapabilities).toHaveBeenCalledOnce();
  expect(listGateways).toHaveBeenCalledOnce();
  expect(readListingDraft).not.toHaveBeenCalled();
  expect(sourceGet).not.toHaveBeenCalled();
});

it.each(['logout', 'account replacement'] as const)('keeps both fallbacks silent on return during %s', async change => {
  const dashboard = await observeActiveSeller(undefined, <CrashPanelProbe label="previous owner" />);
  expect(getRootSellerCrashAccess(workspace)?.()?.token).toBe('synthetic-token');
  dashboard.navigate(sibling);
  const refresh = deferred<ReturnType<typeof capability>>();
  getCapabilities.mockReturnValueOnce(refresh.promise);
  await act(async () => {
    if (change === 'logout') await useAuthStore.getState().logout();
    else signIn('buyer', 'replacement-owner');
  });
  dashboard.navigate(workspace);
  expect(screen.queryByRole('button', { name: 'Crash previous owner' })).toBeNull();
  const fallback = renderFallback();
  expectBuiltInFallback(fallback.container);
  await Promise.resolve();

  expect(fetchMock).not.toHaveBeenCalled();
  expect(getCapabilities).toHaveBeenCalledTimes(change === 'logout' ? 1 : 2);
  expect(getWorkspaceCapabilities).toHaveBeenCalledOnce();
  expect(listGateways).toHaveBeenCalledOnce();
  expect(readListingDraft).not.toHaveBeenCalled();
  expect(sourceGet).not.toHaveBeenCalled();
});

it('never starts a read for a raw seller role or reports an old fallback when proof appears', async () => {
  signIn('seller');
  const fallback = renderFallback();
  expectBuiltInFallback(fallback.container);
  expect(getCapabilities).not.toHaveBeenCalled();
  await observeActiveSeller();
  fallback.changeError();
  await Promise.resolve();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(hydrate).not.toHaveBeenCalled();
});
