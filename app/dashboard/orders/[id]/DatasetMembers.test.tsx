// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DatasetMembers from './DatasetMembers';
import { resolveMemberDownload } from './memberDownload';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/api/client', () => ({ api }));
vi.mock('@/store/auth', () => ({ useAuthStore: (select: (s: { token: string }) => unknown) => select({ token: 'buyer-access-secret' }) }));
const members = [
  { index: 0, basename: 'first.csv', size_bytes: 2048, sha256: 'private-hash-0', state: 'delivered' as const },
  { index: 1, basename: 'second.csv', size_bytes: 1048576, sha256: 'private-hash-1', state: 'delivered' as const },
  { index: 2, basename: 'missing.csv', size_bytes: 0, sha256: 'private-hash-2', state: 'unavailable' as const },
];
const grant = { token_id: 'token-id', download_token: 'order-grant-secret', expires_at: '2099-09-17T22:00:00Z', downloads_remaining: 2 };
const fetchMock = vi.fn();
const openUrls: string[] = [];
function setup(accessExpired = false) {
  return render(<DatasetMembers orderId="order-1" accessExpired={accessExpired} ensureTermsAccepted={async (action) => action()} />);
}
async function getAccess() {
  fireEvent.click(await screen.findByRole('button', { name: 'Get download access' }));
  await screen.findByText(/Downloads remaining: 2/);
}

