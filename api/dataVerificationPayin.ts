'use client';

import { api } from '@/api/client';
import type {
  DataVerificationPayInReadinessState,
  DataVerificationPayInReadinessV1,
  DataVerificationPayInReconcileResultV1,
  DataVerificationPayInSetupCreateV1,
  DataVerificationPayInSetupReconcileV1,
  DataVerificationPayInSetupSessionV1,
} from '@/types';

const READINESS_PATH = '/data-verification/payment-method/readiness';
const SETUP_PATH = '/data-verification/payment-method/setup-sessions';
const RECONCILE_PATH = '/data-verification/payment-method/setup-sessions/reconcile';
const REAUTH_HEADER = 'X-PayIn-Reauth';

const UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const CHECKOUT_SESSION_PATTERN = /^cs_[A-Za-z0-9_]+$/;
const RFC3339_UTC_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|\+00:00)$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === expected.length && expected.every((key) => actual.includes(key));
}

function invalidResponse(): never {
  throw new Error('Invalid data-verification payment-method response.');
}

function parseReadiness(value: unknown): DataVerificationPayInReadinessV1 {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'version',
      'state',
      'can_start_setup',
      'can_replace_payment_method',
      'message',
    ]) ||
    value.version !== 'data_verification_payin_readiness_v1' ||
    typeof value.state !== 'string' ||
    typeof value.can_start_setup !== 'boolean' ||
    typeof value.can_replace_payment_method !== 'boolean' ||
    typeof value.message !== 'string'
  ) {
    return invalidResponse();
  }

  const expectedBooleans: Record<DataVerificationPayInReadinessState, readonly [boolean, boolean]> = {
    setup_required: [true, false],
    setup_pending: [false, false],
    ready: [false, true],
    blocked: [false, false],
  };
  if (!(value.state in expectedBooleans)) return invalidResponse();

  const state = value.state as DataVerificationPayInReadinessState;
  const expected = expectedBooleans[state];
  if (
    value.can_start_setup !== expected[0] ||
    value.can_replace_payment_method !== expected[1]
  ) {
    return invalidResponse();
  }

  return value as unknown as DataVerificationPayInReadinessV1;
}

function parseSetupSession(value: unknown): DataVerificationPayInSetupSessionV1 {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'version',
      'setup_attempt_id',
      'checkout_url',
      'expires_at',
    ]) ||
    value.version !== 'data_verification_payin_setup_session_v1' ||
    typeof value.setup_attempt_id !== 'string' ||
    !UUID_PATTERN.test(value.setup_attempt_id) ||
    typeof value.checkout_url !== 'string' ||
    value.checkout_url.length === 0 ||
    typeof value.expires_at !== 'string' ||
    !RFC3339_UTC_PATTERN.test(value.expires_at) ||
    !Number.isFinite(Date.parse(value.expires_at))
  ) {
    return invalidResponse();
  }
  return value as unknown as DataVerificationPayInSetupSessionV1;
}

function parseReconcileResult(value: unknown): DataVerificationPayInReconcileResultV1 {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['version', 'state', 'message']) ||
    value.version !== 'data_verification_payin_reconcile_result_v1' ||
    typeof value.state !== 'string' ||
    !['ready', 'pending', 'failed'].includes(value.state) ||
    typeof value.message !== 'string'
  ) {
    return invalidResponse();
  }
  return value as unknown as DataVerificationPayInReconcileResultV1;
}

export function isOpaqueSetupAttemptId(value: string | null): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function isOpaqueCheckoutSessionId(value: string | null): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 4 &&
    value.length <= 255 &&
    CHECKOUT_SESSION_PATTERN.test(value)
  );
}

export function isDataVerificationPayInNotFound(error: unknown): boolean {
  if (!isRecord(error)) return false;
  const response = error.response;
  return isRecord(response) && response.status === 404;
}

export async function getDataVerificationPayInReadiness(): Promise<DataVerificationPayInReadinessV1> {
  const response = await api.get<unknown>(READINESS_PATH);
  return parseReadiness(response.data);
}

export async function createDataVerificationPayInSetupSession(
  reauthToken: string
): Promise<DataVerificationPayInSetupSessionV1> {
  const body: DataVerificationPayInSetupCreateV1 = {
    version: 'data_verification_payin_setup_v1',
  };
  const response = await api.post<unknown>(SETUP_PATH, body, {
    headers: { [REAUTH_HEADER]: reauthToken },
  });
  return parseSetupSession(response.data);
}

export async function reconcileDataVerificationPayInSetupSession(
  setupAttemptId: string,
  checkoutSessionId: string,
  reauthToken: string
): Promise<DataVerificationPayInReconcileResultV1> {
  const body: DataVerificationPayInSetupReconcileV1 = {
    version: 'data_verification_payin_reconcile_v1',
    setup_attempt_id: setupAttemptId,
    checkout_session_id: checkoutSessionId,
  };
  const response = await api.post<unknown>(RECONCILE_PATH, body, {
    headers: { [REAUTH_HEADER]: reauthToken },
  });
  return parseReconcileResult(response.data);
}
