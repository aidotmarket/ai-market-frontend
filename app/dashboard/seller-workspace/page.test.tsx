// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SellerWorkspaceApiError } from '@/api/sellerWorkspace';
import SellerWorkspacePage from './page';

const sellerWorkspaceApi = vi.hoisted(() => ({
  createIdempotencyKey: vi.fn(),
  createSellerWorkspaceConnection: vi.fn(),
  disconnectSellerWorkspaceConnection: vi.fn(),
  getSellerWorkspaceAuthorization: vi.fn(),
  getSellerWorkspaceCapabilities: vi.fn(),
  listSellerWorkspaceConnections: vi.fn(),
  rotateSellerWorkspaceConnection: vi.fn(),
  verifySellerWorkspaceConnection: vi.fn(),
}));

vi.mock('@/api/sellerWorkspace', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/sellerWorkspace')>()),
  ...sellerWorkspaceApi,
}));

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

const pendingConnection = {
  id: 'connection-1',
  provider: 'aws' as const,
  status: 'pending_authorization' as const,
  rotation_substate: 'none' as const,
  version: 1,
  provider_account_id: null,
  role_arn: null,
  bucket: null,
  prefix: null,
  region: null,
  authorization_expires_at: '2026-09-01T00:00:00Z',
  rotation_deadline: null,
  verified_at: null,
  rotated_at: null,
  revoked_at: null,
  disabled_at: null,
  expired_at: null,
  last_verification_status: null,
  redacted_error_code: null,
};

const authorization = {
  principal_arn: 'arn:aws:iam::123456789012:role/server-principal',
  external_id: 'server-external-id',
  trust_policy: { server: 'trust-policy-secret' },
  expires_at: '2026-09-01T00:00:00Z',
  expires_in_seconds: 60,
  purpose: 'aws_external_id' as const,
};

