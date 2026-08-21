import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());

vi.mock('./client', () => ({
  api: { get: apiGet },
}));

const { getSellerOrders, getSellerStats } = await import('./seller');

describe('seller API', () => {
  beforeEach(() => {
    apiGet.mockReset();
  });

  it('passes the Awaiting delivery query to seller orders', async () => {
    apiGet.mockResolvedValue({ data: [] });

    await getSellerOrders({
      status_filter: 'pending_delivery',
      limit: 100,
      offset: 0,
    });

    expect(apiGet).toHaveBeenCalledWith('/seller/orders', {
      params: {
        status_filter: 'pending_delivery',
        limit: 100,
        offset: 0,
      },
    });
  });

  it('omits status_filter for All', async () => {
    apiGet.mockResolvedValue({ data: [] });

    await getSellerOrders({ limit: 100, offset: 0 });

    expect(apiGet).toHaveBeenCalledWith('/seller/orders', {
      params: { limit: 100, offset: 0 },
    });
    expect(apiGet.mock.calls[0][1].params).not.toHaveProperty('status_filter');
  });

  it('requests typed seller stats', async () => {
    const response = { data: { period: '30d' } };
    apiGet.mockResolvedValue(response);

    await expect(getSellerStats()).resolves.toBe(response);
    expect(apiGet).toHaveBeenCalledWith('/seller/stats');
  });
});
