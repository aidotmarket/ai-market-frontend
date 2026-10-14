import { beforeEach, describe, expect, it, vi } from 'vitest';

const client = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('./client', () => ({ api: client }));
import { getOrder } from './orders';

const retained = {
  id: 'synthetic-order', buyer_id: 'buyer-1', seller_id: 'seller-1',
  status: 'completed', currency: 'USD', access_expired: false,
  access_expires_at: '2026-11-01T00:00:00Z', download_count: 2,
  purchased_version_id: 'version-1', access_url: null,
};

describe('order detail display adapter', () => {
  beforeEach(() => client.get.mockReset());

  it.each([false, true, undefined])('normalizes canonical fields with workspace_delivery=%s and preserves all other fields', async (workspace_delivery) => {
    const data = Object.freeze({ ...retained, workspace_delivery, amount_cents: 12345,
      listing_snapshot: { title: 'Purchased snapshot', version: '1' } });
    client.get.mockResolvedValueOnce({ data });
    expect(await getOrder(data.id)).toEqual({ ...data, amount: 123.45, listing_title: 'Purchased snapshot' });
    expect(data).not.toHaveProperty('amount');
    expect(data).not.toHaveProperty('listing_title');
    expect(client.get).toHaveBeenCalledExactlyOnceWith('/orders/synthetic-order');
  });

  it.each([false, true])('prefers canonical zero and snapshot over stale legacy fields with workspace_delivery=%s', async (workspace_delivery) => {
    const data = { ...retained, workspace_delivery, amount_cents: 0, amount: 99,
      listing_snapshot: { title: 'Stored title' }, listing_title: 'Stale title' };
    client.get.mockResolvedValueOnce({ data });
    expect(await getOrder(data.id)).toEqual({ ...data, amount: 0, listing_title: 'Stored title' });
  });

  it.each([false, true])('preserves legacy dollars and title with workspace_delivery=%s', async (workspace_delivery) => {
    const data = { ...retained, workspace_delivery, amount: 12.34, listing_title: 'Legacy title' };
    client.get.mockResolvedValueOnce({ data });
    expect(await getOrder(data.id)).toEqual(data);
  });

  it('falls back from a missing snapshot title to legacy title, then Purchased data', async () => {
    client.get.mockResolvedValueOnce({ data: { ...retained, amount: 0, listing_snapshot: {}, listing_title: 'Legacy title' } });
    expect(await getOrder(retained.id)).toMatchObject({ amount: 0, listing_title: 'Legacy title' });
    client.get.mockResolvedValueOnce({ data: { ...retained, amount_cents: 0 } });
    expect(await getOrder(retained.id)).toMatchObject({ amount: 0, listing_title: 'Purchased data' });
  });

  it('encodes an order id as one path segment', async () => {
    client.get.mockResolvedValueOnce({ data: { ...retained, amount: 1, listing_title: 'Legacy' } });
    await getOrder('order/with ?#%');
    expect(client.get).toHaveBeenCalledExactlyOnceWith('/orders/order%2Fwith%20%3F%23%25');
  });
});
