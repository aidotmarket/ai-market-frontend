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
  mocks.patch.mockImplementation((url: string) => {
    const all = url === '/notifications/read-all';
    const newlyRead = items.filter(item => !item.read_at && (all || url === `/notifications/${encodeURIComponent(item.id)}/read`));
    items = items.map(item => newlyRead.includes(item) ? { ...item, read_at: '2026-10-22T10:01:00Z' } : item);
    count = all ? 0 : Math.max(0, count - newlyRead.length);
    return Promise.resolve({ data: {} });
  });
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
    const write = deferred<{ data: object }>();
    mocks.patch.mockReturnValue(write.promise);
    mocks.get.mockImplementation((url: string) => url === '/notifications' ? old.promise : Promise.resolve({ data: { unread_count: 1 } }));
    fireEvent.click(bell());
    fireEvent.click(screen.getByRole('button', { name: /Ticket updated/ }));
    await act(async () => old.resolve({ data: { items: [notice] } }));
    expect(bell().getAttribute('aria-label')).toBe('Notifications');
    expect(mocks.patch).toHaveBeenCalledWith('/notifications/n%2F1/read');
    mocks.get.mockImplementation((url: string) => Promise.resolve({ data: url === '/notifications' ? { items: [{ ...notice, read_at: 'saved' }] } : { unread_count: 0 } }));
    await act(async () => write.resolve({ data: {} }));
    expect(bell().getAttribute('aria-label')).toBe('Notifications');
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

  it.each(['one', 'all'])('reconciles a failed %s save after an intervening successful read', async kind => {
    items = [notice]; count = 7; // Count includes unread records outside the displayed page.
    const write = deferred<{ data: object }>();
    mocks.patch.mockReturnValue(write.promise);
    render(<NotificationCenter enabled />);
    await open();
    fireEvent.click(screen.getByRole('button', { name: kind === 'all' ? 'Mark all read' : /Ticket updated/ }));
    if (kind === 'all') fireEvent.click(bell());
    await open();
    const before = mocks.get.mock.calls.length;
    await act(async () => write.reject(new Error('save failed')));
    expect(mocks.get.mock.calls.length).toBe(before + 2);
    expect(bell().getAttribute('aria-label')).toBe('Notifications, 7 unread');
    expect(screen.getByLabelText('Unread notification')).toBeTruthy();
  });

  it.each(['success', 'failure'])('waits for overlapping single/all saves when the single save ends in %s', async outcome => {
    items = [notice, { ...notice, id: 'n-2', title: 'Second notice' }]; count = 9;
    const single = deferred<{ data: object }>();
    const all = deferred<{ data: object }>();
    mocks.patch.mockImplementation((url: string) => url === '/notifications/read-all' ? all.promise : single.promise);
    render(<NotificationCenter enabled />);
    await open();
    fireEvent.click(screen.getByRole('button', { name: /Ticket updated/ }));
    await open(); // Successful pre-save read restores the unread records.
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    const before = mocks.get.mock.calls.length;
    items = items.map(item => ({ ...item, read_at: 'saved' })); count = 0;
    await act(async () => all.resolve({ data: {} })); // Later-started save finishes first.
    expect(mocks.get.mock.calls.length).toBe(before);
    fireEvent.click(bell());
    await open(); // Newer read must not suppress reconciliation of the remaining save.
    const afterOpen = mocks.get.mock.calls.length;
    await act(async () => outcome === 'success' ? single.resolve({ data: {} }) : single.reject(new Error('save failed')));
    expect(mocks.get.mock.calls.length).toBe(afterOpen + 2);
    expect(bell().getAttribute('aria-label')).toBe('Notifications');
    expect(screen.getAllByLabelText('Read notification')).toHaveLength(2);
  });

  it('recovers the successful single save when the overlapping mark-all fails last', async () => {
    const second = { ...notice, id: 'n-2', title: 'Second notice' };
    items = [notice, second]; count = 9;
    const single = deferred<{ data: object }>();
    const all = deferred<{ data: object }>();
    mocks.patch.mockImplementation((url: string) => url === '/notifications/read-all' ? all.promise : single.promise);
    render(<NotificationCenter enabled />);
    await open();
    fireEvent.click(screen.getByRole('button', { name: /Ticket updated/ }));
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    const before = mocks.get.mock.calls.length;
    items = [{ ...notice, read_at: 'saved' }, second]; count = 8;
    await act(async () => single.resolve({ data: {} }));
    expect(mocks.get.mock.calls.length).toBe(before);
    await act(async () => all.reject(new Error('save failed')));
    expect(mocks.get.mock.calls.length).toBe(before + 2);
    expect(bell().getAttribute('aria-label')).toBe('Notifications, 8 unread');
    expect(screen.getAllByLabelText('Read notification')).toHaveLength(1);
    expect(screen.getAllByLabelText('Unread notification')).toHaveLength(1);
  });

  it.each(['success', 'failure'])('ignores a pre-save read completing with %s after reconciliation', async outcome => {
    items = [notice]; count = 1;
    const write = deferred<{ data: object }>();
    mocks.patch.mockReturnValue(write.promise);
    render(<NotificationCenter enabled />);
    await open();
    fireEvent.click(screen.getByRole('button', { name: /Ticket updated/ }));
    const old = deferred<{ data: { items: NotificationItem[] } }>();
    mocks.get.mockImplementation((url: string) => url === '/notifications' ? old.promise : Promise.resolve({ data: { unread_count: 1 } }));
    fireEvent.click(bell());
    items = [{ ...notice, read_at: 'saved' }]; count = 0;
    mocks.get.mockImplementation((url: string) => Promise.resolve({ data: url === '/notifications' ? { items } : { unread_count: count } }));
    await act(async () => write.resolve({ data: {} }));
    await act(async () => outcome === 'success' ? old.resolve({ data: { items: [notice] } }) : old.reject(new Error('old read failed')));
    expect(bell().getAttribute('aria-label')).toBe('Notifications');
    expect(screen.getByLabelText('Read notification')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each(['reject', 'null list', 'null count'])('retains known list and unknown count when post-save reconciliation returns %s', async outcome => {
    items = [notice]; count = 1;
    const write = deferred<{ data: object }>();
    mocks.patch.mockReturnValue(write.promise);
    render(<NotificationCenter enabled />);
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    mocks.get.mockImplementation((url: string) => outcome === 'reject' ? Promise.reject(new Error('offline')) : Promise.resolve({ data:
      url === '/notifications'
        ? outcome === 'null list' ? null : { items: [{ ...notice, title: 'Partial snapshot' }] }
        : outcome === 'null count' ? null : { unread_count: 0 } }));
    await act(async () => write.resolve({ data: {} }));
    expect(screen.getByText(notice.title)).toBeTruthy();
    expect(screen.getByLabelText('Read notification')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('may be out of date');
    expect(bell().getAttribute('aria-label')).toContain('unread count unavailable');
    expect((screen.getByRole('button', { name: 'Mark all read' }) as HTMLButtonElement).disabled).toBe(true);
    items = [{ ...notice, read_at: 'saved' }]; count = 0;
    mocks.get.mockImplementation((url: string) => Promise.resolve({ data: url === '/notifications' ? { items } : { unread_count: count } }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(bell().getAttribute('aria-label')).toBe('Notifications');
  });

  it.each(['disable', 'unmount', 'reenable'] as const)('retires pending write callbacks on %s', async mode => {
    items = [notice]; count = 1;
    const writes = [deferred<{ data: object }>(), deferred<{ data: object }>()];
    mocks.patch.mockReturnValueOnce(writes[0].promise).mockReturnValueOnce(writes[1].promise);
    const view = render(<NotificationCenter enabled />);
    await open();
    fireEvent.click(screen.getByRole('button', { name: /Ticket updated/ }));
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    if (mode === 'unmount') view.unmount();
    else view.rerender(<NotificationCenter enabled={false} />);
    let currentWrite: ReturnType<typeof deferred<{ data: object }>> | undefined;
    if (mode === 'reenable') {
      items = [{ ...notice, id: 'new-session', title: 'New session notice' }]; count = 4;
      view.rerender(<NotificationCenter enabled />);
      await waitFor(() => expect(bell().getAttribute('aria-label')).toBe('Notifications, 4 unread'));
      currentWrite = deferred<{ data: object }>();
      mocks.patch.mockReturnValue(currentWrite.promise);
      fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    }
    const before = mocks.get.mock.calls.length;
    await act(async () => {
      writes[0].resolve({ data: {} });
      writes[1].reject(new Error('retired failure'));
    });
    expect(mocks.get.mock.calls.length).toBe(before);
    if (mode === 'reenable') {
      expect(screen.getByText('New session notice')).toBeTruthy();
      expect(bell().getAttribute('aria-label')).toBe('Notifications');
      items = items.map(item => ({ ...item, read_at: 'saved' })); count = 0;
      await act(async () => currentWrite!.resolve({ data: {} }));
      expect(mocks.get.mock.calls.length).toBe(before + 2);
      expect(bell().getAttribute('aria-label')).toBe('Notifications');
    } else expect(screen.queryByRole('button', { name: /^Notifications/ })).toBeNull();
  });


  it('keeps an unknown count unknown during a single save and makes no reads while initially disabled', async () => {
    items = [notice]; count = 1;
    const write = deferred<{ data: object }>();
    mocks.patch.mockReturnValue(write.promise);
    const view = render(<NotificationCenter enabled={false} />);
    expect(mocks.get).not.toHaveBeenCalled();
    view.rerender(<NotificationCenter enabled />);
    await open();
    fireEvent.click(bell());
    failing = '/notifications/unread-count';
    await open();
    fireEvent.click(screen.getByRole('button', { name: /Ticket updated/ }));
    expect(bell().getAttribute('aria-label')).toContain('unread count unavailable');
    await act(async () => write.reject(new Error('save failed')));
    expect(bell().getAttribute('aria-label')).toContain('unread count unavailable');
  });

});
