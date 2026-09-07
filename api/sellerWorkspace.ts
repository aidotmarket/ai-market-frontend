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
  drafts?: CapabilityStage | null;
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
  | 'verification_outcome_unknown'
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
  if (status === 503 && detail === 'Connection verification outcome is unknown') {
    return new SellerWorkspaceApiError('verification_outcome_unknown');
  }
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

export function isAWSProfilingAvailable(capabilities: SellerWorkspaceCapabilities): boolean {
  const profile = capabilities?.providers?.aws?.profile;
  return capabilities?.master?.enabled === true && capabilities.master.status === 'available'
    && profile?.enabled === true && profile.status === 'available';
}

export interface WorkspaceObject {
  key: string;
  version_id: string | null;
  etag: string;
  size: number;
  last_modified: string;
  format_candidate: 'csv' | 'tsv' | 'json' | 'jsonl' | 'parquet' | 'unknown';
}

export interface WorkspaceProfileJob {
  id: string;
  connection_id: string;
  runtime_id: string;
  state: 'queued' | 'starting' | 'running' | 'validating_result' | 'cancel_requested' | 'succeeded' | 'failed' | 'cancelled' | 'expired';
  version: number;
  attempt: number;
  objects_completed: number;
  source_bytes_read: number;
  rows_examined: number;
  field_records_emitted: number;
  safe_failure_code: string | null;
  evidence_ref: string | null;
}

export interface WorkspaceProfileEvidence {
  id: string;
  result: {
    semantic_evidence: {
      observed: { objects_completed: number; rows_examined: number; source_bytes_read: number; truncated: boolean; truncation_reasons: string[] };
      objects: Array<{
        object_ref: string;
        format: string;
        size: number;
        warning_codes: string[];
        fields: Array<{
          position: string;
          physical_type: string;
          non_null_count: number;
          null_count: number;
          pii_classes: string[];
          quality_flags: string[];
        }>;
      }>;
    };
  };
}

export function listWorkspaceObjects(connectionId: string, prefix: string, cursor?: string) {
  return safely<{ objects: WorkspaceObject[]; next_cursor: string | null }>(api.get(
    `${BASE_PATH}/connections/${encodeURIComponent(connectionId)}/objects`,
    { params: { prefix, version_mode: 'current', limit: 100, ...(cursor ? { cursor } : {}) } }
  ));
}

export function listWorkspaceProfileJobs(cursor?: string) {
  return safely<{ jobs: WorkspaceProfileJob[]; next_cursor: string | null }>(api.get(
    `${BASE_PATH}/profile-jobs`, { params: { limit: 50, ...(cursor ? { cursor } : {}) } }
  ));
}

export function cancelWorkspaceProfileJob(job: WorkspaceProfileJob, idempotencyKey: string) {
  return safely<WorkspaceProfileJob>(api.post(`${BASE_PATH}/profile-jobs/${encodeURIComponent(job.id)}/cancel`,
    { expected_version: job.version }, { headers: mutationHeaders(idempotencyKey) }));
}

export function getWorkspaceProfileEvidence(evidenceId: string) {
  return safely<WorkspaceProfileEvidence>(api.get(`${BASE_PATH}/profile-evidence/${encodeURIComponent(evidenceId)}`));
}
