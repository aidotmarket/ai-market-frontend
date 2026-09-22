// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/store/auth';
import type { User } from '@/types';
import { AxiosError } from 'axios';

const navigation = vi.hoisted(() => ({ search: '?org=org-1' }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(navigation.search) }));

const organizations = vi.hoisted(() => ({ getOrganization: vi.fn(), reconcileOrganizationLegalIdentity: vi.fn() }));
vi.mock('@/api/organizations', () => organizations);

const { default: OrganizationLegalIdentityPage } = await import('./page');

describe('OrganizationLegalIdentityPage', () => {
  beforeEach(() => {
    navigation.search = '?org=org-1';
    const user: User = {
      id: 'owner-1', email: 'owner@example.com', first_name: 'Owner', last_name: 'Buyer',
      company_name: null, role: 'buyer', status: 'active', created_at: '2026-09-22T00:00:00Z',
      email_verified_at: '2026-09-22T00:00:00Z', totp_enabled: false, auth_methods: ['password'], primary_auth: 'password',
    };
    useAuthStore.setState({ user });
  });
  afterEach(() => { cleanup(); vi.clearAllMocks(); useAuthStore.setState({ user: null }); });

  it('lets an owner reconcile through the real backend contract fields', async () => {
    organizations.getOrganization.mockResolvedValue({ id: 'org-1', name: 'Buyer', current_user_role: 'owner' });
    organizations.reconcileOrganizationLegalIdentity.mockResolvedValue({ id: 'org-1', legal_name: 'Buyer Ltd', jurisdiction: 'GB' });
    render(<OrganizationLegalIdentityPage />);

    await waitFor(() => expect(organizations.getOrganization).toHaveBeenCalledWith('org-1'));

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

  it('shows owner required when the organization endpoint returns 403', async () => {
    const error = new AxiosError('forbidden');
    error.response = { status: 403 } as never;
    organizations.getOrganization.mockRejectedValue(error);
    render(<OrganizationLegalIdentityPage />);
    expect(await screen.findByRole('heading', { name: 'Organisation owner required' })).not.toBeNull();
  });
});
