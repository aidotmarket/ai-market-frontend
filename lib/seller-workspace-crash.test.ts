// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({
  token: 'test-token' as string | null,
  user: { role: 'seller', status: 'active' },
  isAuthenticated: true,
  hydrated: true,
  isLoading: false,
}));
vi.mock('@/store/auth', () => ({ useAuthStore: { getState: () => session } }));

const revision = 'a'.repeat(40);
const workspace = '/dashboard/seller-workspace';
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.resetModules();
  Object.assign(session, { token: 'test-token', isAuthenticated: true, hydrated: true, isLoading: false });
  session.user.role = 'seller';
  session.user.status = 'active';
  vi.stubEnv('FRONTEND_BUILD_REVISION', revision);
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.ai.market');
  vi.stubGlobal('fetch', fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 204 })));
  window.history.replaceState(null, '', workspace);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('sends only v1 fields and canonical classifications in a single isolated POST', async () => {
  const { reportSellerWorkspaceCrash } = await import('./seller-workspace-crash');
  window.history.replaceState(null, '', `${workspace}?value=query-fixture#fragment-fixture`);
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Synthetic Chrome/123.0 Edg/124.0 extra-fixture');
  const error = new Error('Minified React error #185; visit https://react.dev/errors/185?args[]=message-fixture');
  error.stack = 'at WorkspaceOverview (/private/never-read.tsx:1:1)';
  await reportSellerWorkspaceCrash('data', error, [
    '    at WorkspaceData (/synthetic/file-name.csv:1:1)',
    '    at WorkspacePanelSuffix (/ignore.tsx:1:1)',
    '    at Prefix.WorkspacePanel (/ignore.tsx:1:1)',
    'SavedWorkspaceData@https://example.invalid/private/path.js:2:1',
    '    at WorkspaceData (/duplicate.tsx:1:1)',
    '    at ObjectBrowser (/ignore.tsx:1:1)',
    '    at SavedLicenseStep (/ignore.tsx:1:1)',
    '    at SellerLicenseSelection (/ignore.tsx:1:1)',
    '    at SavedListingEditor (/ignore.tsx:1:1)',
    '    at SellerListingEditor (/ignore.tsx:1:1)',
    '    at GuidedListingFlow (/ignore.tsx:1:1)',
    '    at SellerWorkspacePage (/over-cap.tsx:1:1)',
  ].join('\n'));

  expect(fetchMock).toHaveBeenCalledOnce();
  const [target, request] = fetchMock.mock.calls[0];
  expect(target).toBe('https://api.ai.market/api/v1/seller-workspace/client-crash');
  expect(request).toEqual({
    method: 'POST', headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
    body: expect.any(String), credentials: 'omit', referrerPolicy: 'no-referrer',
    redirect: 'error', cache: 'no-store', signal: expect.any(AbortSignal),
  });
  expect(JSON.parse(request!.body as string)).toEqual({
    schema_version: 1, route: 'seller_workspace', step: 'data', error_name: 'Error',
    error_code: 'react_minified', react_code: 185, component_frames: [
      'WorkspaceData', 'SavedWorkspaceData', 'ObjectBrowser', 'SavedLicenseStep',
      'SellerLicenseSelection', 'SavedListingEditor', 'SellerListingEditor', 'GuidedListingFlow',
    ], build_revision: revision, browser_family: 'Edge', browser_major: 124,
  });
  expect(new TextEncoder().encode(request!.body as string).length).toBeLessThan(4096);
});

it.each([
  [new TypeError("Cannot read properties of undefined (reading 'synthetic')"), 'TypeError', 'missing_property'],
  [new TypeError('synthetic is not a function'), 'TypeError', 'not_callable'],
  [new ReferenceError('synthetic is not defined'), 'ReferenceError', 'not_defined'],
  [Object.assign(new Error('synthetic'), { name: 'ChunkLoadError' }), 'ChunkLoadError', 'chunk_load'],
  [{ name: 'TypeError\r\nsynthetic.txt', message: 'Minified React error #1000; synthetic\r\nfield: value' }, 'Other', 'unknown'],
  [new Error('Unexpected synthetic detail'), 'Error', 'unknown'],
])('reduces thrown values to closed fields (%#)', async (error, errorName, errorCode) => {
  const { reportSellerWorkspaceCrash } = await import('./seller-workspace-crash');
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Synthetic Chrome/1000.0');
  await reportSellerWorkspaceCrash('root', error);
  expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({
    schema_version: 1, route: 'seller_workspace', step: 'root', error_name: errorName,
    error_code: errorCode, react_code: null, component_frames: [], build_revision: revision,
    browser_family: 'Chrome', browser_major: null,
  });
});

