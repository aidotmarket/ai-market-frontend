import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const client = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('./client', () => ({ api: client }));

import {
  SellerWorkspaceApiError,
  createIdempotencyKey,
  createSellerWorkspaceConnection,
  disconnectSellerWorkspaceConnection,
  getSellerWorkspaceAuthorization,
  getSellerWorkspaceCapabilities,
  isAWSConnectionAvailable,
  listSellerWorkspaceConnections,
  rotateSellerWorkspaceConnection,
  verifySellerWorkspaceConnection,
} from './sellerWorkspace';

const enabledCapabilities = {
  master: { enabled: true, status: 'available' as const, reason: 'enabled' },
  providers: {
    aws: {
      connect: { enabled: true, status: 'available' as const, reason: 'enabled' },
      profile: { enabled: false, status: 'unavailable' as const, reason: 'not_implemented' },
      publish: { enabled: false, status: 'unavailable' as const, reason: 'not_implemented' },
      delivery: { enabled: false, status: 'unavailable' as const, reason: 'not_implemented' },
    },
    r2: {
      connect: { enabled: false, status: 'unavailable' as const, reason: 'not_implemented' },
      profile: { enabled: false, status: 'unavailable' as const, reason: 'not_implemented' },
      publish: { enabled: false, status: 'unavailable' as const, reason: 'not_implemented' },
      delivery: { enabled: false, status: 'unavailable' as const, reason: 'not_implemented' },
    },
  },
};

function responseError(status: number, detail: unknown): AxiosError {
  const config = { headers: {} } as InternalAxiosRequestConfig;
  return new AxiosError('unsafe provider ExternalId=secret', 'ERR_BAD_RESPONSE', config, undefined, {
    config,
    data: { detail },
    headers: {},
    status,
    statusText: 'Error',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Seller Workspace capability truth', () => {
  it('uses only the frozen capability endpoint', async () => {
    client.get.mockResolvedValueOnce({ data: enabledCapabilities });
    await expect(getSellerWorkspaceCapabilities()).resolves.toEqual(enabledCapabilities);
    expect(client.get).toHaveBeenCalledWith('/seller-workspace/capabilities');
  });

  it('defaults off unless both master and AWS connect are explicitly available', () => {
    expect(isAWSConnectionAvailable(enabledCapabilities)).toBe(true);
    expect(
      isAWSConnectionAvailable({
        ...enabledCapabilities,
        master: { enabled: false, status: 'disabled', reason: 'disabled_by_default' },
      })
    ).toBe(false);
    expect(
      isAWSConnectionAvailable({
        ...enabledCapabilities,
        providers: {
          ...enabledCapabilities.providers,
          aws: {
            ...enabledCapabilities.providers.aws,
            connect: { enabled: false, status: 'disabled', reason: 'stage_disabled' },
          },
        },
      })
    ).toBe(false);
    expect(isAWSConnectionAvailable({} as never)).toBe(false);
  });
});

describe('Seller Workspace frozen routes', () => {
  it('lists connections and retrieves open authorization without mutation headers', async () => {
    client.get
      .mockResolvedValueOnce({ data: { connections: [] } })
      .mockResolvedValueOnce({ data: { external_id: 'server-owned' } });

    await expect(listSellerWorkspaceConnections()).resolves.toEqual([]);
    await getSellerWorkspaceAuthorization('connection-1');

    expect(client.get).toHaveBeenNthCalledWith(1, '/seller-workspace/connections');
    expect(client.get).toHaveBeenNthCalledWith(
      2,
      '/seller-workspace/connections/connection-1/authorization'
    );
  });

  it('sends a safe Idempotency-Key on every mutation and never sends principal or ExternalId', async () => {
    client.post.mockResolvedValue({ data: { connection: {}, authorization: null, replayed: false } });
    const scope = {
      role_arn: 'arn:aws:iam::123456789012:role/seller-data',
      bucket: 'seller-bucket',
      prefix: 'bounded/data',
      region: 'eu-west-1',
    };

    await createSellerWorkspaceConnection('safe-create');
    await verifySellerWorkspaceConnection('connection-1', scope, 'safe-verify');
    await rotateSellerWorkspaceConnection('connection-1', 'start', 'safe-rotate-start');
    await rotateSellerWorkspaceConnection('connection-1', 'complete', 'safe-rotate-complete');
    await disconnectSellerWorkspaceConnection('connection-1', 'safe-disconnect');

    expect(client.post.mock.calls).toEqual([
      ['/seller-workspace/connections', { provider: 'aws' }, { headers: { 'Idempotency-Key': 'safe-create' } }],
      ['/seller-workspace/connections/connection-1/verify', scope, { headers: { 'Idempotency-Key': 'safe-verify' } }],
      ['/seller-workspace/connections/connection-1/rotate', { action: 'start' }, { headers: { 'Idempotency-Key': 'safe-rotate-start' } }],
      ['/seller-workspace/connections/connection-1/rotate', { action: 'complete' }, { headers: { 'Idempotency-Key': 'safe-rotate-complete' } }],
      ['/seller-workspace/connections/connection-1/disconnect', undefined, { headers: { 'Idempotency-Key': 'safe-disconnect' } }],
    ]);
    expect(JSON.stringify(client.post.mock.calls)).not.toMatch(/external_id|principal_arn|trust_policy/i);
  });

  it('generates a backend-safe collision-resistant idempotency key', () => {
    const key = createIdempotencyKey('Rotate Start');
    expect(key).toMatch(/^sw\.rotate-start\.[a-z0-9-]+$/);
    expect(key.length).toBeLessThanOrEqual(128);
  });
});

describe('Seller Workspace safe errors', () => {
  it.each([
    [403, { reason: 'secret seller response' }, 'active_seller_required'],
    [409, 'Connection authorization is unavailable', 'authorization_expired'],
    [422, 'Connection scope is invalid', 'invalid_scope'],
    [422, 'unsafe AccessDenied secret', 'verification_failed'],
    [503, 'unsafe configuration secret', 'unavailable'],
  ])('reduces status %s to a safe code', async (status, detail, code) => {
    client.get.mockRejectedValueOnce(responseError(status, detail));
    const rejection = getSellerWorkspaceAuthorization('connection-1');
    await expect(rejection).rejects.toEqual(new SellerWorkspaceApiError(code as never));
    await expect(rejection).rejects.not.toThrow(/secret|AccessDenied|ExternalId/i);
  });
});
