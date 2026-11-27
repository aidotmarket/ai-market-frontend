// @vitest-environment jsdom
import { StrictMode } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import GlobalError from './global-error';
import { SellerWorkspaceCrashAccess } from '@/lib/seller-workspace-crash';

const { usePathname, readAuth, hydrate } = vi.hoisted(() => ({
  usePathname: vi.fn<() => string | null>(),
  hydrate: vi.fn(),
  readAuth: vi.fn(() => ({
    token: 'test-token', isAuthenticated: true, hydrated: true, isLoading: false,
    user: { role: 'seller', status: 'active' },
  })),
}));
vi.mock('next/navigation', () => ({ usePathname }));
vi.mock('@/store/auth', () => ({ useAuthStore: { getState: () => ({ ...readAuth(), hydrate }) } }));

const workspace = '/dashboard/seller-workspace';
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  readAuth.mockClear();
  hydrate.mockClear();
  vi.stubEnv('FRONTEND_BUILD_REVISION', 'a'.repeat(40));
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.ai.market');
  vi.stubGlobal('fetch', fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 204 })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('reports once under StrictMode and prop changes when the fallback has seller proof', async () => {
  window.history.replaceState(null, '', workspace);
  usePathname.mockReturnValue(workspace);
  const container = document.implementation.createHTMLDocument();
  const getCrashToken = () => 'test-token';
  const fallback = (error: Error) => (
    <StrictMode>
      <SellerWorkspaceCrashAccess.Provider value={getCrashToken}>
        <GlobalError error={error} />
      </SellerWorkspaceCrashAccess.Provider>
    </StrictMode>
  );
  const { rerender } = render(fallback(new Error('synthetic root failure')), { container });
  expect(container.querySelector('h1')?.textContent).toBe('Something went wrong in Seller Workspace');
  expect(container.querySelector('button')?.textContent).toBe('Reload page');
  rerender(fallback(new Error('synthetic prop update')));
  await Promise.resolve();
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toMatchObject({
    route: 'seller_workspace', step: 'root', error_name: 'Error', error_code: 'unknown', component_frames: [],
  });
});

it.each([
  ['/support/mailbox-account', '/support/mailbox-account'],
  ['/confirm/synthetic', workspace],
  ['/dashboard/orders', '/dashboard/orders'],
  [workspace, '/dashboard/orders'],
  [workspace, null],
])('uses ordinary Next error presentation without reporting from %s with router path %s', async (browserPath, routerPath) => {
  window.history.replaceState(null, '', browserPath);
  usePathname.mockReturnValue(routerPath);
  const container = document.implementation.createHTMLDocument();
  render(
    <SellerWorkspaceCrashAccess.Provider value={() => 'test-token'}>
      <GlobalError error={new Error('synthetic root failure')} />
    </SellerWorkspaceCrashAccess.Provider>,
    { container },
  );
  expect(container.querySelector('h2')?.textContent).toContain('Application error');
  expect(container.querySelector('button')).toBeNull();
  await Promise.resolve();
  expect(fetchMock).not.toHaveBeenCalled();
});

it('keeps the root fallback usable and silent outside the capability provider even with a signed-in seller', async () => {
  window.history.replaceState(null, '', workspace);
  usePathname.mockReturnValue(workspace);
  const container = document.implementation.createHTMLDocument();
  render(<GlobalError error={new Error()} />, { container });
  await Promise.resolve();
  expect(container.querySelector('h1')?.textContent).toBe('Something went wrong in Seller Workspace');
  expect(fetchMock).not.toHaveBeenCalled();
  expect(readAuth).not.toHaveBeenCalled();
  expect(hydrate).not.toHaveBeenCalled();
});

it('does not report an unproven root failure after proof appears', async () => {
  window.history.replaceState(null, '', workspace);
  usePathname.mockReturnValue(workspace);
  const container = document.implementation.createHTMLDocument();
  const fallback = (token: string | null) => (
    <SellerWorkspaceCrashAccess.Provider value={token ? () => token : null}>
      <GlobalError error={new Error()} />
    </SellerWorkspaceCrashAccess.Provider>
  );
  const { rerender } = render(fallback(null), { container });
  rerender(fallback('test-token'));
  await Promise.resolve();
  expect(fetchMock).not.toHaveBeenCalled();
});