it.each(['/', '/support/mailbox-account', '/confirm/synthetic', '/checkout/h/synthetic',
  `${workspace}/`, `${workspace}/synthetic`, '/dashboard/%73eller-workspace'])('is silent on %s', async path => {
  const { reportSellerWorkspaceCrash } = await import('./seller-workspace-crash');
  window.history.replaceState(null, '', path);
  await reportSellerWorkspaceCrash('listing', new Error());
  expect(fetchMock).not.toHaveBeenCalled();
});

it('requires an active in-memory seller, an exact revision and the first-party API configuration', async () => {
  const { reportSellerWorkspaceCrash } = await import('./seller-workspace-crash');
  const report = () => reportSellerWorkspaceCrash('data', new Error());
  session.hydrated = false;
  await report();
  session.hydrated = true;
  session.isAuthenticated = false;
  await report();
  session.isAuthenticated = true;
  session.token = null;
  await report();
  session.token = 'test-token';
  session.user.role = 'buyer';
  await report();
  session.user.role = 'seller';
  session.user.status = 'suspended';
  await report();
  session.user.status = 'active';
  vi.stubEnv('FRONTEND_BUILD_REVISION', `${revision}\n`);
  await report();
  vi.stubEnv('FRONTEND_BUILD_REVISION', revision.toUpperCase());
  await report();
  vi.stubEnv('FRONTEND_BUILD_REVISION', revision);
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://example.invalid');
  await report();
  expect(fetchMock).not.toHaveBeenCalled();
});

it('drops an event when the session owner, token or browser route changes before dispatch', async () => {
  const { reportSellerWorkspaceCrash } = await import('./seller-workspace-crash');
  const { advanceAuthSessionOwner: advance } = await import('@/lib/auth-session-owner');
  const report = () => reportSellerWorkspaceCrash('root', new Error());
  const ownerChanged = report();
  advance(false);
  await ownerChanged;
  const tokenChanged = report();
  session.token = 'replacement-token';
  await tokenChanged;
  const routeChanged = report();
  window.history.replaceState(null, '', '/support/mailbox-account');
  await routeChanged;
  expect(fetchMock).not.toHaveBeenCalled();
});

it.each([401, 429, 500])('discards HTTP %s without retry, refresh, auth changes or logging', async status => {
  const { reportSellerWorkspaceCrash } = await import('./seller-workspace-crash');
  const log = vi.spyOn(console, 'error');
  fetchMock.mockResolvedValueOnce(new Response(null, { status }));
  await reportSellerWorkspaceCrash('license', new Error());
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(session.token).toBe('test-token');
  expect(window.location.pathname).toBe(workspace);
  expect(log).not.toHaveBeenCalled();
});

it('isolates synchronous throws, rejections and hanging fetches within the shared page cap', async () => {
  const { reportSellerWorkspaceCrash } = await import('./seller-workspace-crash');
  vi.useFakeTimers();
  fetchMock.mockImplementationOnce(() => { throw new Error('synthetic throw'); });
  fetchMock.mockRejectedValueOnce(new Error('synthetic rejection'));
  fetchMock.mockImplementationOnce((_, request) => new Promise((_, reject) => {
    request?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }));

  const error = new Error();
  const reports = (['data', 'license', 'listing', 'root'] as const).map(step => reportSellerWorkspaceCrash(step, error));
  await Promise.resolve();
  expect(fetchMock).toHaveBeenCalledTimes(3);
  const hanging = fetchMock.mock.calls[2][1]!.signal;
  expect(hanging?.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(1500);
  await Promise.all(reports);
  expect(hanging?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
  await reportSellerWorkspaceCrash('root', error);
  expect(fetchMock).toHaveBeenCalledTimes(3);
});
