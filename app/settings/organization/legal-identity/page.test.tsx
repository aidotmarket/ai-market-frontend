// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/store/auth';
import type { User } from '@/types';
import { AxiosError } from 'axios';
import type { OrganizationLegalIdentity } from '@/api/organizations';

const navigation = vi.hoisted(() => ({ search: '?org=org-1' }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(navigation.search) }));

const organizations = vi.hoisted(() => ({ getOrganization: vi.fn(), reconcileOrganizationLegalIdentity: vi.fn() }));
vi.mock('@/api/organizations', () => organizations);

const { default: OrganizationLegalIdentityPage } = await import('./page');

describe('OrganizationLegalIdentityPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function owner(id: string): OrganizationLegalIdentity {
  return { id, name: id, legal_name: `${id} Ltd`, jurisdiction: 'GB', current_user_role: 'owner' };
}

const saveLabel = 'Reconcile legal identity';
const defaultReason = 'Resolve checkout identity conflict';
const successMessage = 'Legal identity reconciled. Return to the listing and try checkout again.';

function expectFields(id: string, reason = defaultReason) {
  expect((screen.getByLabelText('Legal business name') as HTMLInputElement).value).toBe(`${id} Ltd`);
  expect((screen.getByLabelText('Jurisdiction (2-letter country code)') as HTMLInputElement).value).toBe('GB');
  expect((screen.getByLabelText('Reason') as HTMLInputElement).value).toBe(reason);
}

