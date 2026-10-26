import { beforeEach, expect, it, vi } from 'vitest';
import { api } from './client';
import { decideConnectorRequest, getConnectorRequest } from './connector-oauth';
import { buyerPermissions, requestedBuyerPermissions, invalidBuyerMetadata, consentId, consentMetadata, sellerPermissions } from '@/tests/fixtures/connector-consent';

vi.mock('./client', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
beforeEach(() => vi.resetAllMocks());

it('parses effective Buyer permissions and both versions while retaining requested scopes', async () => {
  vi.mocked(api.get).mockResolvedValue({ data: consentMetadata() });
  const result = await getConnectorRequest(consentId);
  expect(api.get).toHaveBeenCalledWith(`/connector-oauth/requests/${consentId}`);
  expect(result.scopes).toEqual(requestedBuyerPermissions);
  expect(result.tool_set_scopes).toEqual({ buyer: buyerPermissions, seller: sellerPermissions });
  expect(result.tool_sets).toEqual(['buyer', 'seller']);
  expect(result.seller_permissions_version).toBe(1);
  expect(result.buyer_permissions_version).toBe(1);
});

it.each([
  { requested: ['account.read'] }, { requested: ['market.read'] }, { requested: ['buyer.write'] },
  { requested: ['orders.read', 'orders.write'] },
  { requested: ['account.read', 'market.read', 'buyer.write', 'orders.read', 'orders.write'] },
])('accepts exactly the requested Buyer subset plus buyer.write: $requested', async ({ requested }) => {
  const scopes = requested.map(scope => ({ scope, description: `Permission: ${scope}` }));
  const effective = [...new Set([...requested, 'buyer.write'])].map(scope => ({ scope, description: `Effective: ${scope}` }));
  vi.mocked(api.get).mockResolvedValue({ data: { ...consentMetadata(), scopes, tool_set_scopes: { buyer: effective } } });
  const result = await getConnectorRequest(consentId);
  expect(result.scopes).toEqual(scopes);
  expect(result.tool_set_scopes?.buyer).toEqual(effective);
  expect(result.buyer_permissions_version).toBe(1);
});

it.each(invalidBuyerMetadata)('withholds Buyer approval for incompatible metadata %j', async patch => {
  vi.mocked(api.get).mockResolvedValue({ data: { ...consentMetadata(), ...patch } });
  const result = await getConnectorRequest(consentId);
  expect(result.tool_set_scopes?.buyer).toBeUndefined();
  expect(result.buyer_permissions_version).toBeUndefined();
});

it.each([
  { tool_set_scopes: { buyer: buyerPermissions } },
  { tool_set_scopes: { buyer: buyerPermissions, seller: sellerPermissions.slice(1) } },
  { tool_set_scopes: { buyer: buyerPermissions, seller: [...sellerPermissions, sellerPermissions[0]] } },
  { tool_set_scopes: { buyer: buyerPermissions, seller: sellerPermissions.map(item => ({ ...item, description: '' })) } },
  { tool_sets: ['buyer'] }, { tool_sets: undefined },
  { seller_permissions_version: undefined }, { seller_permissions_version: 2 },
  { seller_permissions_version: '1' }, { seller_permissions_version: true },
])('withholds incompatible Seller offers without changing Buyer permissions: %j', async patch => {
  vi.mocked(api.get).mockResolvedValue({ data: { ...consentMetadata(), ...patch } });
  const result = await getConnectorRequest(consentId);
  expect(result.tool_sets ?? []).not.toContain('seller');
  expect(result.tool_set_scopes?.seller).toBeUndefined();
  expect(result.seller_permissions_version).toBeUndefined();
  expect(result.tool_set_scopes?.buyer).toEqual(buyerPermissions);
});

it.each(['other-client', 'unverified'] as const)('preserves unexpanded requested permissions for %s', async reason => {
  const data = consentMetadata();
  if (reason === 'other-client') data.client.client_id = 'https://other.example/client';
  else data.client.verified = false;
  delete data.buyer_permissions_version;
  data.tool_set_scopes = { buyer: requestedBuyerPermissions };
  vi.mocked(api.get).mockResolvedValue({ data });
  const result = await getConnectorRequest(consentId);
  expect(result.tool_set_scopes?.buyer).toEqual(requestedBuyerPermissions);
  expect(result.buyer_permissions_version).toBeUndefined();
});

it('preserves Seller consent for a Seller-only request while withholding Buyer approval', async () => {
  const scopes = [{ scope: 'seller.write', description: 'Create and update drafts' }];
  vi.mocked(api.get).mockResolvedValue({ data: { ...consentMetadata(), scopes, buyer_permissions_version: undefined,
    tool_set_scopes: { buyer: scopes, seller: sellerPermissions } } });
  const result = await getConnectorRequest(consentId);
  expect(result.tool_set_scopes?.buyer).toBeUndefined();
  expect(result.tool_set_scopes?.seller).toEqual(sellerPermissions);
  expect(result.seller_permissions_version).toBe(1);
  expect(result.tool_sets).toEqual(['buyer', 'seller']);
});

it.each([
  ['approve', 'seller', 1, undefined, { tool_set: 'seller', seller_permissions_version: 1 }],
  ['approve', 'buyer', undefined, 1, { tool_set: 'buyer', buyer_permissions_version: 1 }],
  ['approve', undefined, undefined, 1, { buyer_permissions_version: 1 }],
  ['approve', 'buyer', undefined, undefined, { tool_set: 'buyer' }],
  ['deny', 'seller', 1, 1, { tool_set: 'seller' }],
  ['deny', 'buyer', undefined, 1, { tool_set: 'buyer' }],
  ['deny', undefined, undefined, 1, {}],
] as const)('%s for %s sends only decision fields and the applicable version', async (decision, persona, sellerVersion, buyerVersion, fields) => {
  const url = `https://auth.ai.market/oauth/authorize/complete?request=${consentId}`;
  vi.mocked(api.post).mockResolvedValue({ data: { continue_url: url } });
  expect(await decideConnectorRequest(consentId, decision, 'org-1', 'nonce', persona, sellerVersion, buyerVersion)).toBe(url);
  expect(api.post).toHaveBeenCalledExactlyOnceWith(`/connector-oauth/requests/${consentId}/decision`, {
    decision, organization_id: 'org-1', csrf_nonce: 'nonce', ...fields,
  });
});

it.each([undefined, 0, 2])('prevents a Seller POST with version %s', async version => {
  await expect(decideConnectorRequest(consentId, 'approve', null, 'nonce', 'seller', version)).rejects.toThrow('seller_permissions_stale');
  expect(api.post).not.toHaveBeenCalled();
});

it.each([0, 2, 1.5])('prevents a Buyer POST with unsupported version %s', async version => {
  await expect(decideConnectorRequest(consentId, 'approve', null, 'nonce', 'buyer', undefined, version)).rejects.toThrow('buyer_permissions_stale');
  expect(api.post).not.toHaveBeenCalled();
});

it.each(['buyer', 'seller'] as const)('surfaces stale %s refusal without replaying the decision', async persona => {
  const failure = { response: { status: 403, data: { code: `${persona}_permissions_stale` } } };
  vi.mocked(api.post).mockRejectedValue(failure);
  await expect(decideConnectorRequest(consentId, 'approve', null, 'nonce', persona, 1, 1)).rejects.toBe(failure);
  expect(api.post).toHaveBeenCalledOnce();
});
