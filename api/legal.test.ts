import { beforeEach, expect, it, vi } from 'vitest';
import { acceptTerms, getCurrentTerms, getTermsAcceptanceStatus } from './legal';

const client = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }));
vi.mock('./client', () => ({ api: client }));

const request = {
  scope: 'individual' as const,
  terms_version: '1.2', terms_hash_sha256: 'hash-1.2',
  signer_full_name: 'Ada Buyer', signer_title: 'Director', business_legal_name: 'Buyer Ltd',
  authority_ack: true, ack_box1: true, ack_box2: true, ack_box3: true,
};

beforeEach(() => { client.post.mockResolvedValue({ data: { accepted: true } }); });

it.each(['buyer', 'seller'] as const)('posts %s context', async (context) => {
  await acceptTerms(context === 'seller' ? { ...request, context } : request);
  expect(client.post).toHaveBeenCalledWith('/legal/terms/accept', { ...request, context });
});

it.each([
  ['1.1', '1.1', true], ['1.2', '1.1', false], ['1.2', '1.2', true], ['1.1', '1.2', false],
])('normalizes current %s and accepted %s to accepted=%s', async (current_version, accepted_version, accepted) => {
  client.get.mockResolvedValue({ data: { accepted, current_version, accepted_version } });
  expect(await getTermsAcceptanceStatus({ scope: 'individual' })).toEqual(expect.objectContaining({ accepted, current_version, accepted_version }));
});

it('refuses a stale acceptance even if the response also carries an accepted alias', async () => {
  client.get.mockResolvedValue({ data: { has_accepted: true, current_version: '1.2', accepted_version: '1.1' } });
  expect((await getTermsAcceptanceStatus({ scope: 'individual' })).accepted).toBe(false);
});

it('bypasses cached metadata and acceptance status using the fetch adapter', async () => {
  client.get.mockResolvedValue({ data: { terms_version: '1.2', accepted: false } });
  await getCurrentTerms();
  await getTermsAcceptanceStatus({ scope: 'individual' });
  expect(client.get).toHaveBeenCalledWith('/legal/terms/current', { adapter: 'fetch', fetchOptions: { cache: 'no-store' } });
  expect(client.get).toHaveBeenCalledWith('/legal/terms/acceptance-status', { params: { scope: 'individual' }, adapter: 'fetch', fetchOptions: { cache: 'no-store' } });
});
