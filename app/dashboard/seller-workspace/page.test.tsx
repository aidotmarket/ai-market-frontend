// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
});
