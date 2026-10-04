import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './client';
import { E7_REFUSAL, gatewayVerificationLifecycle, getGatewayVerificationEpoch, getGatewayVerificationProbe, probeGatewayVerification, startGatewayVerification, verificationErrorCopy } from './dataVerificationGateway';
import type { GatewayVerificationStartCommand } from '@/types';
vi.mock('./client', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
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
  it('preserves E7 exactly and suppresses raw errors and ownership detail', () => {
    expect(verificationErrorCopy({ response: { status: 409, data: { detail: E7_REFUSAL } } })).toBe(E7_REFUSAL);
    expect(verificationErrorCopy({ response: { status: 404, data: { detail: 'unowned secret' } } })).toBe('This listing or verification is not available.');
    expect(verificationErrorCopy({ response: { status: 401 } })).toBe('Sign in to verify your data.');
    expect(verificationErrorCopy(new Error('private path'))).not.toContain('private path');
  });
});