beforeEach(() => {
  vi.stubEnv('API_URL', 'https://api.example.test');
  api.get.mockResolvedValue({ data: { members } });
  api.post.mockResolvedValue({ data: grant });
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(new Response(null, { status: 302, headers: { Location: 'https://storage.example.test/file?signature=signed' } }));
  openUrls.length = 0;
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { openUrls.push(this.href); });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.resetAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('dataset member access', () => {
  it('lists three members, issues one set grant, and opens each delivered member via a header-authenticated redirect', async () => {
    const { container } = setup();
    await screen.findByText('missing.csv');
    expect(screen.getByText('2.0 KiB')).toBeTruthy();
    expect(screen.getByText('1.0 MiB')).toBeTruthy();
    expect(screen.getByText('0 B')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Download missing.csv' })).toBeNull();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Download first.csv' }).disabled).toBe(true);
    expect(api.post).not.toHaveBeenCalled();
    await getAccess();
    expect(container.querySelector('time')?.dateTime).toBe(grant.expires_at);
    for (const [index, name] of ['first.csv', 'second.csv'].entries()) {
      fireEvent.click(screen.getByRole('button', { name: `Download ${name}` }));
      await waitFor(() => expect(openUrls).toHaveLength(index + 1));
      expect(fetchMock).toHaveBeenLastCalledWith(expect.stringContaining(`/orders/order-1/members/${index}`), expect.objectContaining({ method: 'GET', headers: { Authorization: 'Bearer buyer-access-secret', 'X-Download-Token': grant.download_token }, redirect: 'manual', cache: 'no-store' }));
    }
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/orders/order-1/members/grant');
    expect(fetchMock).toHaveBeenCalledTimes(2); // Never fetch storage bytes on the Next server.
    expect(openUrls).toEqual(Array(2).fill('https://storage.example.test/file?signature=signed'));
    expect(container.innerHTML).not.toContain(grant.download_token);
    expect(container.innerHTML).not.toContain('buyer-access-secret');
    expect(container.innerHTML).not.toContain('private-hash');
  });

  it.each([
    ['grant_rate_limit', 'Too many access requests.'],
    ['download_limit_reached', 'no download allowances remaining'],
    ['delivery_not_complete', 'still being delivered'],
    ['delivery_busy', 'Delivery is busy. Please try again shortly.'],
    ['delivery_retention_expired', 'This dataset is no longer available for download.'],
  ])('shows grant refusal %s', async (reason, copy) => {
    api.post.mockRejectedValue({ response: { data: { detail: reason } } });
    setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Get download access' }));
    expect((await screen.findByRole('alert')).textContent).toContain(copy);
    expect(screen.getByRole('alert').textContent).toContain(reason);
  });

  it.each(['grant_expiring', 'invalid_grant'])('offers explicit renewal for %s and never renews automatically', async (reason) => {
    setup();
    await getAccess();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: reason }), { status: 409 }));
    fireEvent.click(screen.getByRole('button', { name: 'Download first.csv' }));
    const renew = await screen.findByRole('button', { name: 'Renew download access' });
    expect(screen.getByRole('alert').textContent).toContain(reason);
    fireEvent.click(renew);
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(openUrls).toHaveLength(0);
  });

  it('marks a newly unavailable member without another grant or download action', async () => {
    setup(); await getAccess();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: 'member_unavailable' }), { status: 410 }));
    fireEvent.click(screen.getByRole('button', { name: 'Download first.csv' }));
    expect((await screen.findByRole('alert')).textContent).toContain('member_unavailable');
    expect(screen.queryByRole('button', { name: 'Download first.csv' })).toBeNull();
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('renders a generic named refusal for a closed-access 403', async () => {
    setup(); await getAccess();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: 'Download access has been closed' }), { status: 403 }));
    fireEvent.click(screen.getByRole('button', { name: 'Download first.csv' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Could not prepare this download. Please try again. (download_request_failed)');
    expect(openUrls).toHaveLength(0);
  });

  it('renders the named meter refusal', async () => {
    setup(); await getAccess();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: { code: 'byte_budget_exceeded', bound: 'DOWNLOAD_GRANT_BYTES_PER_HOUR', value: 100 } }), { status: 429 }));
    fireEvent.click(screen.getByRole('button', { name: 'Download first.csv' }));
    expect((await screen.findByRole('alert')).textContent).toContain('byte_budget_exceeded');
    expect(openUrls).toHaveLength(0);
  });

  it('offers renewal at the grant margin without issuing another grant', async () => {
    api.post.mockResolvedValue({ data: { ...grant, expires_at: new Date(Date.now() + 300000).toISOString() } });
    setup(); await getAccess();
    expect(screen.getByRole('button', { name: 'Renew download access' })).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Download first.csv' }).disabled).toBe(true);
    expect(api.post).toHaveBeenCalledTimes(1);
  });


  it('keeps an expiring grant disabled if renewal is refused', async () => {
    setup(); await getAccess();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: 'grant_expiring' }), { status: 409 }));
    fireEvent.click(screen.getByRole('button', { name: 'Download first.csv' }));
    api.post.mockRejectedValue({ response: { data: { detail: 'grant_rate_limit' } } });
    fireEvent.click(await screen.findByRole('button', { name: 'Renew download access' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('grant_rate_limit'));
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Download first.csv' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Renew download access' })).toBeTruthy();
  });

  it('shows a safe list failure without leaking server diagnostics', async () => {
    api.get.mockRejectedValue({ response: { data: { detail: 'order-grant-secret' } } });
    const { container } = setup();
    await screen.findByRole('alert');
    expect(container.innerHTML).not.toContain('order-grant-secret');
  });

  it('does not request access for an expired order', async () => {
    setup(true); await screen.findByText('first.csv');
    expect(screen.queryByRole('button', { name: 'Get download access' })).toBeNull();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('deduplicates repeated access clicks while the grant is pending', async () => {
    let resolve!: (value: unknown) => void;
    api.post.mockReturnValue(new Promise((r) => { resolve = r; }));
    setup();
    const button = await screen.findByRole('button', { name: 'Get download access' });
    fireEvent.click(button); fireEvent.click(button);
    expect(api.post).toHaveBeenCalledTimes(1);
    resolve({ data: grant });
    await screen.findByText(/Downloads remaining: 2/);
  });
});

describe('redirect resolver safety', () => {
  it('throws a named configuration error without contacting localhost when API_URL is unset', async () => {
    vi.stubEnv('API_URL', undefined);
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:8000');
    await expect(resolveMemberDownload('order-1', 0, grant.download_token, 'buyer-access-secret'))
      .rejects.toMatchObject({ name: 'MemberDownloadApiUrlMissingError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(['javascript:alert(1)', 'http://storage.example.test/file', 'https://user:pass@storage.example.test/file', 'https://storage.example.test/?token=order-grant-secret'])('refuses unsafe redirect %s', async (location) => {
    fetchMock.mockResolvedValue(new Response(null, { status: 302, headers: { Location: location } }));
    expect(await resolveMemberDownload('order-1', 0, grant.download_token, 'buyer-access-secret')).toEqual({ reason: 'download_request_failed' });
  });
  it('rejects missing auth and path injection without contacting the API', async () => {
    await resolveMemberDownload('../other', 0, grant.download_token, 'buyer-access-secret');
    await resolveMemberDownload('order-1', 0, grant.download_token, '');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('does not expose unrecognized server diagnostics', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: 'secret diagnostics' }), { status: 500 }));
    expect(await resolveMemberDownload('order-1', 0, grant.download_token, 'buyer-access-secret')).toEqual({ reason: 'download_request_failed' });
  });
});
