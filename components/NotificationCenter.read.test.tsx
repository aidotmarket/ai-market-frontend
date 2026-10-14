// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationItem } from '@/api/notifications';

const mocks = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn(), push: vi.fn(), open: vi.fn(), sendMessage: vi.fn() }));
vi.mock('@/api/client', () => ({ api: { get: mocks.get, patch: mocks.patch } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/components/allai/AllAIContext', () => ({ useAllAI: () => ({ open: mocks.open, sendMessage: mocks.sendMessage }) }));
import NotificationCenter from './NotificationCenter';

const notice: NotificationItem = {
  id: 'n/1', user_id: 'u-1', type: 'support_ticket_message', title: 'Ticket updated',
  body: 'Support replied', metadata: { public_ref: 'T-123' }, link_url: '/support/tickets/T-123',
  read_at: null, archived_at: null, created_at: '2026-10-14T10:00:00Z', updated_at: null,
};
let items: NotificationItem[];
let count: number;
let failing: string | undefined;
function bell() { return screen.getByRole('button', { name: /^Notifications/ }); }
async function open() {
  fireEvent.click(bell());
  await waitFor(() => expect(screen.queryByText('Loading notifications...')).toBeNull());
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
beforeEach(() => {
  vi.resetAllMocks();
  items = []; count = 0; failing = undefined;
  mocks.get.mockImplementation((url: string) => url === failing
    ? Promise.reject(new Error('offline'))
    : Promise.resolve({ data: url === '/notifications' ? { items, total: items.length } : { unread_count: count } }));
  mocks.patch.mockResolvedValue({ data: {} });
});
afterEach(cleanup);

describe('NotificationCenter customer reads', () => {
  it.each(['/notifications', '/notifications/unread-count'])('distinguishes initial %s failure from verified empty and retries both reads', async (url) => {
    failing = url;
    render(<NotificationCenter enabled />);
    await open();
    expect(screen.getByRole('alert').textContent).toContain('Notifications unavailable');
    expect(screen.queryByText('No notifications yet.')).toBeNull();
    expect(bell().getAttribute('aria-label')).toContain('unread count unavailable');
    expect((screen.getByRole('button', { name: 'Mark all read' }) as HTMLButtonElement).disabled).toBe(true);
    failing = undefined;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByText('No notifications yet.');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(mocks.get).toHaveBeenCalledWith('/notifications', { params: { limit: 20 } });
    expect(mocks.get).toHaveBeenCalledWith('/notifications/unread-count');
    expect(mocks.patch).not.toHaveBeenCalled();
  });

  it('reopening recovers from an initial failed read', async () => {
    failing = '/notifications';
    render(<NotificationCenter enabled />);
    await open();
    expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.click(bell());
    failing = undefined; items = [notice]; count = 1;
    await open();
    expect(screen.getByText(notice.title)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does not label a previously empty snapshot as currently verified empty on failure', async () => {
    render(<NotificationCenter enabled />);
    await open();
    fireEvent.click(bell());
    failing = '/notifications';
    await open();
    expect(screen.queryByText('No notifications yet.')).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('may be out of date');
  });

  it('renders verified empty and refreshes both reads on every open to find new notices', async () => {
    render(<NotificationCenter enabled />);
    await open();
    expect(screen.getByText('No notifications yet.')).toBeTruthy();
    const before = mocks.get.mock.calls.length;
    fireEvent.click(bell());
    items = [notice]; count = 1;
    await open();
    expect(screen.getByText(notice.title)).toBeTruthy();
    expect(mocks.get.mock.calls.length).toBe(before + 2);
    expect(bell().getAttribute('aria-label')).toBe('Notifications, 1 unread');
  });

  it.each(['/notifications', '/notifications/unread-count'])('retains known notices truthfully when refreshing %s fails', async (url) => {
    items = [notice]; count = 1;
    render(<NotificationCenter enabled />);
    await open();
    fireEvent.click(bell());
    failing = url;
    await open();
    expect(screen.getByText(notice.title)).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('may be out of date');
    expect(bell().getAttribute('aria-label')).toContain('unread count unavailable');
    failing = undefined;
    items = [{ ...notice, title: 'Fresh notice' }];
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByText('Fresh notice');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows loading during initial and retained-list refresh without claiming empty', async () => {
    const pending = deferred<{ data: { items: NotificationItem[] } }>();
    mocks.get.mockImplementation((url: string) => url === '/notifications' ? pending.promise : Promise.resolve({ data: { unread_count: 1 } }));
    render(<NotificationCenter enabled />);
    fireEvent.click(bell());
    expect(screen.getByRole('status').textContent).toContain('Loading notifications');
    expect(screen.queryByText('No notifications yet.')).toBeNull();
    await act(async () => pending.resolve({ data: { items: [notice] } }));
    fireEvent.click(bell());
    const refresh = deferred<{ data: { items: NotificationItem[] } }>();
    mocks.get.mockImplementation((url: string) => url === '/notifications' ? refresh.promise : Promise.resolve({ data: { unread_count: 1 } }));
    fireEvent.click(bell());
    expect(screen.getByRole('status').textContent).toContain('Loading notifications');
    expect(screen.getByText(notice.title)).toBeTruthy();
    await act(async () => refresh.resolve({ data: { items: [notice] } }));
  });

  it('ignores older reads that resolve after a newer panel open', async () => {
    const old = deferred<{ data: { items: NotificationItem[] } }>();
    mocks.get.mockImplementation((url: string) => url === '/notifications' ? old.promise : Promise.resolve({ data: { unread_count: 0 } }));
    render(<NotificationCenter enabled />);
    mocks.get.mockImplementation((url: string) => Promise.resolve({ data: url === '/notifications' ? { items: [notice] } : { unread_count: 1 } }));
    await open();
    await act(async () => old.resolve({ data: { items: [] } }));
    expect(screen.getByText(notice.title)).toBeTruthy();
    expect(bell().getAttribute('aria-label')).toBe('Notifications, 1 unread');
  });

  it('ignores an older failure after a newer successful read', async () => {
    const old = deferred<{ data: { items: NotificationItem[] } }>();
    mocks.get.mockImplementation((url: string) => url === '/notifications' ? old.promise : Promise.resolve({ data: { unread_count: 0 } }));
    render(<NotificationCenter enabled />);
    mocks.get.mockImplementation((url: string) => Promise.resolve({ data: url === '/notifications' ? { items: [notice] } : { unread_count: 1 } }));
    await open();
    await act(async () => old.reject(new Error('old read failed')));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText(notice.title)).toBeTruthy();
    expect(bell().getAttribute('aria-label')).toBe('Notifications, 1 unread');
  });

  it('prevents an in-flight refresh from undoing a later mark-read', async () => {
    items = [notice]; count = 1;
    render(<NotificationCenter enabled />);
    await open();
    fireEvent.click(bell());
    const old = deferred<{ data: { items: NotificationItem[] } }>();
    mocks.get.mockImplementation((url: string) => url === '/notifications' ? old.promise : Promise.resolve({ data: { unread_count: 1 } }));
    fireEvent.click(bell());
    fireEvent.click(screen.getByRole('button', { name: /Ticket updated/ }));
    await act(async () => old.resolve({ data: { items: [notice] } }));
    expect(bell().getAttribute('aria-label')).toBe('Notifications');
    expect(mocks.patch).toHaveBeenCalledWith('/notifications/n%2F1/read');
  });

  it('ignores reads from before the component was disabled', async () => {
    const old = deferred<{ data: { items: NotificationItem[] } }>();
    mocks.get.mockImplementation((url: string) => url === '/notifications' ? old.promise : Promise.resolve({ data: { unread_count: 0 } }));
    const view = render(<NotificationCenter enabled />);
    view.rerender(<NotificationCenter enabled={false} />);
    items = [notice]; count = 1;
    mocks.get.mockImplementation((url: string) => Promise.resolve({ data: url === '/notifications' ? { items } : { unread_count: count } }));
    view.rerender(<NotificationCenter enabled />);
    await open();
    await act(async () => old.resolve({ data: { items: [] } }));
    expect(screen.getByText(notice.title)).toBeTruthy();
  });

  it.each([
    [notice, 'allai'],
    [{ ...notice, type: 'license_terminated', link_url: '/dashboard/sales/o-1/license-record' }, 'route'],
    [{ ...notice, type: 'order_fulfilled', link_url: '/dashboard/orders/o-1' }, 'route'],
  ] as const)('preserves mark-read and routing for %s', async (notification, action) => {
    items = [notification]; count = 1;
    render(<NotificationCenter enabled />);
    await open();
    fireEvent.click(screen.getByRole('button', { name: /Ticket updated/ }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith('/notifications/n%2F1/read'));
    if (action === 'allai') {
      expect(mocks.open).toHaveBeenCalledOnce();
      expect(mocks.sendMessage).toHaveBeenCalledWith('status of ticket T-123');
      expect(mocks.push).not.toHaveBeenCalled();
    } else expect(mocks.push).toHaveBeenCalledWith(notification.link_url);
  });

  it('preserves mark-all-read endpoint and read indicators', async () => {
    items = [notice]; count = 1;
    render(<NotificationCenter enabled />);
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith('/notifications/read-all'));
    expect(screen.getByLabelText('Read notification')).toBeTruthy();
  });
});
