// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/store/auth';

const organizations = vi.hoisted(() => ({ getOrganization: vi.fn(), reconcileOrganizationLegalIdentity: vi.fn() }));
vi.mock('@/api/organizations', () => organizations);

const { default: OrganizationLegalIdentityPage } = await import('./page');

describe('OrganizationLegalIdentityPage', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { id: 'owner-1', organization_id: 'org-1' } as never });
  });
  afterEach(() => { cleanup(); vi.clearAllMocks(); useAuthStore.setState({ user: null }); });

  it('lets an owner reconcile through the real backend contract fields', async () => {
    organizations.getOrganization.mockResolvedValue({ id: 'org-1', name: 'Buyer', current_user_role: 'owner' });
    organizations.reconcileOrganizationLegalIdentity.mockResolvedValue({ id: 'org-1', legal_name: 'Buyer Ltd', jurisdiction: 'GB' });
    render(<OrganizationLegalIdentityPage />);

    fireEvent.change(await screen.findByLabelText('Legal business name'), { target: { value: 'Buyer Ltd' } });
    fireEvent.change(screen.getByLabelText('Jurisdiction (2-letter country code)'), { target: { value: 'gb' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reconcile legal identity' }));

    await waitFor(() => expect(organizations.reconcileOrganizationLegalIdentity).toHaveBeenCalledWith('org-1', {
      legal_name: 'Buyer Ltd', jurisdiction: 'GB', reason: 'Resolve checkout identity conflict',
    }));
  });

  it('refuses to render the form for an organization admin', async () => {
    organizations.getOrganization.mockResolvedValue({ id: 'org-1', name: 'Buyer', current_user_role: 'admin' });
    render(<OrganizationLegalIdentityPage />);
    expect(await screen.findByRole('heading', { name: 'Organisation owner required' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Reconcile legal identity' })).toBeNull();
  });
});
