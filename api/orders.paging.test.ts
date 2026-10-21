import { beforeEach, describe, expect, it, vi } from 'vitest';

const client = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('./client', () => ({ api: client }));
import { getMyOrders } from './orders';

describe('bounded buyer order transport', () => {
  beforeEach(() => client.get.mockReset());

  it('preserves the exact no-argument transport, API order, cents and purchase fields', async () => {
    const data = Object.freeze([
      Object.freeze({ id: 'purchase-z', amount_cents: 0, amount: 99, purchased_version_id: 'v1', license_record_available: true }),
      Object.freeze({ id: 'purchase-a', amount_cents: 1234, access_expired: true }),
      Object.freeze({ id: 'legacy', amount: 4.25 }),
    ] as const);
    client.get.mockResolvedValueOnce({ data });
    expect(await getMyOrders()).toEqual([{ ...data[0], amount: 0 }, { ...data[1], amount: 12.34 }, data[2]]);
    expect(client.get).toHaveBeenCalledExactlyOnceWith('/orders/mine');
    expect(data[0].amount).toBe(99);
  });

  it('sends explicit limit and offset while retaining canonical cents conversion', async () => {
    const data = { id: 'older-51', amount_cents: 2530, amount: 90, purchased_version_id: 'stored-v', access_expired: false };
    client.get.mockResolvedValueOnce({ data: [data] });
    expect(await getMyOrders({ limit: 50, offset: 50 })).toEqual([{ ...data, amount: 25.3 }]);
    expect(client.get).toHaveBeenCalledExactlyOnceWith('/orders/mine', { params: { limit: 50, offset: 50 } });
  });

  it.each([
    [{}, 50, 0],
    [{ limit: 500, offset: -7 }, 100, 0],
    [{ limit: 0, offset: 50.9 }, 1, 50],
    [{ limit: 12.9, offset: 99 }, 12, 99],
    [{ limit: NaN, offset: Infinity }, 50, 0],
    [{ limit: -Infinity, offset: NaN }, 50, 0],
    [{ limit: -3, offset: Number.MAX_VALUE }, 1, Number.MAX_SAFE_INTEGER],
  ])('normalizes finite integer bounds for %j', async (paging, limit, offset) => {
    client.get.mockResolvedValueOnce({ data: [] });
    await getMyOrders(paging);
    expect(client.get).toHaveBeenCalledExactlyOnceWith('/orders/mine', { params: { limit, offset } });
  });
});
