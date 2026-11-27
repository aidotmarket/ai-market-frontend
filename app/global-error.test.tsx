// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import DashboardLayout from './dashboard/layout';
import GlobalError from './global-error';
import { advanceAuthSessionOwner } from '@/lib/auth-session-owner';
import { checkSellerWorkspaceCrashDraft, clearRootSellerCrashAccess, getRootSellerCrashAccess } from '@/lib/seller-workspace-crash-access';
import { SellerListingDraftProvider, useSellerListingDraft } from '@/components/seller-workspace/SellerListingDraftStore';
import { useAuthStore } from '@/store/auth';

const { getCapabilities, logout, push, readListingDraft } = vi.hoisted(() => ({
  getCapabilities: vi.fn(),
  logout: vi.fn(async () => {}),
  push: vi.fn(),
  readListingDraft: vi.fn(),
}));
vi.mock('next/navigation', async importOriginal => ({
  ...await importOriginal<typeof import('next/navigation')>(),
  useRouter: () => ({ push }),
}));
vi.mock('@/api/capabilities', () => ({ getCapabilities }));
vi.mock('@/api/auth', () => ({ logout }));
vi.mock('@/api/sellerListingDraft', () => ({ readListingDraft }));
vi.mock('@/api/sellerGateways', () => ({ listSellerGateways: async () => [] }));
vi.mock('@/api/sellerWorkspace', () => ({
  getSellerWorkspaceCapabilities: async () => null,
  isAWSConnectionAvailable: () => false,
}));
vi.mock('@/components/onboarding/SellerSetupProgressBar', () => ({ default: () => null }));

const workspace = '/dashboard/seller-workspace';
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

async function observeActiveSeller(draftEnabled?: boolean) {
  signIn();
  const layout = (pathname: string, enabled = draftEnabled) => (
    <PathnameContext.Provider value={pathname}>
      <DashboardLayout><p>Workspace ready</p>
        {enabled !== undefined && <SellerListingDraftProvider enabled={enabled} sampleCapability={false}><DraftProbe /></SellerListingDraftProvider>}
      </DashboardLayout>
    </PathnameContext.Provider>
  );
  const dashboard = render(layout(workspace));
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

beforeEach(() => {
  window.history.replaceState(null, '', workspace);
  useAuthStore.setState({ user: null, token: null, isAuthenticated: false, hydrated: false,
    isLoading: false, pendingTwoFactor: null, hydrate: hydrate.mockClear() });
  getCapabilities.mockReset().mockResolvedValue(capability('active'));
  readListingDraft.mockReset().mockResolvedValue({ draft_id: draftUuid, version: 1, content: { title: 'synthetic private title' } });
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
  expect(fallback.container.querySelector('h1')?.textContent).toBe('Something went wrong in Seller Workspace');
  expect(fallback.container.querySelector('button')?.textContent).toBe('Reload page');
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
  const checkDraft = checkSellerWorkspaceCrashDraft();
  checkDraft(draftUuid);
  expect(getRootSellerCrashAccess(workspace)?.()?.draft?.uuid).toBe(draftUuid);
  checkDraft(replacementUuid, draftUuid);
  expect(getRootSellerCrashAccess(workspace)?.()?.draft).toBeUndefined();
  expect(readListingDraft).toHaveBeenCalledOnce();
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
  expect(fallback.container.querySelector('h2')?.textContent).toContain('Application error');
  expect(fallback.container.querySelector('button')).toBeNull();
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
    expect(fallback.container.querySelector('button')?.textContent).toBe('Reload page');
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

it('never starts a read for a raw seller role or reports an old fallback when proof appears', async () => {
  signIn('seller');
  const fallback = renderFallback();
  expect(fallback.container.querySelector('button')?.textContent).toBe('Reload page');
  expect(getCapabilities).not.toHaveBeenCalled();
  await observeActiveSeller();
  fallback.changeError();
  await Promise.resolve();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(hydrate).not.toHaveBeenCalled();
});
