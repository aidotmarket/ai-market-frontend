// @vitest-environment jsdom

import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError } from 'axios';
import MyDataRequestsPage from './page';

const mocks = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn(),
  auth: { isAuthenticated: true, user: { id: 'buyer-a' } as { id: string } | null },
}));
vi.mock('@/api/client', () => ({ api: mocks }));
vi.mock('@/store/auth', () => ({ useAuthStore: () => mocks.auth }));

const statuses = ['draft', 'open', 'matched', 'responses_received', 'fulfilled', 'closed', 'expired'];
function envelope(page: number, total = 82, prefix = 'Owned') {
  return { data: {
    total, page, per_page: 20,
    items: Array.from({ length: Math.max(0, Math.min(20, total - (page - 1) * 20)) }, (_, index) => {
      const n = (page - 1) * 20 + index + 1;
      return { id: `${prefix}-${n}`, slug: `${prefix}-${n}`, title: `${prefix} request ${n}`,
        status: statuses[(n - 1) % statuses.length], urgency: 'normal', response_count: 0,
        created_at: '2026-10-01T00:00:00Z' };
    }),
  } };
}
function deferred() {
  let resolve!: (value: ReturnType<typeof envelope>) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<ReturnType<typeof envelope>>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const next = () => screen.getByRole('button', { name: 'Next' });
const previous = () => screen.getByRole('button', { name: 'Previous' });
const expectPage = async (page: number, total = 82) => {
  expect(await screen.findByText(`Page ${page} of ${Math.ceil(total / 20)} · ${total} requests`)).toBeTruthy();
  expect(screen.getAllByText(`Owned request ${(page - 1) * 20 + 1}`)).toHaveLength(2);
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth = { isAuthenticated: true, user: { id: 'buyer-a' } };
  mocks.get.mockImplementation((_url, { params }) => Promise.resolve(envelope(params.page)));
});
afterEach(() => {
  cleanup();
  for (const mutation of [mocks.post, mocks.put, mocks.patch, mocks.delete]) expect(mutation).not.toHaveBeenCalled();
});

