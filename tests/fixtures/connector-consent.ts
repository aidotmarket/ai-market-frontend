import type { ConnectorRequest } from '../../api/connector-oauth';

export const consentId = 'a'.repeat(43);
export const buyerPermissions = [
  { scope: 'account.read', description: 'Read your account and activity' },
  { scope: 'market.read', description: 'Search listings and read marketplace requests' },
];
export const sellerPermissions = [
  ...buyerPermissions,
  { scope: 'orders.read', description: 'Read your orders' },
  { scope: 'orders.write', description: 'Respond to inquiries and data requests' },
  { scope: 'seller.fulfil', description: 'Mark eligible orders delivered; this does not confirm buyer receipt' },
  { scope: 'seller.publish', description: 'Publish or unpublish listings and explicit batches, subject to website review and signing' },
  { scope: 'seller.read', description: 'Read your seller listings and readiness' },
  { scope: 'seller.write', description: 'Create and update drafts and prepare samples and enrichment' },
];
export function consentMetadata(): ConnectorRequest {
  return {
    request: consentId, client: { client_id: 'client', name: 'Claude', host: 'claude.ai', verified: true },
    accounts: [{ organization_id: null, label: 'Personal', kind: 'personal' },
      { organization_id: 'org-1', label: 'Team', kind: 'organization' }],
    scopes: buyerPermissions, tool_sets: ['buyer', 'seller'],
    tool_set_scopes: { buyer: buyerPermissions, seller: sellerPermissions }, seller_permissions_version: 1,
    expires_at: new Date(Date.now() + 600_000).toISOString(), csrf_nonce: 'nonce',
  };
}
