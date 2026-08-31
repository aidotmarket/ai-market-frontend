import axios from 'axios';
import { api } from './client';

const BASE_PATH = '/seller-workspace';
const SAFE_IDEMPOTENCY_KEY = /^[a-z0-9][a-z0-9_.:-]{0,127}$/;

export type CapabilityStatus = 'available' | 'disabled' | 'unavailable';

export interface CapabilityStage {
  enabled: boolean;
  status: CapabilityStatus;
  reason: string;
}

export interface ProviderCapabilities {
  connect: CapabilityStage;
  profile: CapabilityStage;
  publish: CapabilityStage;
  delivery: CapabilityStage;
}

export interface SellerWorkspaceCapabilities {
  master: CapabilityStage;
  providers: {
    aws: ProviderCapabilities;
    r2: ProviderCapabilities;
  };
}

export type ConnectionStatus =
  | 'pending_authorization'
  | 'verified'
  | 'disabled'
  | 'revoked'
  | 'error'
  | 'expired';

export type RotationSubstate =
  | 'none'
  | 'pending_verification'
  | 'old_value_removal'
  | 'complete'
  | 'failed';

export interface SellerWorkspaceConnection {
  id: string;
  provider: 'aws';
  status: ConnectionStatus;
  rotation_substate: RotationSubstate;
  version: number;
  provider_account_id: string | null;
  role_arn: string | null;
  bucket: string | null;
  prefix: string | null;
  region: string | null;
  authorization_expires_at: string;
  rotation_deadline: string | null;
  verified_at: string | null;
  rotated_at: string | null;
  revoked_at: string | null;
  disabled_at: string | null;
  expired_at: string | null;
  last_verification_status: string | null;
  redacted_error_code: string | null;
}

export interface AWSAuthorization {
  principal_arn: string;
  external_id: string;
  trust_policy: Record<string, unknown>;
  expires_at: string;
  expires_in_seconds: number;
  purpose: 'aws_external_id' | 'aws_external_id_rotation';
}

export interface ConnectionCreateResponse {
  connection: SellerWorkspaceConnection;
  authorization: AWSAuthorization | null;
}

export interface ConnectionMutationResponse {
  connection: SellerWorkspaceConnection;
  replayed: boolean;
}

export interface ConnectionVerifyRequest {
  role_arn: string;
  bucket: string;
  prefix: string;
  region: string;
}

export type SellerWorkspaceErrorCode =
  | 'authentication_required'
  | 'active_seller_required'
  | 'unavailable'
  | 'authorization_expired'
  | 'invalid_scope'
  | 'verification_failed'
  | 'rate_limited'
  | 'conflict'
  | 'not_found'
  | 'unknown';

export class SellerWorkspaceApiError extends Error {
  constructor(public readonly code: SellerWorkspaceErrorCode) {
    super(code);
    this.name = 'SellerWorkspaceApiError';
  }
}

function safeError(error: unknown): SellerWorkspaceApiError {
  if (error instanceof SellerWorkspaceApiError) return error;
  if (!axios.isAxiosError(error)) return new SellerWorkspaceApiError('unknown');

  const status = error.response?.status;
  const detail = error.response?.data?.detail;
  if (status === 401) return new SellerWorkspaceApiError('authentication_required');
  if (status === 403) return new SellerWorkspaceApiError('active_seller_required');
  if (status === 404) return new SellerWorkspaceApiError('not_found');
  if (status === 429) return new SellerWorkspaceApiError('rate_limited');
  if (status === 503) return new SellerWorkspaceApiError('unavailable');
  if (status === 409 && detail === 'Connection authorization is unavailable') {
    return new SellerWorkspaceApiError('authorization_expired');
  }
  if (status === 409) return new SellerWorkspaceApiError('conflict');
  if (status === 422 && detail === 'Connection scope is invalid') {
    return new SellerWorkspaceApiError('invalid_scope');
  }
  if (status === 422) return new SellerWorkspaceApiError('verification_failed');
  return new SellerWorkspaceApiError('unknown');
}

async function safely<T>(request: Promise<{ data: T }>): Promise<T> {
  try {
    return (await request).data;
  } catch (error) {
    throw safeError(error);
  }
}

function mutationHeaders(idempotencyKey: string) {
  if (!SAFE_IDEMPOTENCY_KEY.test(idempotencyKey)) {
    throw new SellerWorkspaceApiError('unavailable');
  }
  return { 'Idempotency-Key': idempotencyKey };
}

export function createIdempotencyKey(operation: string): string {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (!randomUUID) {
    throw new SellerWorkspaceApiError('unavailable');
  }
  const uuid = randomUUID.call(globalThis.crypto).toLowerCase();
  const maxOperationLength = 128 - 'sw..'.length - uuid.length;
  const safeOperation = operation
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]/g, '-')
    .slice(0, maxOperationLength);
  const key = `sw.${safeOperation}.${uuid}`;
  if (!safeOperation || !SAFE_IDEMPOTENCY_KEY.test(key)) {
    throw new SellerWorkspaceApiError('unavailable');
  }
  return key;
}

export function isAWSConnectionAvailable(capabilities: SellerWorkspaceCapabilities): boolean {
  const connect = capabilities?.providers?.aws?.connect;
  return (
    capabilities?.master?.enabled === true &&
    capabilities.master.status === 'available' &&
    connect?.enabled === true &&
    connect.status === 'available'
  );
}

export function getSellerWorkspaceCapabilities(): Promise<SellerWorkspaceCapabilities> {
  return safely(api.get(`${BASE_PATH}/capabilities`));
}

export async function listSellerWorkspaceConnections(): Promise<SellerWorkspaceConnection[]> {
  const response = await safely<{ connections: SellerWorkspaceConnection[] }>(
    api.get(`${BASE_PATH}/connections`)
  );
  return response.connections;
}

export function createSellerWorkspaceConnection(
  idempotencyKey: string
): Promise<ConnectionCreateResponse> {
  return safely(
    api.post(`${BASE_PATH}/connections`, { provider: 'aws' }, {
      headers: mutationHeaders(idempotencyKey),
    })
  );
}

export function getSellerWorkspaceAuthorization(connectionId: string): Promise<AWSAuthorization> {
  return safely(api.get(`${BASE_PATH}/connections/${connectionId}/authorization`));
}

export function verifySellerWorkspaceConnection(
  connectionId: string,
  scope: ConnectionVerifyRequest,
  idempotencyKey: string
): Promise<ConnectionMutationResponse> {
  return safely(
    api.post(`${BASE_PATH}/connections/${connectionId}/verify`, scope, {
      headers: mutationHeaders(idempotencyKey),
    })
  );
}

export function rotateSellerWorkspaceConnection(
  connectionId: string,
  action: 'start' | 'complete',
  idempotencyKey: string
): Promise<ConnectionCreateResponse> {
  return safely(
    api.post(`${BASE_PATH}/connections/${connectionId}/rotate`, { action }, {
      headers: mutationHeaders(idempotencyKey),
    })
  );
}

export function disconnectSellerWorkspaceConnection(
  connectionId: string,
  idempotencyKey: string
): Promise<ConnectionMutationResponse> {
  return safely(
    api.post(`${BASE_PATH}/connections/${connectionId}/disconnect`, undefined, {
      headers: mutationHeaders(idempotencyKey),
    })
  );
}