describe('organization query changes on the same page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    navigation.search = '?org=org-A';
  });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('hides A while B is pending, then saves only freshly loaded B fields', async () => {
    const readB = deferred<OrganizationLegalIdentity>();
    organizations.getOrganization.mockResolvedValueOnce(owner('org-A')).mockReturnValueOnce(readB.promise);
    organizations.reconcileOrganizationLegalIdentity.mockResolvedValue(owner('org-B'));
    const view = render(<OrganizationLegalIdentityPage />);
    await screen.findByLabelText('Legal business name');
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'A-only reason' } });
    navigation.search = '?org=org-B';
    view.rerender(<OrganizationLegalIdentityPage />);
    expect(organizations.getOrganization).toHaveBeenLastCalledWith('org-B');
    // Attempt the same user action if a stale form remains exposed.
    const staleSave = screen.queryByRole('button', { name: saveLabel });
    if (staleSave) await act(async () => { fireEvent.click(staleSave); });
    expect(organizations.reconcileOrganizationLegalIdentity).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Legal business name')).toBeNull();
    expect(screen.getByText('Loading organisation legal identity…')).not.toBeNull();
    await act(async () => { readB.resolve(owner('org-B')); });
    expectFields('org-B');
    fireEvent.change(screen.getByLabelText('Legal business name'), { target: { value: '  B Updated Ltd  ' } });
    fireEvent.change(screen.getByLabelText('Jurisdiction (2-letter country code)'), { target: { value: 'us' } });
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: '  B reason  ' } });
    fireEvent.click(screen.getByRole('button', { name: saveLabel }));
    expect(await screen.findByText(successMessage)).not.toBeNull();
    expect(organizations.reconcileOrganizationLegalIdentity).toHaveBeenCalledExactlyOnceWith('org-B', {
      legal_name: 'B Updated Ltd', jurisdiction: 'US', reason: 'B reason',
    });
  });

  it.each(['403', 'nonowner', 'error', 'missing'] as const)('cannot reuse A form when B is %s', async (outcome) => {
    const readB = deferred<OrganizationLegalIdentity>();
    organizations.getOrganization.mockResolvedValueOnce(owner('org-A')).mockReturnValueOnce(readB.promise);
    const view = render(<OrganizationLegalIdentityPage />);
    await screen.findByLabelText('Legal business name');
    navigation.search = outcome === 'missing' ? '' : '?org=org-B';
    view.rerender(<OrganizationLegalIdentityPage />);
    if (outcome !== 'missing') {
      expect(screen.queryByLabelText('Legal business name')).toBeNull();
      await act(async () => {
        if (outcome === 'nonowner') readB.resolve({ ...owner('org-B'), current_user_role: 'admin' });
        else if (outcome === '403') {
          const error = new AxiosError('forbidden');
          error.response = { status: 403 } as never;
          readB.reject(error);
        } else readB.reject(new Error('unavailable'));
      });
    }
    if (outcome === 'error') expect(screen.getByRole('alert').textContent).toBe('Organisation legal identity is unavailable.');
    else expect(screen.getByRole('heading', { name: 'Organisation owner required' })).not.toBeNull();
    expect(screen.queryByLabelText('Legal business name')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(organizations.reconcileOrganizationLegalIdentity).not.toHaveBeenCalled();
    if (outcome === 'missing') expect(organizations.getOrganization).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['success', false], ['error', false], ['success', true], ['error', true],
  ] as const)('ignores old save %s while B saving is %s', async (outcome, savingB) => {
    const saveA = deferred<OrganizationLegalIdentity>();
    const saveB = deferred<OrganizationLegalIdentity>();
    organizations.getOrganization.mockResolvedValueOnce(owner('org-A')).mockResolvedValueOnce(owner('org-B'));
    organizations.reconcileOrganizationLegalIdentity.mockReturnValueOnce(saveA.promise).mockReturnValueOnce(saveB.promise);
    const view = render(<OrganizationLegalIdentityPage />);
    await screen.findByLabelText('Legal business name');
    fireEvent.click(screen.getByRole('button', { name: saveLabel }));
    navigation.search = '?org=org-B';
    view.rerender(<OrganizationLegalIdentityPage />);
    await waitFor(() => expectFields('org-B'));
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'B reason' } });
    if (savingB) fireEvent.click(screen.getByRole('button', { name: saveLabel }));
    await act(async () => {
      if (outcome === 'success') saveA.resolve({ ...owner('org-A'), current_user_role: 'admin' });
      else saveA.reject(new Error('A save failed'));
    });
    expectFields('org-B', 'B reason');
    expect(screen.queryByRole('status')).toBeNull();
    const button = screen.getByRole('button', { name: savingB ? 'Saving…' : saveLabel });
    expect((button as HTMLButtonElement).disabled).toBe(savingB);
    if (savingB) {
      fireEvent.click(button);
      expect(organizations.reconcileOrganizationLegalIdentity).toHaveBeenCalledTimes(2);
      await act(async () => { saveB.resolve(owner('org-B')); });
      expect(screen.getByRole('status').textContent).toBe(successMessage);
    } else {
      fireEvent.click(button);
      await act(async () => { saveB.reject(new Error('B save failed')); });
      expect(screen.getByRole('status').textContent).toBe('Legal identity could not be reconciled.');
    }
    expect(organizations.reconcileOrganizationLegalIdentity).toHaveBeenLastCalledWith('org-B', {
      legal_name: 'org-B Ltd', jurisdiction: 'GB', reason: 'B reason',
    });
    expect((screen.getByRole('button', { name: saveLabel }) as HTMLButtonElement).disabled).toBe(false);
  });

  it.each(['success', 'error'] as const)('ignores old read %s after B becomes ready', async (outcome) => {
    const readA = deferred<OrganizationLegalIdentity>();
    organizations.getOrganization.mockReturnValueOnce(readA.promise).mockResolvedValueOnce(owner('org-B'));
    const view = render(<OrganizationLegalIdentityPage />);
    navigation.search = '?org=org-B';
    view.rerender(<OrganizationLegalIdentityPage />);
    await screen.findByLabelText('Legal business name');
    await act(async () => {
      if (outcome === 'success') readA.resolve(owner('org-A'));
      else readA.reject(new Error('A read failed'));
    });
    expectFields('org-B');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does not deliver an old A save to a new A visit after A–B–A', async () => {
    const saveA = deferred<OrganizationLegalIdentity>();
    const newA = deferred<OrganizationLegalIdentity>();
    organizations.getOrganization.mockResolvedValueOnce(owner('org-A')).mockResolvedValueOnce(owner('org-B')).mockReturnValueOnce(newA.promise);
    organizations.reconcileOrganizationLegalIdentity.mockReturnValueOnce(saveA.promise).mockResolvedValueOnce(owner('org-A'));
    const view = render(<OrganizationLegalIdentityPage />);
    await screen.findByLabelText('Legal business name');
    fireEvent.click(screen.getByRole('button', { name: saveLabel }));
    navigation.search = '?org=org-B';
    view.rerender(<OrganizationLegalIdentityPage />);
    await waitFor(() => expectFields('org-B'));
    navigation.search = '?org=org-A';
    view.rerender(<OrganizationLegalIdentityPage />);
    expect(screen.queryByLabelText('Legal business name')).toBeNull();
    await act(async () => { newA.resolve({ ...owner('org-A'), legal_name: 'New A Ltd' }); });
    await act(async () => { saveA.resolve({ ...owner('org-A'), legal_name: 'Old saved A Ltd' }); });
    expect((screen.getByLabelText('Legal business name') as HTMLInputElement).value).toBe('New A Ltd');
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: saveLabel }));
    expect(await screen.findByText(successMessage)).not.toBeNull();
    expect(organizations.reconcileOrganizationLegalIdentity).toHaveBeenLastCalledWith('org-A', {
      legal_name: 'New A Ltd', jurisdiction: 'GB', reason: defaultReason,
    });
  });

  it('preserves the current save backend error detail and permits retry', async () => {
    organizations.getOrganization.mockResolvedValue(owner('org-A'));
    const error = new AxiosError('conflict');
    error.response = { status: 409, data: { detail: 'Current organization conflict' } } as never;
    organizations.reconcileOrganizationLegalIdentity.mockRejectedValueOnce(error).mockResolvedValueOnce(owner('org-A'));
    render(<OrganizationLegalIdentityPage />);
    await screen.findByLabelText('Legal business name');
    fireEvent.click(screen.getByRole('button', { name: saveLabel }));
    expect(await screen.findByText('Current organization conflict')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: saveLabel }));
    expect(await screen.findByText(successMessage)).not.toBeNull();
    expect(organizations.reconcileOrganizationLegalIdentity).toHaveBeenCalledTimes(2);
  });
});
