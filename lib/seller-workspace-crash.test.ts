// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const revision = 'a'.repeat(40);
const workspace = '/dashboard/seller-workspace';
const draftUuid = '11111111-aaaa-4333-8444-555555555555';
const fetchMock = vi.fn<typeof fetch>();
const getCrashToken = vi.fn<import('./seller-workspace-crash').SellerWorkspaceCrashProof>();

beforeEach(() => {
  vi.resetModules();
  getCrashToken.mockReset().mockReturnValue({ token: 'test-token' });
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
  const error = Object.assign(
    new Error('Minified React error #185; visit https://react.dev/errors/185?args[]=message-fixture'),
    { draft_uuid: '11111111-2222-4333-8444-555555555555' },
  );
  error.stack = [
    'Error: synthetic private detail',
    '    at a (https://ai.market/_next/static/chunks/71-fe5c0a.js:1:2984)',
    '    at UnknownFrame (https://example.invalid/private/path.js:2:1)',
    '    at WorkspaceOverview (/private/never-read.tsx:1:1)',
  ].join('\n');
  await reportSellerWorkspaceCrash('WorkspaceData', error, getCrashToken);

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
    error_code: 'react_minified', react_code: 185, component_frames: ['WorkspacePanel', 'WorkspaceData'], build_revision: revision, browser_family: 'Edge', browser_major: 124,
  });
  expect(new TextEncoder().encode(request!.body as string).length).toBeLessThan(4096);
});

it('keeps untrusted frames out of root events without inspecting the stack', async () => {
  const { reportSellerWorkspaceCrash } = await import('./seller-workspace-crash');
  const readStack = vi.fn(() => '    at UnknownFrame (https://ai.market/_next/static/chunks/71-fe5c0a.js:1:2984)');
  const error = Object.defineProperty(new Error('synthetic'), 'stack', { get: readStack });
  await reportSellerWorkspaceCrash('root', error, getCrashToken);
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string).component_frames).toEqual([]);
  expect(readStack).not.toHaveBeenCalled();
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
  await reportSellerWorkspaceCrash('root', error, getCrashToken);
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
  await reportSellerWorkspaceCrash('SellerListingEditor', new Error(), getCrashToken);
  expect(fetchMock).not.toHaveBeenCalled();
});

it('requires active seller proof, an exact revision and the first-party API configuration', async () => {
  const { reportSellerWorkspaceCrash } = await import('./seller-workspace-crash');
  const report = () => reportSellerWorkspaceCrash('SavedWorkspaceData', new Error(), getCrashToken);
  await reportSellerWorkspaceCrash('root', new Error(), null);
  getCrashToken.mockReturnValue(null);
  await report();
  getCrashToken.mockReturnValue({ token: 'test-token' });
  vi.stubEnv('FRONTEND_BUILD_REVISION', `${revision}\n`);
  await report();
  vi.stubEnv('FRONTEND_BUILD_REVISION', revision.toUpperCase());
  await report();
  vi.stubEnv('FRONTEND_BUILD_REVISION', revision);
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://example.invalid');
  await report();
  expect(fetchMock).not.toHaveBeenCalled();
});

it('drops an event when proof, token or browser route changes before dispatch', async () => {
  const { reportSellerWorkspaceCrash } = await import('./seller-workspace-crash');
  const report = () => reportSellerWorkspaceCrash('root', new Error(), getCrashToken);
  const proofChanged = report();
  getCrashToken.mockReturnValue(null);
  await proofChanged;
  getCrashToken.mockReturnValue({ token: 'test-token' });
  const tokenChanged = report();
  getCrashToken.mockReturnValue({ token: 'replacement-token' });
  await tokenChanged;
  const routeChanged = report();
  window.history.replaceState(null, '', '/support/mailbox-account');
  await routeChanged;
  expect(fetchMock).not.toHaveBeenCalled();
});

it.each([null, { uuid: draftUuid }, { uuid: '99999999-aaaa-4333-8444-555555555555' }])(
  'omits a draft observation that changes before dispatch (%#)', async draft => {
    const { reportSellerWorkspaceCrash } = await import('./seller-workspace-crash');
    getCrashToken.mockReturnValue({ token: 'test-token', draft: { uuid: draftUuid } });
    const report = reportSellerWorkspaceCrash('SavedListingEditor', new Error(), getCrashToken);
    getCrashToken.mockReturnValue({ token: 'test-token', draft: draft ?? undefined });
    await report;
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).not.toHaveProperty('draft_uuid');
  },
);

it.each([draftUuid.toUpperCase(), `${draftUuid}\n`, draftUuid.replaceAll('-', ''), `{${draftUuid}}`])(
  'omits a noncanonical UUID (%#)', async uuid => {
    const { reportSellerWorkspaceCrash } = await import('./seller-workspace-crash');
    getCrashToken.mockReturnValue({ token: 'test-token', draft: { uuid } });
    await reportSellerWorkspaceCrash('root', new Error(), getCrashToken);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).not.toHaveProperty('draft_uuid');
  },
);

it.each([401, 429, 500])('discards HTTP %s without retry, refresh, auth changes or logging', async status => {
  const { reportSellerWorkspaceCrash } = await import('./seller-workspace-crash');
  const log = vi.spyOn(console, 'error');
  fetchMock.mockResolvedValueOnce(new Response(null, { status }));
  await reportSellerWorkspaceCrash('SavedLicenseStep', new Error(), getCrashToken);
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(getCrashToken).toHaveBeenCalledTimes(2);
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
  const reports = (['WorkspaceData', 'SavedLicenseStep', 'SavedListingEditor', 'root'] as const)
    .map(panel => reportSellerWorkspaceCrash(panel, error, getCrashToken));
  await Promise.resolve();
  expect(fetchMock).toHaveBeenCalledTimes(3);
  const hanging = fetchMock.mock.calls[2][1]!.signal;
  expect(hanging?.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(1500);
  await Promise.all(reports);
  expect(hanging?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
  await reportSellerWorkspaceCrash('root', error, getCrashToken);
  expect(fetchMock).toHaveBeenCalledTimes(3);
});
