// @vitest-environment jsdom
import '@/tests/support-network-trap';
import '@/tests/support-private-network-guard';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const ports = vi.hoisted(() => ({ path: '/support/mailbox-account' as string | null, list: vi.fn(), count: vi.fn(), hydrate: vi.fn(), history: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => ports.path, useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/api/notifications', () => ({ getNotifications: ports.list, getUnreadNotificationCount: ports.count, markAllNotificationsRead: vi.fn(), markNotificationRead: vi.fn() }));
import { SupportPrivateBoundary } from './SupportPrivateBoundary';
import { useAuthStore } from '@/store/auth';
import { principal } from '@/tests/support-fixtures';
beforeEach(() => {
  vi.clearAllMocks(); principal(); useAuthStore.setState({ hydrate: ports.hydrate });
  ports.list.mockResolvedValue({ items: [] }); ports.count.mockResolvedValue({ unread_count: 0 });
  ports.history.mockResolvedValue({ ok: true, json: async () => ({ messages: [] }) });
  vi.spyOn(Storage.prototype, 'getItem').mockReturnValue('retained-general-session');
  vi.stubGlobal('fetch', ports.history); // Explicit fake history port, never native fetch.
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it.each(['/support/mailbox-account', '/support/mailbox-account/', null])('never mounts actual normal providers/history/notifications/widgets on private or unresolved path %s', async path => {
  ports.path = path;
  render(<SupportPrivateBoundary><main>Private account confirmation</main></SupportPrivateBoundary>);
  await act(async () => {});
  expect(screen.getByText('Private account confirmation')).toBeTruthy();
  expect(document.querySelector('header')).toBeNull(); expect(document.querySelector('footer')).toBeNull();
  expect(document.getElementById('allai-launcher')).toBeNull(); expect(screen.queryByLabelText(/Notifications/)).toBeNull();
  expect(ports.hydrate).not.toHaveBeenCalled(); expect(Storage.prototype.getItem).not.toHaveBeenCalled();
  expect(ports.history).not.toHaveBeenCalled(); expect(ports.list).not.toHaveBeenCalled(); expect(ports.count).not.toHaveBeenCalled();
});
it.each(['/dashboard', '/support', '/requests/example', '/support/mailbox-account-other'])('retains actual normal tree, hydration, history, notifications and allAI on %s', async path => {
  ports.path = path;
  render(<SupportPrivateBoundary><main>Ordinary page</main></SupportPrivateBoundary>);
  await waitFor(() => expect(ports.list).toHaveBeenCalledOnce());
  expect(ports.hydrate).toHaveBeenCalledOnce(); expect(ports.count).toHaveBeenCalledOnce();
  expect(ports.history).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/\/api\/allai\/support\/anonymous\/session\/retained-general-session$/));
  expect(document.querySelector('header')).toBeTruthy(); expect(document.querySelector('footer')).toBeTruthy();
  const launcher = document.getElementById('allai-launcher'); expect(launcher).toBeTruthy();
  fireEvent.click(launcher!);
  expect(await screen.findByLabelText('Conversation history')).toBeTruthy();
  expect(screen.getByText('Ordinary page')).toBeTruthy();
});
