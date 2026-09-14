import type { SellerWorkspaceConnection } from '@/api/sellerWorkspace';

export function connectionStatus(connection: SellerWorkspaceConnection) {
  // Terminal evidence takes precedence over a stale pending status.
  if (connection.revoked_at) return 'revoked';
  if (connection.disabled_at) return 'disabled';
  if (connection.expired_at) return 'expired';
  if (connection.status === 'pending_authorization'
    && Date.parse(connection.authorization_expires_at) <= Date.now()) return 'expired';
  return connection.status;
}

export function connectionName(connection: SellerWorkspaceConnection) {
  return connection.bucket || `${connection.provider === 'aws' ? 'AWS S3' : 'Cloudflare R2'} connection`;
}

function connectionTime(connection: SellerWorkspaceConnection) {
  // The list contract has no created_at. Use lifecycle timestamps, falling
  // back to the initial setup deadline (issued with the pending record).
  return Math.max(...[connection.revoked_at, connection.disabled_at, connection.expired_at,
    connection.rotated_at, connection.verified_at].map(value => Date.parse(value ?? '') || 0))
    || Date.parse(connection.authorization_expires_at) || 0;
}

export function partitionConnections(connections: SellerWorkspaceConnection[]) {
  const current: SellerWorkspaceConnection[] = [];
  const previous: SellerWorkspaceConnection[] = [];
  const pendingProviders = new Set<string>();
  for (const original of [...connections].sort((a, b) => connectionTime(b) - connectionTime(a))) {
    const connection = { ...original, status: connectionStatus(original) };
    if (['revoked', 'disabled', 'expired'].includes(connection.status)) {
      previous.push(connection);
    } else if (connection.status === 'pending_authorization') {
      if (pendingProviders.has(connection.provider)) previous.push(connection);
      else {
        pendingProviders.add(connection.provider);
        current.push(connection);
      }
    } else {
      current.push(connection);
    }
  }
  const groups = new Map<string, SellerWorkspaceConnection[]>();
  for (const connection of previous) {
    const key = JSON.stringify([connectionName(connection), connection.provider, connection.prefix]);
    const group = groups.get(key) ?? [];
    group.push(connection);
    groups.set(key, group);
  }
  return { current, previous, groups: [...groups.values()] };
}
