// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import GatewayPage from '@/app/dashboard/gateways/[id]/page';
const route = vi.hoisted(() => ({ id: 'gateway-1' }));
const api = vi.hoisted(() => ({ received: vi.fn(), get: vi.fn(), list: vi.fn(), files: vi.fn(), write: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useParams: () => ({ id: route.id }), useRouter: () => ({ push: api.push }) }));
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('@/store/auth', () => ({ useAuthStore: () => ({ hydrated: true, isAuthenticated: true }) }));
vi.mock('@/api/capabilities', () => ({ getCapabilities: async () => ({ seller: { effective_status: 'active' } }) }));
vi.mock('@/api/gatewayDelivery', () => ({ gatewayErrorCode: () => null }));
vi.mock('@/api/listings', () => ({ createDraftListing: api.write }));
vi.mock('@/api/sellerGateways', () => ({
  getSellerGateway: api.get, listSellerGateways: api.list, listGatewayFiles: api.files,
  listReceivedMessages: api.received, getGatewayFile: api.write,
  acknowledgeGatewayIdentity: api.write, describeGatewayFile: api.write,
  patchSellerGateway: api.write, revokeSellerGateway: api.write,
  saveGatewayListingSource: api.write, startDoorCheck: api.write, gatewayErrorDetails: () => null,
}));
const gateway = {
  gateway_id: 'gateway-1', name: 'Synthetic gateway', status: 'online', status_reason: null,
  version: '1.0', minimum_version: '1.0', last_seen_at: null,
  egress_check: { state: 'closed', checked_at: null }, door_url: null,
  door_check: { state: 'never', checked_at: null, failure_code: null, certificate_flags: [] },
  identity_ack_at: null, listing_count: 0, open_order_count: 0, can_publish: false, blockers: [],
};
const page = (type: string, seq: number, cursor: string | null = null) => ({
  messages: [{ seq, received_at: '2026-01-01T00:00:00Z', message_type: type, body: { audit_marker: `${type}-${seq}` } }],
  next_cursor: cursor,
});
function deferred() {
  let resolve!: (value: ReturnType<typeof page>) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<ReturnType<typeof page>>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
beforeEach(() => {
  vi.resetAllMocks();
  route.id = 'gateway-1';
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Native fetch denied'); }));
  vi.stubGlobal('XMLHttpRequest', class { constructor() { throw new Error('Native XHR denied'); } });
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000000');
  api.get.mockResolvedValue(gateway);
  api.list.mockResolvedValue([gateway]);
  api.files.mockResolvedValue({ files: [], next_cursor: null });
  api.received.mockResolvedValue({ messages: [], next_cursor: null });
});
afterEach(() => {
  try {
    expect(api.write).not.toHaveBeenCalled();
    expect(api.push).not.toHaveBeenCalled();
  } finally {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  }
});
async function ready() {
  render(<GatewayPage />);
  await screen.findByRole('heading', { name: 'Synthetic gateway' });
  await waitFor(() => expect(api.received).toHaveBeenCalled());
  await act(async () => {});
}
function filter(type: string) { fireEvent.change(screen.getByLabelText('Message type'), { target: { value: type } }); }
it('keeps the newest filter rows and cursor when an older filter succeeds late', async () => {
  await ready();
  const old = deferred();
  api.received.mockImplementationOnce(() => old.promise).mockResolvedValueOnce(page('inventory', 20));
  filter('hello');
  filter('inventory');
  await screen.findByText(/inventory-20/);
  await act(async () => old.resolve(page('hello', 10, 'old-cursor')));
  expect((screen.getByLabelText('Message type') as HTMLSelectElement).value).toBe('inventory');
  expect(screen.getByText(/inventory-20/)).toBeTruthy();
  expect(screen.queryByText(/hello-10/)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Load more messages' })).toBeNull();
});
it('ignores an obsolete filter failure after the newest filter succeeds', async () => {
  await ready();
  const old = deferred();
  api.received.mockImplementationOnce(() => old.promise).mockResolvedValueOnce(page('inventory', 20));
  filter('hello');
  filter('inventory');
  await screen.findByText(/inventory-20/);
  await act(async () => old.reject(new Error('old read failed')));
  expect(screen.getByText(/inventory-20/)).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
});
it('does not append an old filter page into the replacement filter', async () => {
  api.received.mockResolvedValueOnce(page('hello', 1, 'more-hello'));
  await ready();
  await screen.findByText(/hello-1/);
  const more = deferred();
  api.received.mockImplementationOnce(() => more.promise).mockResolvedValueOnce(page('inventory', 20));
  fireEvent.click(screen.getByRole('button', { name: 'Load more messages' }));
  filter('inventory');
  await screen.findByText(/inventory-20/);
  await act(async () => more.resolve(page('hello', 2, 'old-next')));
  expect(screen.queryByText(/hello-2/)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Load more messages' })).toBeNull();
  expect(screen.getByText(/inventory-20/)).toBeTruthy();
});
it('ordinary sequential filtering and pagination still render the requested messages', async () => {
  await ready();
  api.received.mockResolvedValueOnce(page('inventory', 2, 'inventory-next')).mockResolvedValueOnce(page('inventory', 3));
  filter('inventory');
  await screen.findByText(/inventory-2/);
  fireEvent.click(screen.getByRole('button', { name: 'Load more messages' }));
  await screen.findByText(/inventory-3/);
  expect(screen.getByText(/inventory-2/)).toBeTruthy();
  expect(api.received).toHaveBeenLastCalledWith('gateway-1', 'inventory-next', 100, 'inventory');
  expect(screen.queryByRole('button', { name: 'Load more messages' })).toBeNull();
});
it('a current filter failure remains visible', async () => {
  await ready();
  api.received.mockRejectedValueOnce(new Error('current read failed'));
  filter('inventory');
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'We could not load messages. Try again.');
});
it('a superseded initial message failure does not hide the successfully filtered gateway', async () => {
  const initial = deferred();
  api.received.mockImplementationOnce(() => initial.promise);
  await ready();
  api.received.mockResolvedValueOnce(page('inventory', 20));
  filter('inventory');
  await screen.findByText(/inventory-20/);
  await act(async () => initial.reject(new Error('old initial read failed')));
  expect(screen.queryByText('Gateways are not available.')).toBeNull();
  expect(screen.getByText(/inventory-20/)).toBeTruthy();
});
it('a successful new filter clears the previous message-read error', async () => {
  await ready();
  api.received.mockRejectedValueOnce(new Error('read failed'));
  filter('hello');
  await screen.findByRole('alert');
  api.received.mockResolvedValueOnce(page('inventory', 20));
  filter('inventory');
  await screen.findByText(/inventory-20/);
  expect(screen.queryByRole('alert')).toBeNull();
});
it('repeated load-more clicks cannot duplicate a received message', async () => {
  api.received.mockResolvedValueOnce(page('hello', 1, 'more'));
  await ready();
  await screen.findByText(/hello-1/);
  const more = deferred();
  api.received.mockImplementation(() => more.promise);
  const button = screen.getByRole('button', { name: 'Load more messages' });
  act(() => { fireEvent.click(button); fireEvent.click(button); });
  expect(api.received).toHaveBeenCalledTimes(2);
  await act(async () => more.resolve(page('hello', 2)));
  expect(screen.getAllByText(/hello-2/)).toHaveLength(1);
});
it('keeps a current failure when the older filter succeeds later', async () => {
  await ready();
  const old = deferred();
  api.received.mockImplementationOnce(() => old.promise).mockRejectedValueOnce(new Error('current'));
  filter('hello');
  filter('inventory');
  await screen.findByRole('alert');
  await act(async () => old.resolve(page('hello', 10, 'obsolete')));
  expect(screen.getByRole('alert').textContent).toBe('We could not load messages. Try again.');
  expect(screen.queryByText(/hello-10/)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Load more messages' })).toBeNull();
});
it('ignores an old pagination failure without unlocking current pagination', async () => {
  api.received.mockResolvedValueOnce(page('hello', 1, 'old-more'));
  await ready();
  const old = deferred();
  const current = deferred();
  api.received.mockImplementationOnce(() => old.promise)
    .mockResolvedValueOnce(page('inventory', 20, 'current-more'))
    .mockImplementationOnce(() => current.promise);
  fireEvent.click(screen.getByRole('button', { name: 'Load more messages' }));
  filter('inventory');
  await screen.findByText(/inventory-20/);
  const button = screen.getByRole('button', { name: 'Load more messages' });
  fireEvent.click(button);
  expect((button as HTMLButtonElement).disabled).toBe(true);
  await act(async () => old.reject(new Error('obsolete page')));
  expect(screen.queryByRole('alert')).toBeNull();
  expect((button as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(button);
  expect(api.received).toHaveBeenCalledTimes(4);
  await act(async () => current.resolve(page('inventory', 21)));
  expect(screen.getByText(/inventory-21/)).toBeTruthy();
  expect(screen.queryByText(/hello-1/)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Load more messages' })).toBeNull();
});
it('retains rows and retries the same cursor after a current pagination failure', async () => {
  api.received.mockResolvedValueOnce(page('hello', 1, 'retry-cursor'));
  await ready();
  api.received.mockRejectedValueOnce(new Error('current page')).mockResolvedValueOnce(page('hello', 2, 'next-cursor'));
  fireEvent.click(screen.getByRole('button', { name: 'Load more messages' }));
  expect((await screen.findByRole('alert')).textContent).toBe('We could not load more messages. Try again.');
  expect(screen.getByText(/hello-1/)).toBeTruthy();
  const button = screen.getByRole('button', { name: 'Load more messages' });
  expect((button as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(button);
  await screen.findByText(/hello-2/);
  expect(screen.queryByRole('alert')).toBeNull();
  expect(api.received.mock.calls.slice(1, 3)).toEqual([
    ['gateway-1', 'retry-cursor', 100, undefined], ['gateway-1', 'retry-cursor', 100, undefined],
  ]);
  api.received.mockResolvedValueOnce(page('hello', 3));
  fireEvent.click(screen.getByRole('button', { name: 'Load more messages' }));
  await screen.findByText(/hello-3/);
  expect(api.received).toHaveBeenLastCalledWith('gateway-1', 'next-cursor', 100, undefined);
});
it.each(['success', 'failure'])('an initial %s cannot replace a pending newer filter', async (outcome) => {
  const initial = deferred();
  const current = deferred();
  api.received.mockImplementationOnce(() => initial.promise);
  await ready();
  api.received.mockImplementationOnce(() => current.promise);
  filter('inventory');
  await act(async () => {
    if (outcome === 'success')
      initial.resolve(page('hello', 1, 'old'));
    else
      initial.reject(new Error('old initial'));
  });
  expect(screen.getByRole('heading', { name: 'Synthetic gateway' })).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.queryByText(/hello-1/)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Load more messages' })).toBeNull();
  await act(async () => current.resolve(page('inventory', 20, 'new')));
  expect(screen.getByText(/inventory-20/)).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Load more messages' }) as HTMLButtonElement).disabled).toBe(false);
});
it('shows an initial message failure beside the otherwise available gateway and recovers', async () => {
  api.received.mockRejectedValueOnce(new Error('initial'));
  await ready();
  expect(screen.getByRole('heading', { name: 'Synthetic gateway' })).toBeTruthy();
  expect(screen.getByRole('alert').textContent).toBe('We could not load messages. Try again.');
  api.received.mockResolvedValueOnce(page('receipt', 7));
  filter('receipt');
  await screen.findByText(/receipt-7/);
  expect(screen.queryByRole('alert')).toBeNull();
});
it('message recovery preserves independent settings and door validation errors', async () => {
  await ready();
  fireEvent.change(screen.getByLabelText('Gateway name'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save name' }));
  fireEvent.change(screen.getByLabelText('Door URL'), { target: { value: 'http://invalid.example' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save door URL' }));
  api.received.mockRejectedValueOnce(new Error('messages'));
  filter('hello');
  await screen.findByText('We could not load messages. Try again.');
  api.received.mockResolvedValueOnce(page('inventory', 20));
  filter('inventory');
  await screen.findByText(/inventory-20/);
  expect(screen.queryByText('We could not load messages. Try again.')).toBeNull();
  expect(screen.getByText('Enter a name of 1 to 80 characters.')).toBeTruthy();
  expect(screen.getByText('Use an https URL.')).toBeTruthy();
});
it.each(['success', 'failure'])('ignores %s from a previous route even after returning to the same gateway', async (outcome) => {
  const old = deferred();
  api.received.mockImplementationOnce(() => old.promise);
  const view = render(<GatewayPage />);
  await screen.findByRole('heading', { name: 'Synthetic gateway' });
  await waitFor(() => expect(api.received).toHaveBeenCalledTimes(1));
  route.id = 'gateway-2';
  api.get.mockResolvedValue({ ...gateway, gateway_id: 'gateway-2', name: 'Second gateway' });
  api.received.mockResolvedValueOnce(page('receipt', 5));
  view.rerender(<GatewayPage />);
  await screen.findByText(/receipt-5/);
  expect(api.received).toHaveBeenLastCalledWith('gateway-2', undefined, 100, undefined);
  route.id = 'gateway-1';
  api.get.mockResolvedValue(gateway);
  api.received.mockResolvedValueOnce(page('inventory', 20, 'current'));
  view.rerender(<GatewayPage />);
  await screen.findByText(/inventory-20/);
  await act(async () => {
    if (outcome === 'success')
      old.resolve(page('hello', 1, 'old'));
    else
      old.reject(new Error('previous route'));
  });
  expect(screen.getByText(/inventory-20/)).toBeTruthy();
  expect(screen.queryByText(/hello-1/)).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
  api.received.mockResolvedValueOnce(page('inventory', 21));
  fireEvent.click(screen.getByRole('button', { name: 'Load more messages' }));
  await screen.findByText(/inventory-21/);
  expect(api.received).toHaveBeenLastCalledWith('gateway-1', 'current', 100, undefined);
});
it.each(['success', 'failure'])('settling an unmounted read with %s does not affect a new mount', async (outcome) => {
  const old = deferred();
  api.received.mockImplementationOnce(() => old.promise);
  const view = render(<GatewayPage />);
  await screen.findByRole('heading', { name: 'Synthetic gateway' });
  await waitFor(() => expect(api.received).toHaveBeenCalledTimes(1));
  view.unmount();
  api.received.mockResolvedValueOnce(page('inventory', 20, 'current'));
  await ready();
  await screen.findByText(/inventory-20/);
  await act(async () => {
    if (outcome === 'success')
      old.resolve(page('hello', 1, 'obsolete'));
    else
      old.reject(new Error('unmounted'));
  });
  expect(screen.getByText(/inventory-20/)).toBeTruthy();
  expect(screen.queryByText(/hello-1/)).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(api.received).toHaveBeenCalledTimes(2);
});
it('keeps backend bodies and sorts sequence gaps with the current filter qualification', async () => {
  const response = { messages: [page('hello', 5).messages[0], page('hello', 2).messages[0]], next_cursor: null };
  api.received.mockResolvedValueOnce(response);
  await ready();
  const rows = screen.getAllByRole('listitem');
  expect(rows.map(row => row.querySelector('pre')?.textContent)).toEqual([
    JSON.stringify(response.messages[1].body, null, 2), JSON.stringify(response.messages[0].body, null, 2),
  ]);
  expect(screen.getByText('Messages 3 to 4 missing')).toBeTruthy();
  api.received.mockResolvedValueOnce(response);
  filter('hello');
  await screen.findByText('Messages 3 to 4 not shown by this filter or missing');
  expect(api.received).toHaveBeenLastCalledWith('gateway-1', undefined, 100, 'hello');
});

it('returning to the same filter still invalidates its earlier read', async () => {
  await ready();
  const old = deferred();
  api.received.mockImplementationOnce(() => old.promise)
    .mockResolvedValueOnce(page('inventory', 20))
    .mockResolvedValueOnce(page('hello', 30, 'latest-hello'));
  filter('hello');
  filter('inventory');
  await screen.findByText(/inventory-20/);
  filter('hello');
  await screen.findByText(/hello-30/);
  await act(async () => old.resolve(page('hello', 10, 'old-hello')));
  expect(screen.queryByText(/hello-10/)).toBeNull();
  expect(screen.getByText(/hello-30/)).toBeTruthy();
  api.received.mockResolvedValueOnce(page('hello', 31));
  fireEvent.click(screen.getByRole('button', { name: 'Load more messages' }));
  await screen.findByText(/hello-31/);
  expect(api.received).toHaveBeenLastCalledWith('gateway-1', 'latest-hello', 100, 'hello');
});
