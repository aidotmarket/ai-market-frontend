import { beforeEach, expect, it, vi } from 'vitest';
import { api } from './client';
import { decideConnectorRequest, getConnectorRequest } from './connector-oauth';
import { buyerPermissions, consentId, consentMetadata, sellerPermissions } from '@/tests/fixtures/connector-consent';

vi.mock('./client', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
beforeEach(() => vi.resetAllMocks());

it('parses the backend persona permission map and version while retaining requested scopes', async () => {
  vi.mocked(api.get).mockResolvedValue({ data: consentMetadata() });
  const result = await getConnectorRequest(consentId);
  expect(api.get).toHaveBeenCalledWith(`/connector-oauth/requests/${consentId}`);
  expect(result.scopes).toEqual(buyerPermissions);
  expect(result.tool_set_scopes).toEqual({ buyer: buyerPermissions, seller: sellerPermissions });
  expect(result.tool_sets).toEqual(['buyer', 'seller']);
  expect(result.seller_permissions_version).toBe(1);
});

const invalidMetadata = [
  { tool_set_scopes: undefined }, { tool_set_scopes: null }, { tool_set_scopes: [] },
  { tool_set_scopes: { buyer: buyerPermissions } },
  { tool_set_scopes: { seller: sellerPermissions } },
  { tool_set_scopes: { buyer: [], seller: sellerPermissions } },
  { tool_set_scopes: { buyer: buyerPermissions, seller: sellerPermissions.slice(1) } },
  { tool_set_scopes: { buyer: buyerPermissions, seller: [...sellerPermissions, sellerPermissions[0]] } },
  { tool_set_scopes: { buyer: buyerPermissions, seller: [...sellerPermissions.slice(1), { scope: 'unknown', description: 'Unknown' }] } },
  { tool_set_scopes: { buyer: buyerPermissions, seller: sellerPermissions.map(item => ({ ...item, description: '' })) } },
  { tool_set_scopes: { buyer: buyerPermissions, seller: sellerPermissions.map(item => ({ ...item, description: null })) } },
  { tool_set_scopes: { buyer: buyerPermissions, seller: sellerPermissions, unknown: [] } },
  { tool_sets: ['buyer'] }, { tool_sets: undefined },
  { seller_permissions_version: undefined }, { seller_permissions_version: 2 },
  { seller_permissions_version: '1' }, { seller_permissions_version: true },
];
it.each(invalidMetadata)('withholds Seller for incompatible metadata %j', async patch => {
  vi.mocked(api.get).mockResolvedValue({ data: { ...consentMetadata(), ...patch } });
  const result = await getConnectorRequest(consentId);
  expect(result.tool_sets ?? []).not.toContain('seller');
  expect(result.tool_set_scopes?.seller).toBeUndefined();
  expect(result.seller_permissions_version).toBeUndefined();
  expect(result.tool_set_scopes?.buyer).toEqual(buyerPermissions);
});

it.each([
  ['approve', 'seller', 1, { tool_set: 'seller', seller_permissions_version: 1 }],
  ['approve', 'buyer', 1, { tool_set: 'buyer' }],
  ['approve', undefined, 1, {}],
  ['deny', 'seller', 1, { tool_set: 'seller' }],
  ['deny', 'buyer', undefined, { tool_set: 'buyer' }],
] as const)('%s for %s serializes only the applicable version', async (decision, persona, version, fields) => {
  const url = `https://auth.ai.market/oauth/authorize/complete?request=${consentId}`;
  vi.mocked(api.post).mockResolvedValue({ data: { continue_url: url } });
  expect(await decideConnectorRequest(consentId, decision, 'org-1', 'nonce', persona, version)).toBe(url);
  expect(api.post).toHaveBeenCalledExactlyOnceWith(`/connector-oauth/requests/${consentId}/decision`, {
    decision, organization_id: 'org-1', csrf_nonce: 'nonce', ...fields,
  });
});

it.each([undefined, 0, 2])('prevents a Seller POST with version %s', async version => {
  await expect(decideConnectorRequest(consentId, 'approve', null, 'nonce', 'seller', version)).rejects.toThrow('seller_permissions_stale');
  expect(api.post).not.toHaveBeenCalled();
});

it('surfaces stale permission refusal without replaying the decision', async () => {
  const failure = { response: { status: 403, data: { code: 'seller_permissions_stale' } } };
  vi.mocked(api.post).mockRejectedValue(failure);
  await expect(decideConnectorRequest(consentId, 'approve', null, 'nonce', 'seller', 1)).rejects.toBe(failure);
  expect(api.post).toHaveBeenCalledOnce();
});
