import { api } from '@/api/client';
import { CONNECTOR_CONTINUATION } from '@/lib/redirect';
import { connectorRequestPath, setConnectorStatus } from '@/lib/aim-data-continuation';

export interface ConnectorClient { client_id: string; name: string; host: string; verified: boolean }
export interface ConnectorScope { scope: string; description: string }
export type ConnectorToolSet = 'buyer' | 'seller';
const BUYER_PERMISSIONS_VERSION = 1;
const BUYER_SCOPES = ['account.read', 'market.read', 'buyer.write', 'orders.read', 'orders.write'];
// The permitted Claude CIMD identity in the backend's connector_shared/profiles.yaml.
const CLAUDE_CLIENT_ID = 'https://claude.ai/oauth/mcp-oauth-client-metadata';
const SELLER_PERMISSIONS_VERSION = 1;
const SELLER_SCOPES = ['account.read', 'market.read', 'orders.read', 'orders.write', 'seller.fulfil', 'seller.publish', 'seller.read', 'seller.write'];
export interface ConnectorAccount { organization_id: string | null; label: string; kind: 'personal' | 'organization' }
export interface ConnectorRequest {
  request: string;
  client: ConnectorClient;
  accounts: ConnectorAccount[];
  scopes: ConnectorScope[];
  expires_at: string;
  csrf_nonce: string;
  tool_sets?: ConnectorToolSet[];
  tool_set_scopes?: Partial<Record<ConnectorToolSet, ConnectorScope[]>>;
  seller_permissions_version?: number;
  buyer_permissions_version?: number;
}
export interface ConnectorGrant {
  id: string;
  client: Pick<ConnectorClient, 'name' | 'host' | 'verified'>;
  organization: { id: string; name: string } | null;
  scopes: ConnectorScope[];
  created_at: string;
  last_used_at: string | null;
}

export async function getConnectorStatus(): Promise<boolean> {
  const { data } = await api.get<{ enabled: boolean }>('/connector-oauth/status');
  const enabled = data.enabled === true;
  setConnectorStatus(enabled);
  return enabled;
}

function requireRequest(request: string) {
  if (!CONNECTOR_CONTINUATION.test(connectorRequestPath(request))) throw new Error('invalid_request');
}

function isScopeList(value: unknown): value is ConnectorScope[] {
  return Array.isArray(value) && value.every(item => item && typeof item.scope === 'string'
    && item.scope.trim().length > 0 && typeof item.description === 'string' && item.description.trim().length > 0)
    && new Set(value.map(item => item.scope)).size === value.length;
}

function sameScopes(scopes: ConnectorScope[], expected: string[]): boolean {
  return scopes.length === expected.length && scopes.every(item => expected.includes(item.scope));
}

export async function getConnectorRequest(request: string): Promise<ConnectorRequest> {
  requireRequest(request);
  const { data } = await api.get<ConnectorRequest>(`/connector-oauth/requests/${request}`);
  if (!data || data.request !== request || !Number.isFinite(Date.parse(data.expires_at))
    || !data.client || !Array.isArray(data.accounts) || !isScopeList(data.scopes)
    || typeof data.csrf_nonce !== 'string'
    || (data.tool_sets !== undefined && (!Array.isArray(data.tool_sets) || !data.tool_sets.length || new Set(data.tool_sets).size !== data.tool_sets.length || !data.tool_sets.every(v => v === 'buyer' || v === 'seller')))) throw new Error('invalid_request');
  const permissions = data.tool_set_scopes;
  // A missing version from an older backend must not downgrade Claude consent.
  const versionedBuyer = data.buyer_permissions_version !== undefined
    || (data.client.verified === true && data.client.client_id === CLAUDE_CLIENT_ID);
  const expectedBuyer = versionedBuyer ? [...new Set([...data.scopes.map(item => item.scope), 'buyer.write'])]
    : data.scopes.map(item => item.scope);
  const validBuyer = permissions && Object.keys(permissions).every(key => key === 'buyer' || key === 'seller')
    && isScopeList(permissions.buyer) && sameScopes(permissions.buyer, expectedBuyer)
    && (!versionedBuyer || (data.buyer_permissions_version === BUYER_PERMISSIONS_VERSION
      && data.scopes.length > 0 && data.scopes.every(item => BUYER_SCOPES.includes(item.scope))));
  // Seller is an expanded grant. Older or incompatible metadata must never offer it.
  // Seller-only requests can retain requested Buyer scopes without offering Buyer approval.
  const validSellerBuyer = validBuyer || (isScopeList(permissions?.buyer)
    && sameScopes(permissions.buyer, data.scopes.map(item => item.scope)));
  const sellerOffered = data.tool_sets?.includes('buyer') && data.tool_sets.includes('seller')
    && data.seller_permissions_version === SELLER_PERMISSIONS_VERSION
    && permissions && Object.keys(permissions).every(key => key === 'buyer' || key === 'seller')
    && validSellerBuyer && isScopeList(permissions.seller) && sameScopes(permissions.seller, SELLER_SCOPES);
  return {
    ...data,
    tool_sets: data.tool_sets?.filter(choice => choice === 'buyer' || sellerOffered),
    tool_set_scopes: { ...(validBuyer ? { buyer: permissions.buyer } : {}), ...(sellerOffered ? { seller: permissions.seller } : {}) },
    seller_permissions_version: sellerOffered ? SELLER_PERMISSIONS_VERSION : undefined,
    buyer_permissions_version: validBuyer && versionedBuyer ? BUYER_PERMISSIONS_VERSION : undefined,
  };
}

export function validateConnectorContinueUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('https://auth.ai.market/oauth/authorize/complete?')) {
    throw new Error('invalid_redirect');
  }
  return value;
}

export async function decideConnectorRequest(
  request: string, decision: 'approve' | 'deny', organization_id: string | null, csrf_nonce: string, tool_set?: ConnectorToolSet,
  seller_permissions_version?: number,
  buyer_permissions_version?: number,
): Promise<string> {
  requireRequest(request);
  const sellerApproval = decision === 'approve' && tool_set === 'seller';
  if (sellerApproval && seller_permissions_version !== SELLER_PERMISSIONS_VERSION) throw new Error('seller_permissions_stale');
  const buyerApproval = decision === 'approve' && tool_set !== 'seller';
  if (buyerApproval && buyer_permissions_version !== undefined && buyer_permissions_version !== BUYER_PERMISSIONS_VERSION) throw new Error('buyer_permissions_stale');
  const { data } = await api.post<{ continue_url: string }>(`/connector-oauth/requests/${request}/decision`,
    { decision, organization_id, csrf_nonce, ...(tool_set ? { tool_set } : {}),
      ...(sellerApproval ? { seller_permissions_version } : {}),
      ...(buyerApproval && buyer_permissions_version !== undefined ? { buyer_permissions_version } : {}) });
  return validateConnectorContinueUrl(data.continue_url);
}

export async function getConnectorGrants(): Promise<ConnectorGrant[]> {
  const { data } = await api.get<{ grants: ConnectorGrant[] }>('/connector/grants');
  return data.grants;
}

export async function revokeConnectorGrant(id: string): Promise<void> {
  const { data } = await api.delete<{ revoked: boolean }>(`/connector/grants/${encodeURIComponent(id)}`);
  if (data.revoked !== true) throw new Error('revoke_failed');
}