describe('SellerWorkspacePage safety boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sellerWorkspaceApi.createIdempotencyKey.mockImplementation(
      (operation: string) => `sw.${operation}.00000000-0000-4000-8000-000000000000`
    );
    sellerWorkspaceApi.getSellerWorkspaceCapabilities.mockResolvedValue(enabledCapabilities);
    sellerWorkspaceApi.listSellerWorkspaceConnections.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('clears initial authorization material when its server deadline passes', async () => {
    const now = new Date('2026-08-31T23:00:00Z');
    sellerWorkspaceApi.createSellerWorkspaceConnection.mockResolvedValue({
      connection: pendingConnection,
      authorization: { ...authorization, expires_at: '2026-08-31T23:01:00Z' },
    });

    render(<SellerWorkspacePage />);
    const createButton = await screen.findByRole('button', { name: 'Add AWS connection' });
    vi.useFakeTimers();
    vi.setSystemTime(now);

    await act(async () => {
      fireEvent.click(createButton);
    });
    expect(screen.getByText('server-external-id')).not.toBeNull();
    expect(screen.getByText(/trust-policy-secret/)).not.toBeNull();

    act(() => vi.advanceTimersByTime(59_999));
    expect(screen.getByText('server-external-id')).not.toBeNull();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText('server-external-id')).toBeNull();
    expect(screen.queryByText(/trust-policy-secret/)).toBeNull();
  });

  it('clears rotation authorization material when its server deadline passes', async () => {
    const now = new Date('2026-08-31T23:00:00Z');
    const verifiedConnection = {
      ...pendingConnection,
      status: 'verified' as const,
      role_arn: 'arn:aws:iam::123456789012:role/seller-data',
      bucket: 'seller-bucket',
      prefix: 'bounded/data',
      region: 'eu-west-1',
    };
    sellerWorkspaceApi.listSellerWorkspaceConnections.mockResolvedValue([verifiedConnection]);
    sellerWorkspaceApi.rotateSellerWorkspaceConnection.mockResolvedValue({
      connection: { ...verifiedConnection, rotation_substate: 'pending_verification' },
      authorization: {
        ...authorization,
        expires_at: '2026-08-31T23:01:00Z',
        purpose: 'aws_external_id_rotation',
      },
    });

    render(<SellerWorkspacePage />);
    const rotateButton = await screen.findByRole('button', { name: 'Start reconnect / rotation' });
    vi.useFakeTimers();
    vi.setSystemTime(now);

    await act(async () => {
      fireEvent.click(rotateButton);
    });
    expect(screen.getByText('server-external-id')).not.toBeNull();
    expect(screen.getByText(/trust-policy-secret/)).not.toBeNull();

    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.queryByText('server-external-id')).toBeNull();
    expect(screen.queryByText(/trust-policy-secret/)).toBeNull();
  });

  it.each([
    ['far ahead', '2040-01-01T00:00:00Z'],
    ['far behind', '2000-01-01T00:00:00Z'],
  ])('ignores a browser wall clock that is %s', async (_description, browserTime) => {
    sellerWorkspaceApi.createSellerWorkspaceConnection.mockResolvedValue({
      connection: pendingConnection,
      authorization: { ...authorization, expires_in_seconds: 1 },
    });

    render(<SellerWorkspacePage />);
    const createButton = await screen.findByRole('button', { name: 'Add AWS connection' });
    vi.useFakeTimers();
    vi.setSystemTime(new Date(browserTime));

    await act(async () => {
      fireEvent.click(createButton);
    });
    expect(screen.getByText('server-external-id')).not.toBeNull();

    act(() => vi.advanceTimersByTime(999));
    expect(screen.getByText('server-external-id')).not.toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText('server-external-id')).toBeNull();
  });

  it('chains timers beyond the browser maximum timeout without expiring early', async () => {
    const ttlSeconds = 2_147_489;
    sellerWorkspaceApi.createSellerWorkspaceConnection.mockResolvedValue({
      connection: pendingConnection,
      authorization: { ...authorization, expires_in_seconds: ttlSeconds },
    });

    render(<SellerWorkspacePage />);
    const createButton = await screen.findByRole('button', { name: 'Add AWS connection' });
    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(createButton);
    });

    act(() => vi.advanceTimersByTime(2_147_483_647));
    expect(screen.getByText('server-external-id')).not.toBeNull();
    act(() => vi.advanceTimersByTime(ttlSeconds * 1000 - 2_147_483_647 - 1));
    expect(screen.getByText('server-external-id')).not.toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText('server-external-id')).toBeNull();
  });

  it.each(['visibilitychange', 'focus'])('rechecks an elapsed deadline on %s', async (eventName) => {
    let monotonicTime = 1_000;
    vi.spyOn(performance, 'now').mockImplementation(() => monotonicTime);
    sellerWorkspaceApi.createSellerWorkspaceConnection.mockResolvedValue({
      connection: pendingConnection,
      authorization: { ...authorization, expires_in_seconds: 60 },
    });

    render(<SellerWorkspacePage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add AWS connection' }));
    await screen.findByText('server-external-id');

    monotonicTime = 61_001;
    act(() => {
      if (eventName === 'visibilitychange') document.dispatchEvent(new Event(eventName));
      else window.dispatchEvent(new Event(eventName));
    });
    expect(screen.queryByText('server-external-id')).toBeNull();
  });

  it('enables no action when the server capability is unavailable', async () => {
    sellerWorkspaceApi.getSellerWorkspaceCapabilities.mockResolvedValue({
      ...enabledCapabilities,
      master: { enabled: false, status: 'disabled', reason: 'disabled_by_default' },
    });

    render(<SellerWorkspacePage />);

    await screen.findByRole('heading', { name: 'AWS connections are unavailable' });
    expect(sellerWorkspaceApi.listSellerWorkspaceConnections).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Add AWS connection' })).toBeNull();
  });

  it('keeps an expired pending connection terminal with no verification path', async () => {
    sellerWorkspaceApi.listSellerWorkspaceConnections.mockResolvedValue([
      {
        ...pendingConnection,
        status: 'expired',
        expired_at: '2026-08-31T00:00:00Z',
      },
    ]);

    render(<SellerWorkspacePage />);

    await screen.findByText('Expired');
    expect(screen.getByText(/expired and cannot be verified/i)).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Open setup values' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Verify AWS connection' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Disconnect' })).toBeNull();
    expect(sellerWorkspaceApi.getSellerWorkspaceAuthorization).not.toHaveBeenCalled();
  });

  it('clears server authorization on every verify attempt and renders only a safe error', async () => {
    sellerWorkspaceApi.listSellerWorkspaceConnections.mockResolvedValue([pendingConnection]);
    sellerWorkspaceApi.getSellerWorkspaceAuthorization.mockResolvedValue(authorization);
    sellerWorkspaceApi.verifySellerWorkspaceConnection.mockRejectedValue(
      new Error('unsafe provider AccessDenied ExternalId=raw-secret')
    );

    render(<SellerWorkspacePage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open setup values' }));
    await screen.findByText('server-external-id');

    fireEvent.change(screen.getByLabelText('Role ARN'), {
      target: { value: 'arn:aws:iam::123456789012:role/seller-data' },
    });
    fireEvent.change(screen.getByLabelText('Bucket'), { target: { value: 'seller-bucket' } });
    fireEvent.change(screen.getByLabelText('Non-root prefix'), {
      target: { value: '/bounded/data/' },
    });
    fireEvent.change(screen.getByLabelText('AWS region'), { target: { value: 'eu-west-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify AWS connection' }));

    await screen.findByText('The action could not be completed. Try again.');
    expect(screen.queryByText('server-external-id')).toBeNull();
    expect(screen.queryByText(/trust-policy-secret/)).toBeNull();
    expect(screen.queryByText(/AccessDenied|raw-secret/)).toBeNull();
    expect(sellerWorkspaceApi.verifySellerWorkspaceConnection).toHaveBeenCalledWith(
      'connection-1',
      {
        role_arn: 'arn:aws:iam::123456789012:role/seller-data',
        bucket: 'seller-bucket',
        prefix: 'bounded/data',
        region: 'eu-west-1',
      },
      'sw.verify-connection-1.00000000-0000-4000-8000-000000000000'
    );
  });

  it.each(['foo*', 'foo?bar', '${aws:username}/data'])(
    'rejects IAM wildcard or variable prefix %s before any provider request',
    async (prefix) => {
      sellerWorkspaceApi.listSellerWorkspaceConnections.mockResolvedValue([pendingConnection]);
      sellerWorkspaceApi.getSellerWorkspaceAuthorization.mockResolvedValue(authorization);

      render(<SellerWorkspacePage />);
      fireEvent.click(await screen.findByRole('button', { name: 'Open setup values' }));
      await screen.findByText('server-external-id');
      fireEvent.change(screen.getByLabelText('Role ARN'), {
        target: { value: 'arn:aws:iam::123456789012:role/seller-data' },
      });
      fireEvent.change(screen.getByLabelText('Bucket'), { target: { value: 'seller-bucket' } });
      fireEvent.change(screen.getByLabelText('Non-root prefix'), { target: { value: prefix } });
      fireEvent.change(screen.getByLabelText('AWS region'), { target: { value: 'eu-west-1' } });
      fireEvent.click(screen.getByRole('button', { name: 'Verify AWS connection' }));

      expect(await screen.findByText('Prefix must identify a bounded, non-root S3 location.')).not.toBeNull();
      expect(sellerWorkspaceApi.verifySellerWorkspaceConnection).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['definitive failure', new SellerWorkspaceApiError('verification_failed'), false],
    ['unknown outcome', new Error('transport outcome unknown'), true],
  ])('uses the correct verification key after a %s', async (_description, failure, reuseKey) => {
    let keyNumber = 0;
    sellerWorkspaceApi.createIdempotencyKey.mockImplementation(
      (operation: string) => `sw.${operation}.00000000-0000-4000-8000-${String(++keyNumber).padStart(12, '0')}`
    );
    sellerWorkspaceApi.listSellerWorkspaceConnections.mockResolvedValue([pendingConnection]);
    sellerWorkspaceApi.getSellerWorkspaceAuthorization.mockResolvedValue(authorization);
    sellerWorkspaceApi.verifySellerWorkspaceConnection
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce({
        connection: { ...pendingConnection, status: 'verified' },
        replayed: false,
      });

    render(<SellerWorkspacePage />);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      fireEvent.click(await screen.findByRole('button', { name: 'Open setup values' }));
      await screen.findByText('server-external-id');
      fireEvent.change(screen.getByLabelText('Role ARN'), {
        target: { value: 'arn:aws:iam::123456789012:role/seller-data' },
      });
      fireEvent.change(screen.getByLabelText('Bucket'), { target: { value: 'seller-bucket' } });
      fireEvent.change(screen.getByLabelText('Non-root prefix'), {
        target: { value: 'bounded/data' },
      });
      fireEvent.change(screen.getByLabelText('AWS region'), { target: { value: 'eu-west-1' } });
      fireEvent.click(screen.getByRole('button', { name: 'Verify AWS connection' }));
      await waitFor(() =>
        expect(sellerWorkspaceApi.verifySellerWorkspaceConnection).toHaveBeenCalledTimes(attempt + 1)
      );
      if (attempt === 0) await screen.findByText(/could not be completed|could not verify/);
    }

    const firstKey = sellerWorkspaceApi.verifySellerWorkspaceConnection.mock.calls[0][2];
    const secondKey = sellerWorkspaceApi.verifySellerWorkspaceConnection.mock.calls[1][2];
    expect(secondKey === firstKey).toBe(reuseKey);
  });

  it('uses a new idempotency key when the seller corrects a failed verification scope', async () => {
    let keyNumber = 0;
    sellerWorkspaceApi.createIdempotencyKey.mockImplementation(
      (operation: string) => `sw.${operation}.00000000-0000-4000-8000-${String(++keyNumber).padStart(12, '0')}`
    );
    sellerWorkspaceApi.listSellerWorkspaceConnections.mockResolvedValue([pendingConnection]);
    sellerWorkspaceApi.getSellerWorkspaceAuthorization.mockResolvedValue(authorization);
    sellerWorkspaceApi.verifySellerWorkspaceConnection
      .mockRejectedValueOnce(new Error('safe failure'))
      .mockResolvedValueOnce({
        connection: { ...pendingConnection, status: 'verified' },
        replayed: false,
      });

    render(<SellerWorkspacePage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open setup values' }));
    await screen.findByText('server-external-id');

    fireEvent.change(screen.getByLabelText('Role ARN'), {
      target: { value: 'arn:aws:iam::123456789012:role/seller-data' },
    });
    fireEvent.change(screen.getByLabelText('Bucket'), { target: { value: 'first-bucket' } });
    fireEvent.change(screen.getByLabelText('Non-root prefix'), {
      target: { value: 'bounded/data' },
    });
    fireEvent.change(screen.getByLabelText('AWS region'), { target: { value: 'eu-west-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify AWS connection' }));
    await screen.findByText('The action could not be completed. Try again.');

    fireEvent.click(screen.getByRole('button', { name: 'Open setup values' }));
    await screen.findByText('server-external-id');
    fireEvent.change(screen.getByLabelText('Role ARN'), {
      target: { value: 'arn:aws:iam::123456789012:role/seller-data' },
    });
    fireEvent.change(screen.getByLabelText('Bucket'), { target: { value: 'corrected-bucket' } });
    fireEvent.change(screen.getByLabelText('Non-root prefix'), {
      target: { value: 'bounded/data' },
    });
    fireEvent.change(screen.getByLabelText('AWS region'), { target: { value: 'eu-west-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify AWS connection' }));

    await waitFor(() => expect(sellerWorkspaceApi.verifySellerWorkspaceConnection).toHaveBeenCalledTimes(2));
    expect(sellerWorkspaceApi.verifySellerWorkspaceConnection.mock.calls[0][2]).not.toBe(
      sellerWorkspaceApi.verifySellerWorkspaceConnection.mock.calls[1][2]
    );
  });

  it('clears server authorization on rotation completion even when completion fails', async () => {
    sellerWorkspaceApi.listSellerWorkspaceConnections.mockResolvedValue([
      {
        ...pendingConnection,
        status: 'verified',
        rotation_substate: 'pending_verification',
        role_arn: 'arn:aws:iam::123456789012:role/seller-data',
        bucket: 'seller-bucket',
        prefix: 'bounded/data',
        region: 'eu-west-1',
      },
    ]);
    sellerWorkspaceApi.getSellerWorkspaceAuthorization.mockResolvedValue({
      ...authorization,
      purpose: 'aws_external_id_rotation',
    });
    sellerWorkspaceApi.rotateSellerWorkspaceConnection.mockRejectedValue(
      new Error('unsafe provider rotation payload')
    );

    render(<SellerWorkspacePage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Resume reconnect / rotation' }));
    await screen.findByText('server-external-id');
    fireEvent.click(screen.getByRole('button', { name: 'Complete reconnect / rotation' }));

    await waitFor(() => {
      expect(screen.queryByText('server-external-id')).toBeNull();
    });
    expect(screen.getByText('The action could not be completed. Try again.')).not.toBeNull();
    expect(screen.queryByText(/rotation payload/)).toBeNull();
  });

  it.each([
    ['definitive failure', new SellerWorkspaceApiError('verification_failed'), false],
    ['unknown outcome', new Error('transport outcome unknown'), true],
  ])('uses the correct rotation completion key after a %s', async (_description, failure, reuseKey) => {
    let keyNumber = 0;
    sellerWorkspaceApi.createIdempotencyKey.mockImplementation(
      (operation: string) => `sw.${operation}.00000000-0000-4000-8000-${String(++keyNumber).padStart(12, '0')}`
    );
    const rotatingConnection = {
      ...pendingConnection,
      status: 'verified' as const,
      rotation_substate: 'pending_verification' as const,
      role_arn: 'arn:aws:iam::123456789012:role/seller-data',
      bucket: 'seller-bucket',
      prefix: 'bounded/data',
      region: 'eu-west-1',
    };
    sellerWorkspaceApi.listSellerWorkspaceConnections.mockResolvedValue([rotatingConnection]);
    sellerWorkspaceApi.getSellerWorkspaceAuthorization.mockResolvedValue({
      ...authorization,
      purpose: 'aws_external_id_rotation',
    });
    sellerWorkspaceApi.rotateSellerWorkspaceConnection
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce({ connection: rotatingConnection, replayed: false });

    render(<SellerWorkspacePage />);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      fireEvent.click(await screen.findByRole('button', { name: 'Resume reconnect / rotation' }));
      await screen.findByText('server-external-id');
      fireEvent.click(screen.getByRole('button', { name: 'Complete reconnect / rotation' }));
      await waitFor(() =>
        expect(sellerWorkspaceApi.rotateSellerWorkspaceConnection).toHaveBeenCalledTimes(attempt + 1)
      );
      if (attempt === 0) await screen.findByText(/could not be completed|could not verify/);
    }

    const firstKey = sellerWorkspaceApi.rotateSellerWorkspaceConnection.mock.calls[0][2];
    const secondKey = sellerWorkspaceApi.rotateSellerWorkspaceConnection.mock.calls[1][2];
    expect(secondKey === firstKey).toBe(reuseKey);
  });
});
