import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './client';
import { gatewayVerificationError, E7_REFUSAL, gatewayVerificationLifecycle, getGatewayVerificationEpoch, getGatewayVerificationProbe, probeGatewayVerification, startGatewayVerification, verificationErrorCopy } from './dataVerificationGateway';
import type { GatewayVerificationStartCommand } from '@/types';
import { getAwsVerifierStatus, setupAwsVerifier, removeVerificationRunner, verificationRefusalCopy } from './dataVerificationGateway';
vi.mock('./client', () => ({ api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
const path = '/data-verification/gateway/listings/listing';
const start: GatewayVerificationStartCommand = {
  quote_id: 'quote', idempotency_key: 'attempt', preview_requested: false,
  publication_terms_acknowledged: true, corpus_consent_acknowledged: true,
  d6_description: { domain_class: 'software_technology', record_granularity: 'event', temporal_scope: 'current_snapshot', update_cadence: 'daily', intended_use_tags: [], known_limitation_tags: [] },
};
describe('gateway seller-session verification API', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(api.post).mockResolvedValue({ data: { probe_id: 'probe', state: 'queued' }, status: 202, headers: { 'retry-after': '7' } }); vi.mocked(api.get).mockResolvedValue({ data: { probe_id: 'probe', state: 'queued' }, status: 202, headers: { 'retry-after': '3' } }); });
  it('sends the exact probe command and retains Retry-After', async () => {
    const command = { confirm: true as const, preview_requested: false, idempotency_key: 'probe-attempt' };
    expect(await probeGatewayVerification('listing', command)).toEqual({ data: { probe_id: 'probe', state: 'queued' }, retryAfter: 7 });
    expect(api.post).toHaveBeenCalledWith(`${path}/probe`, command);
    await getGatewayVerificationProbe('listing', 'probe');
    expect(api.get).toHaveBeenCalledWith(`${path}/probes/probe`);
  });
  it('sends only the exact start command and uses the same key on retries', async () => {
    await startGatewayVerification('listing', start); await startGatewayVerification('listing', start);
    expect(vi.mocked(api.post).mock.calls).toEqual([[`${path}/start`, start], [`${path}/start`, start]]);
  });
  it('reads epoch status and sends the complete lifecycle binding with confirmation', async () => {
    await getGatewayVerificationEpoch('listing', 'epoch');
    expect(api.get).toHaveBeenCalledWith(`${path}/epochs/epoch`);
    for (const action of ['cancel', 'publish', 'decline', 'withdraw'] as const) {
      const command = { verification_id: 'epoch', listing_id: 'listing', source_handle_id: 'source', requested_action: action, confirm: true as const };
      await gatewayVerificationLifecycle('listing', command);
      expect(api.post).toHaveBeenLastCalledWith(`${path}/epochs/epoch/${action}`, command);
    }
  });
  it('encodes identifiers and bounds malformed retry headers', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: {}, headers: { 'retry-after': '-9' } });
    expect((await getGatewayVerificationProbe('a/b', 'c/d')).retryAfter).toBe(2);
    expect(api.get).toHaveBeenCalledWith('/data-verification/gateway/listings/a%2Fb/probes/c%2Fd');
  });
  it('parses string and object details without coercing malformed errors', () => {
    expect(gatewayVerificationError({ response: { status: 409, data: { detail: 'source_changed' } } })).toEqual({ status: 409, code: 'source_changed', epochId: undefined });
    expect(gatewayVerificationError({ response: { status: 409, data: { detail: { code: 'verification_in_progress', epoch_id: 'epoch' } } } })).toEqual({ status: 409, code: 'verification_in_progress', epochId: 'epoch' });
    for (const detail of [null, 42, {}, { code: 42, epoch_id: 42 }]) {
      expect(gatewayVerificationError({ response: { status: 409, data: { detail } } }).code).toBeUndefined();
    }
    expect(verificationErrorCopy({ response: { status: 409, data: { detail: { code: 'source_changed' } } } })).toBe('Your data has changed. Check your data again for a new quote.');
  });
  it('preserves E7 exactly and suppresses raw errors and ownership detail', () => {
    expect(verificationErrorCopy({ response: { status: 409, data: { detail: E7_REFUSAL } } })).toBe(E7_REFUSAL);
    expect(verificationErrorCopy({ response: { status: 404, data: { detail: 'unowned secret' } } })).toBe('This listing or verification is not available.');
    expect(verificationErrorCopy({ response: { status: 401 } })).toBe('Sign in to verify your data.');
    expect(verificationErrorCopy(new Error('private path'))).not.toContain('private path');
  });
});

describe('AWS seller-session setup/status and shared removal', () => {
  beforeEach(() => vi.clearAllMocks());
  it('uses only the scoped setup and explicit replacement commands', async () => {
    const data = { connection_id: 'connection', quick_create_url: 'https://console.aws.amazon.com/?param_RegistrationToken=secret', expires_at_utc: '2026-10-05T12:00:00Z', scanner_version: '1.2.3', image_digest: 'sha256:hash' };
    vi.mocked(api.post).mockResolvedValue({ data });
    expect(await setupAwsVerifier({ connection_id: 'connection' })).toEqual(data);
    expect(api.post).toHaveBeenLastCalledWith('/verification-runners/setup', { connection_id: 'connection' });
    await setupAwsVerifier({ connection_id: 'connection', replace_runner_id: 'old', confirm_replace: true });
    expect(api.post).toHaveBeenLastCalledWith('/verification-runners/setup', { connection_id: 'connection', replace_runner_id: 'old', confirm_replace: true });
  });
  it('reads exactly the listing status contract without a setup token', async () => {
    const data = { state: 'waiting', runner_id: null, region: 'eu-north-1', code_sha256: null, registered_at: null, last_seen_at: null, poll_interval_minutes: null, setup_expires_at: '2026-10-05T12:00:00Z' };
    vi.mocked(api.get).mockResolvedValue({ data });
    expect(await getAwsVerifierStatus('listing')).toEqual(data);
    expect(api.get).toHaveBeenCalledWith('/verification-runners/aws/status', { params: { listing_id: 'listing' } });
  });
  it.each(['aws-runner', 'gateway-runner'])('accepts DELETE 204 and sends confirm for %s', async runner => {
    vi.mocked(api.delete).mockResolvedValue({ status: 204, data: '' });
    expect(await removeVerificationRunner(runner)).toBeUndefined();
    expect(api.delete).toHaveBeenCalledWith(`/verification-runners/${runner}`, { data: { confirm: true } });
  });
  it.each([
    'verification_disabled', 'aws_connection_unavailable', 'aws_region_unsupported', 'aws_release_unavailable',
    'aws_source_scope_unrepresentable', 'replacement_runner_mismatch', 'replacement_confirmation_required',
    'aws_source_too_large', 'unsupported_type', 'listing_source_mismatch', 'aws_setup_refused',
    'registration_expired', 'registration_replayed', 'registration_refused',
  ])('explains %s without showing backend details', code => {
    const copy = verificationRefusalCopy(code);
    expect(copy).not.toBe('We could not complete this request. Try again.');
    expect(copy).not.toContain(code);
    expect(verificationErrorCopy({ response: { status: 409, data: { detail: code } } })).toBe(copy);
  });
  it('preserves the exact AWS size refusal', () => {
    expect(verificationRefusalCopy('aws_source_too_large')).toBe('This source is too large for the AWS verifier. Verify it with your own AIM Data gateway instead.');
  });
});
