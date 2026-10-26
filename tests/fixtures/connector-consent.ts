import type { ConnectorRequest } from '../../api/connector-oauth';

export const consentId = 'a'.repeat(43);
export const requestedBuyerPermissions = [
  { scope: 'account.read', description: 'Read your account and activity' },
  { scope: 'market.read', description: 'Search listings and read marketplace requests' },
];
export const buyerPermissions = [
  ...requestedBuyerPermissions,
  { scope: 'buyer.write', description: 'Take buyer actions you approve, including inquiries, data requests, and seller approval requests' },
];
export const invalidBuyerMetadata = [
  { buyer_permissions_version: undefined }, { buyer_permissions_version: null },
  { buyer_permissions_version: 0 }, { buyer_permissions_version: 2 },
  { buyer_permissions_version: '1' }, { buyer_permissions_version: true },
  { buyer_permissions_version: 1.5 }, { buyer_permissions_version: {} },
  { buyer_permissions_version: undefined, tool_set_scopes: { buyer: requestedBuyerPermissions } },
  { buyer_permissions_version: undefined, tool_set_scopes: undefined },
  { tool_set_scopes: undefined }, { tool_set_scopes: null }, { tool_set_scopes: [] },
  { tool_set_scopes: {} }, { tool_set_scopes: { buyer: null } }, { tool_set_scopes: { buyer: 'buyer.write' } },
  { tool_set_scopes: { buyer: [] } },
  { tool_set_scopes: { buyer: requestedBuyerPermissions } },
  { tool_set_scopes: { buyer: buyerPermissions.slice(1) } },
  { tool_set_scopes: { buyer: [...buyerPermissions, buyerPermissions[0]] } },
  { tool_set_scopes: { buyer: [...buyerPermissions, { scope: 'orders.read', description: 'Read orders' }] } },
  { tool_set_scopes: { buyer: [...buyerPermissions, { scope: 'seller.write', description: 'Write' }] } },
  { tool_set_scopes: { buyer: [...buyerPermissions, { scope: 'unknown', description: 'Unknown' }] } },
  { tool_set_scopes: { buyer: buyerPermissions.map(item => ({ ...item, description: ' ' })) } },
  { tool_set_scopes: { buyer: buyerPermissions.map(item => ({ ...item, description: null })) } },
  { tool_set_scopes: { buyer: buyerPermissions, unknown: [] } },
  { scopes: [] }, { scopes: [{ scope: 'seller.write', description: 'Write' }] },
];
export const sellerPermissions = [
  ...requestedBuyerPermissions,
  { scope: 'orders.read', description: 'Read your orders' },
  { scope: 'orders.write', description: 'Respond to inquiries and data requests' },
  { scope: 'seller.fulfil', description: 'Mark eligible orders delivered; this does not confirm buyer receipt' },
  { scope: 'seller.publish', description: 'Publish or unpublish listings and explicit batches, subject to website review and signing' },
  { scope: 'seller.read', description: 'Read your seller listings and readiness' },
  { scope: 'seller.write', description: 'Create and update drafts and prepare samples and enrichment' },
];
export function consentMetadata(): ConnectorRequest {
  return {
    request: consentId, client: { client_id: 'https://claude.ai/oauth/mcp-oauth-client-metadata', name: 'Claude', host: 'claude.ai', verified: true },
    accounts: [{ organization_id: null, label: 'Personal', kind: 'personal' },
      { organization_id: 'org-1', label: 'Team', kind: 'organization' }],
    scopes: requestedBuyerPermissions, tool_sets: ['buyer', 'seller'], buyer_permissions_version: 1,
    tool_set_scopes: { buyer: buyerPermissions, seller: sellerPermissions }, seller_permissions_version: 1,
    expires_at: new Date(Date.now() + 600_000).toISOString(), csrf_nonce: 'nonce',
  };
}
