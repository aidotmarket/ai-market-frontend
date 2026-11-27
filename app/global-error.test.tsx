// @vitest-environment jsdom
import { StrictMode } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import GlobalError from './global-error';

const { usePathname, state } = vi.hoisted(() => ({
  usePathname: vi.fn<() => string | null>(),
  state: {
    token: 'test-token' as string | null, isAuthenticated: true, hydrated: true, isLoading: false,
    user: { role: 'seller', status: 'active' },
  },
}));
vi.mock('next/navigation', () => ({ usePathname }));
vi.mock('@/store/auth', () => ({ useAuthStore: { getState: () => state } }));

const workspace = '/dashboard/seller-workspace';
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  state.token = 'test-token';
  vi.stubEnv('FRONTEND_BUILD_REVISION', 'a'.repeat(40));
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.ai.market');
  vi.stubGlobal('fetch', fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 204 })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('reports one root event per mounted fallback, even under StrictMode and prop changes', async () => {
  window.history.replaceState(null, '', workspace);
  usePathname.mockReturnValue(workspace);
  const container = document.implementation.createHTMLDocument();
  const fallback = (error: Error) => <StrictMode><GlobalError error={error} /></StrictMode>;
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
  render(<GlobalError error={new Error('synthetic root failure')} />, { container });
  expect(container.querySelector('h2')?.textContent).toContain('Application error');
  expect(container.querySelector('button')).toBeNull();
  await Promise.resolve();
  expect(fetchMock).not.toHaveBeenCalled();
});

it('does not report a pre-auth root failure after a session appears', async () => {
  window.history.replaceState(null, '', workspace);
  usePathname.mockReturnValue(workspace);
  state.token = null;
  const container = document.implementation.createHTMLDocument();
  const { rerender } = render(<GlobalError error={new Error()} />, { container });
  state.token = 'test-token';
  rerender(<GlobalError error={new Error()} />);
  await Promise.resolve();
  expect(fetchMock).not.toHaveBeenCalled();
});
