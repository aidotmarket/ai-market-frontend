import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('./client', () => ({ api }));

const { getOrganization, reconcileOrganizationLegalIdentity } = await import('./organizations');

describe('organization legal identity API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads the membership role and posts reconciliation to the backend contract route', async () => {
    api.get.mockResolvedValue({ data: { id: 'org/1', current_user_role: 'owner' } });
    api.post.mockResolvedValue({ data: { id: 'org/1', legal_name: 'Buyer Ltd', jurisdiction: 'GB' } });

    await getOrganization('org/1');
    await reconcileOrganizationLegalIdentity('org/1', {
      legal_name: 'Buyer Ltd', jurisdiction: 'GB', reason: 'Resolve checkout identity conflict',
    });

    expect(api.get).toHaveBeenCalledWith('/organizations/org%2F1');
    expect(api.post).toHaveBeenCalledWith('/organizations/org%2F1/legal-identity/reconcile', {
      legal_name: 'Buyer Ltd', jurisdiction: 'GB', reason: 'Resolve checkout identity conflict',
    });
  });
});
