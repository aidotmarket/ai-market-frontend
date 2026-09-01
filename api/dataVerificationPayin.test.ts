import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const client = vi.hoisted(() => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('@/api/client', () => client);

import {
  createDataVerificationPayInSetupSession,
  getDataVerificationPayInReadiness,
  isDataVerificationPayInNotFound,
  reconcileDataVerificationPayInSetupSession,
} from './dataVerificationPayin';

const attemptId = '123e4567-e89b-12d3-a456-426614174000';
const setupResponse = {
  version: 'data_verification_payin_setup_session_v1',
  setup_attempt_id: attemptId,
  checkout_url: 'https://checkout.stripe.com/c/pay/cs_test_value',
  expires_at: '2026-09-01T12:00:00Z',
};

describe('dataVerificationPayin API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses authenticated api/client for the exact readiness URL', async () => {
    const readiness = {
      version: 'data_verification_payin_readiness_v1',
      state: 'setup_required',
      can_start_setup: true,
      can_replace_payment_method: false,
      message: 'fixed',
    };
    client.api.get.mockResolvedValueOnce({ data: readiness });

    await expect(getDataVerificationPayInReadiness()).resolves.toEqual(readiness);
    expect(client.api.get).toHaveBeenCalledWith(
      '/data-verification/payment-method/readiness'
    );
  });

  it('sends the exact versioned setup body and reauth header', async () => {
    client.api.post.mockResolvedValueOnce({ data: setupResponse });

    await expect(createDataVerificationPayInSetupSession('fresh-setup-token')).resolves.toEqual(
      setupResponse
    );
    expect(client.api.post).toHaveBeenCalledWith(
      '/data-verification/payment-method/setup-sessions',
      { version: 'data_verification_payin_setup_v1' },
      { headers: { 'X-PayIn-Reauth': 'fresh-setup-token' } }
    );
  });

  it('sends the exact versioned reconcile body and fresh reauth header', async () => {
    const result = {
      version: 'data_verification_payin_reconcile_result_v1',
      state: 'ready',
      message: 'fixed',
    };
    client.api.post.mockResolvedValueOnce({ data: result });

    await expect(
      reconcileDataVerificationPayInSetupSession(attemptId, 'cs_test_value', 'fresh-return-token')
    ).resolves.toEqual(result);
    expect(client.api.post).toHaveBeenCalledWith(
      '/data-verification/payment-method/setup-sessions/reconcile',
      {
        version: 'data_verification_payin_reconcile_v1',
        setup_attempt_id: attemptId,
        checkout_session_id: 'cs_test_value',
      },
      { headers: { 'X-PayIn-Reauth': 'fresh-return-token' } }
    );
  });

  it('rejects wrong versions, unknown keys, invalid states, and inconsistent readiness booleans', async () => {
    const invalidReadiness = [
      {
        version: 'data_verification_payin_readiness_v2',
        state: 'setup_required',
        can_start_setup: true,
        can_replace_payment_method: false,
        message: 'fixed',
      },
      {
        version: 'data_verification_payin_readiness_v1',
        state: 'setup_required',
        can_start_setup: false,
        can_replace_payment_method: false,
        message: 'fixed',
      },
      {
        version: 'data_verification_payin_readiness_v1',
        state: 'unknown',
        can_start_setup: false,
        can_replace_payment_method: false,
        message: 'fixed',
      },
    ];

    for (const response of invalidReadiness) {
      client.api.get.mockResolvedValueOnce({ data: response });
      await expect(getDataVerificationPayInReadiness()).rejects.toThrow(
        'Invalid data-verification payment-method response.'
      );
    }

    for (const response of [
      { ...setupResponse, version: 'data_verification_payin_setup_session_v2' },
      { ...setupResponse, customer_id: 'hidden' },
      { ...setupResponse, expires_at: 'not-rfc3339' },
    ]) {
      client.api.post.mockResolvedValueOnce({ data: response });
      await expect(createDataVerificationPayInSetupSession('token')).rejects.toThrow(
        'Invalid data-verification payment-method response.'
      );
    }

    client.api.post.mockResolvedValueOnce({
      data: {
        version: 'data_verification_payin_reconcile_result_v2',
        state: 'ready',
        message: 'fixed',
      },
    });
    await expect(
      reconcileDataVerificationPayInSetupSession(attemptId, 'cs_test_value', 'token')
    ).rejects.toThrow('Invalid data-verification payment-method response.');
  });

  it('classifies readiness 404 without exposing response details', () => {
    expect(isDataVerificationPayInNotFound({ response: { status: 404 } })).toBe(true);
    expect(isDataVerificationPayInNotFound({ response: { status: 503 } })).toBe(false);
    expect(isDataVerificationPayInNotFound(new Error('network'))).toBe(false);
  });

  it('never imports the public lib/api transport', () => {
    const source = readFileSync(new URL('./dataVerificationPayin.ts', import.meta.url), 'utf8');
    expect(source).toContain("from '@/api/client'");
    expect(source).not.toMatch(/(?:from|import\s*\()\s*['\"]@\/lib\/api/);
  });
});