describe('My Data Requests server paging through the actual API helper', () => {
  it('reaches all 82 owned records, including every lifecycle state, and goes back', async () => {
    render(<MyDataRequestsPage />);
    await expectPage(1);
    expect((previous() as HTMLButtonElement).disabled).toBe(true);
    for (const label of ['Draft', 'Open', 'Matched', 'Responses received', 'Fulfilled', 'Closed', 'Expired']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    for (let page = 2; page <= 5; page++) {
      fireEvent.click(next());
      await expectPage(page);
      expect(mocks.get).toHaveBeenCalledTimes(page);
    }
    expect(screen.getAllByText('Owned request 82')).toHaveLength(2);
    expect(screen.queryByText('Owned request 80')).toBeNull();
    expect((next() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(next());
    expect(mocks.get).toHaveBeenCalledTimes(5);
    fireEvent.click(previous());
    await expectPage(4);
    expect(mocks.get.mock.calls).toEqual([1, 2, 3, 4, 5, 4].map(page => [
      '/data-requests', { params: { mine: true, page, per_page: 20 } },
    ]));
  });

  it.each([1, 20, 40])('does not offer an empty extra page for total %i', async total => {
    mocks.get.mockImplementation((_url, { params }) => Promise.resolve(envelope(params.page, total)));
    render(<MyDataRequestsPage />);
    await expectPage(1, total);
    if (total === 40) {
      fireEvent.click(next());
      await expectPage(2, total);
    }
    expect((next() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(next());
    expect(mocks.get).toHaveBeenCalledTimes(Math.ceil(total / 20));
  });

  it('shows the true empty state without forward navigation', async () => {
    mocks.get.mockResolvedValue(envelope(1, 0));
    render(<MyDataRequestsPage />);
    expect(await screen.findByRole('heading', { name: 'No data requests yet' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    expect(mocks.get).toHaveBeenCalledOnce();
  });

  it.each(['Unavailable', '', [{ msg: 'validation failure' }], { msg: 'validation failure' }].map(detail => ({ detail })))(
    'keeps a failed page visible with safe detail and a GET-only retry ($detail)', async ({ detail }) => {
      const pending = deferred();
      mocks.get.mockResolvedValueOnce(envelope(1)).mockReturnValueOnce(pending.promise).mockResolvedValueOnce(envelope(2));
      render(<MyDataRequestsPage />);
      await expectPage(1);
      fireEvent.click(next());
      expect(screen.getByRole('status').textContent).toBe('Loading data requests…');
      expect(screen.queryByText('Owned request 1')).toBeNull();
      expect((next() as HTMLButtonElement).disabled).toBe(true);
      expect((previous() as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(next());
      expect(mocks.get).toHaveBeenCalledTimes(2);
      await act(async () => pending.reject(Object.assign(new AxiosError('failed'), { response: { data: { detail } } })));
      expect(screen.getByRole('alert').textContent).toBe(`Could not load page 2. ${typeof detail === 'string' && detail ? detail : 'Failed to load your data requests.'}`);
      expect(screen.queryByText(/Page 2 of/)).toBeNull();
      expect(screen.queryByText('Owned request 1')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      await expectPage(2);
      expect(mocks.get.mock.calls.slice(1)).toEqual([2, 2].map(page => [
        '/data-requests', { params: { mine: true, page, per_page: 20 } },
      ]));
    },
  );

  it.each(['resolve', 'reject'] as const)('ignores %s from an obsolete effect after the newer result', async outcome => {
    const old = deferred();
    mocks.get.mockReturnValueOnce(old.promise).mockResolvedValueOnce(envelope(1));
    render(<StrictMode><MyDataRequestsPage /></StrictMode>);
    await expectPage(1);
    await act(async () => {
      if (outcome === 'resolve') old.resolve(envelope(1, 1, 'Stale'));
      else old.reject(new Error('obsolete error'));
    });
    await expectPage(1);
    expect(screen.queryByText('Stale request 1')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });

  it.each(['resolve', 'reject'] as const)('clears account records, resets page 1 and ignores old-account %s', async outcome => {
    const old = deferred();
    mocks.get.mockResolvedValueOnce(envelope(1)).mockReturnValueOnce(old.promise).mockResolvedValueOnce(envelope(1, 1, 'Buyer B'));
    const view = render(<MyDataRequestsPage />);
    await expectPage(1);
    fireEvent.click(next());
    mocks.auth = { isAuthenticated: true, user: { id: 'buyer-b' } };
    view.rerender(<MyDataRequestsPage />);
    expect(screen.queryByText('Owned request 1')).toBeNull();
    await screen.findAllByText('Buyer B request 1');
    await act(async () => {
      if (outcome === 'resolve') old.resolve(envelope(2));
      else old.reject(new Error('old account failed'));
    });
    expect(screen.queryByText('Owned request 21')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Page 1 of 1 · 1 requests')).toBeTruthy();
    expect(mocks.get.mock.calls.map(call => call[1].params.page)).toEqual([1, 2, 1]);
  });

  it('drops records on sign-out, waits for identity and does not restore an unmounted result', async () => {
    const old = deferred();
    mocks.get.mockReturnValueOnce(old.promise).mockResolvedValueOnce(envelope(1, 1, 'Fresh'));
    const view = render(<MyDataRequestsPage />);
    await waitFor(() => expect(mocks.get).toHaveBeenCalledOnce());
    mocks.auth = { isAuthenticated: false, user: null };
    view.rerender(<MyDataRequestsPage />);
    expect(view.container.textContent).toBe('');
    await act(async () => old.resolve(envelope(1)));
    expect(view.container.textContent).toBe('');
    mocks.auth = { isAuthenticated: true, user: null };
    view.rerender(<MyDataRequestsPage />);
    expect(mocks.get).toHaveBeenCalledOnce();
    mocks.auth = { isAuthenticated: true, user: { id: 'buyer-a' } };
    view.rerender(<MyDataRequestsPage />);
    await screen.findAllByText('Fresh request 1');
    expect(screen.queryByText('Owned request 1')).toBeNull();
  });

  it('clears already displayed records immediately when accounts change and discards obsolete errors while loading', async () => {
    const buyerB = deferred();
    const freshA = deferred();
    mocks.get.mockResolvedValueOnce(envelope(1)).mockReturnValueOnce(buyerB.promise).mockReturnValueOnce(freshA.promise);
    const view = render(<MyDataRequestsPage />);
    await expectPage(1);
    mocks.auth = { isAuthenticated: true, user: { id: 'buyer-b' } };
    view.rerender(<MyDataRequestsPage />);
    expect(screen.queryByText('Owned request 1')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Loading data requests…');
    mocks.auth = { isAuthenticated: true, user: { id: 'buyer-a' } };
    view.rerender(<MyDataRequestsPage />);
    await act(async () => buyerB.reject(new Error('obsolete buyer B')));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Loading data requests…');
    await act(async () => freshA.resolve(envelope(1, 1, 'Fresh A')));
    expect(screen.getAllByText('Fresh A request 1')).toHaveLength(2);
    expect(mocks.get.mock.calls.map(call => call[1].params.page)).toEqual([1, 1, 1]);
  });
});
