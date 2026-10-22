// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn(), push: vi.fn(), open: vi.fn(), sendMessage: vi.fn() }));
vi.mock('@/api/client', () => ({ api: { get: mocks.get, patch: mocks.patch } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/components/allai/AllAIContext', () => ({ useAllAI: () => ({ open: mocks.open, sendMessage: mocks.sendMessage }) }));
import NotificationCenter from './NotificationCenter';

const notice = {
  id: 'audit-notice', user_id: 'audit-user', type: 'support_ticket_message', title: 'Audit support notice',
  body: 'Synthetic fixture', metadata: { public_ref: 'T-AUDIT' }, link_url: '/support/tickets/T-AUDIT',
  read_at: null as string | null, archived_at: null, created_at: '2026-10-22T10:00:00Z', updated_at: null,
};
let saved: boolean;
let finishWrite: () => void;
const bell = () => screen.getByRole('button', { name: /^Notifications/ });
async function openBell() {
  fireEvent.click(bell());
  await waitFor(() => expect(screen.queryByText('Loading notifications...')).toBeNull());
}
beforeEach(() => {
  vi.resetAllMocks();
  saved = false;
  mocks.get.mockImplementation((url: string) => Promise.resolve({ data: url === '/notifications'
    ? { items: [{ ...notice, read_at: saved ? '2026-10-22T10:01:00Z' : null }], total: 1 }
    : { unread_count: saved ? 0 : 1 } }));
  mocks.patch.mockImplementation(() => new Promise(resolve => {
    finishWrite = () => { saved = true; resolve({ data: {} }); };
  }));
});
afterEach(cleanup);

describe('notification save and refresh ordering, offline source audit', () => {
  it.each(['all', 'one'])('reconciles a successful %s-read save after a reopen fetched the pre-save state', async kind => {
    render(<NotificationCenter enabled />);
    await openBell();
    expect(bell().getAttribute('aria-label')).toBe('Notifications, 1 unread');
    fireEvent.click(screen.getByRole('button', { name: kind === 'all' ? 'Mark all read' : /Audit support notice/ }));
    expect(mocks.patch).toHaveBeenCalledExactlyOnceWith(kind === 'all' ? '/notifications/read-all' : '/notifications/audit-notice/read');
    if (kind === 'all') fireEvent.click(bell()); // The single-notice action already closed the panel.
    await openBell();
    expect(bell().getAttribute('aria-label')).toBe('Notifications, 1 unread');
    await act(async () => finishWrite());
    await waitFor(() => expect(bell().getAttribute('aria-label')).toBe('Notifications'));
    expect(screen.getByLabelText('Read notification')).toBeTruthy();
  });

  it('control: a later explicit reopen can observe the same successfully saved record', async () => {
    render(<NotificationCenter enabled />);
    await openBell();
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    await act(async () => finishWrite());
    fireEvent.click(bell());
    await openBell();
    expect(bell().getAttribute('aria-label')).toBe('Notifications');
    expect(screen.getByLabelText('Read notification')).toBeTruthy();
    expect(mocks.patch).toHaveBeenCalledExactlyOnceWith('/notifications/read-all');
  });
});
