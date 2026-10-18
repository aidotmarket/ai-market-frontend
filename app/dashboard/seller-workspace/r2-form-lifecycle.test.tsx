// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ConnectionMutationResponse, SellerWorkspaceConnection } from '@/api/sellerWorkspace';

const api = vi.hoisted(() => ({
  getSellerWorkspaceCapabilities: vi.fn(), listSellerWorkspaceConnections: vi.fn(),
  saveR2Connection: vi.fn(), createIdempotencyKey: vi.fn(),
}));
vi.mock('@/api/sellerWorkspace', async importOriginal => ({
  ...await importOriginal<typeof import('@/api/sellerWorkspace')>(), ...api,
}));
// Keep the actual workspace, provider controls, overview navigation and R2 form mounted.
// Unrelated listing panels never call a backend in this suite.
vi.mock('@/api/sellerListingAssistant', () => ({ createListingAssistant: () => ({}) }));
vi.mock('@/components/seller-workspace/WorkspaceBatchSigning', () => ({ default: () => null }));
vi.mock('@/components/seller-workspace/WorkspaceData', () => ({ WorkspaceData: () => null }));
vi.mock('@/components/seller-workspace/SavedWorkspaceData', () => ({ default: () => null }));
vi.mock('@/components/seller-workspace/SellerReview', () => ({ default: () => null }));
vi.mock('@/components/seller-workspace/SellerPublications', () => ({ default: () => null }));
vi.mock('@/components/seller-workspace/SellerListingEditor', () => ({ default: () => null }));
vi.mock('@/components/seller-workspace/SavedListingEditor', () => ({ default: () => null }));
vi.mock('@/components/seller-workspace/SellerListingDraftStore', () => ({
  SellerListingDraftProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/seller-workspace/GuidedListingFlow', () => ({
  GuidedListingFlow: ({ children, navigate }: { children: ReactNode; navigate: (view: 'storage' | 'data') => void }) => <>
    <button onClick={() => navigate('data')}>Checklist files</button>
    <button onClick={() => navigate('storage')}>Checklist storage</button>
    {children}
  </>,
  StepNext: () => null,
}));
vi.mock('@/components/seller-workspace/SavedLicenseStep', () => ({ default: () => null }));
vi.mock('@/components/seller-workspace/GuidedPublishStep', () => ({ default: () => null }));
import SellerWorkspacePage from './page';

const ready = { enabled: true, status: 'available', reason: 'enabled' };
const off = { enabled: false, status: 'unavailable', reason: 'not_implemented' };
const capabilities = { master: ready, providers: {
  aws: { connect: off, profile: off, publish: off, delivery: off },
  r2: { connect: ready, profile: off, publish: off, delivery: off },
} };
const connection: SellerWorkspaceConnection = {
  id: 'r2-a', provider: 'r2', status: 'verified', rotation_substate: 'none', version: 1,
  provider_account_id: 'd'.repeat(32), role_arn: null, bucket: 'synthetic-a', prefix: 'sale', region: 'default',
  authorization_expires_at: '2099-01-01T00:00:00Z', rotation_deadline: null,
  verified_at: '2026-10-01T00:00:00Z', rotated_at: null, revoked_at: null, disabled_at: null,
  expired_at: null, last_verification_status: 'verified', redacted_error_code: null,
};
function deferred() {
  let resolve!: (value: ConnectionMutationResponse) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<ConnectionMutationResponse>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function result(version = 2, id = connection.id): ConnectionMutationResponse {
  return { connection: { ...connection, id, version }, replayed: false };
}
function input(label: string) { return screen.getByLabelText(label) as HTMLInputElement; }
function change(label: string, value: string) { fireEvent.change(input(label), { target: { value } }); }
function add() { fireEvent.click(screen.getByRole('button', { name: 'Add Cloudflare R2 connection' })); }
function replace() { fireEvent.click(screen.getByRole('button', { name: 'Replace access keys' })); }
function submit() {
  change('Access Key ID', 'a'.repeat(32));
  change('Secret Access Key', 'b'.repeat(64));
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.submit(input('Access Key ID').closest('form')!);
}
async function setup(create = false) {
  render(<SellerWorkspacePage />);
  await screen.findByRole('button', { name: 'Replace access keys' });
  if (create) {
    add();
    change('Cloudflare account ID', 'd'.repeat(32));
    change('Bucket name', 'synthetic-created');
    change('Folder inside the bucket', 'sale');
  } else replace();
  submit();
  expect(api.saveR2Connection).toHaveBeenCalledTimes(1);
}
function expectDraft(bucket = 'synthetic-new-draft') {
  expect(screen.getByRole('heading', { name: 'Connect Cloudflare R2' })).toBeTruthy();
  expect(input('Bucket name').value).toBe(bucket);
}
beforeEach(() => {
  vi.resetAllMocks();
  api.getSellerWorkspaceCapabilities.mockResolvedValue(capabilities);
  api.listSellerWorkspaceConnections.mockResolvedValue([connection]);
  let key = 0;
  api.createIdempotencyKey.mockImplementation(operation => `synthetic-${operation}-${++key}`);
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network request'); }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('closes the current successful replacement and reconciles its version', async () => {
  const save = deferred(); api.saveR2Connection.mockReturnValue(save.promise);
  await setup();
  await act(async () => save.resolve(result()));
  expect(screen.queryByRole('heading', { name: 'Replace Cloudflare access keys' })).toBeNull();
  replace(); submit();
  expect(api.saveR2Connection.mock.calls[1][0].expected_version).toBe(2);
});

it('preserves a new draft when an older replacement succeeds, while retaining the saved row', async () => {
  const save = deferred(); api.saveR2Connection.mockReturnValueOnce(save.promise).mockReturnValue(new Promise(() => {}));
  await setup();
  expect((screen.getByRole('button', { name: 'Add Cloudflare R2 connection' }) as HTMLButtonElement).disabled).toBe(false);
  add(); change('Bucket name', 'synthetic-new-draft');
  await act(async () => save.resolve(result()));
  expectDraft();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  replace(); submit();
  expect(api.saveR2Connection.mock.calls[1][0].expected_version).toBe(2);
});

it.each(['switch target', 'overview navigation', 'checklist navigation'])('preserves a same-target revisit after %s', async route => {
  const save = deferred(); api.saveR2Connection.mockReturnValueOnce(save.promise).mockReturnValue(new Promise(() => {}));
  await setup();
  if (route === 'switch target') add();
  else if (route === 'overview navigation') {
    fireEvent.click(screen.getByRole('button', { name: 'Choose your files' }));
    fireEvent.click(screen.getByRole('button', { name: 'Connect your storage' }));
  } else {
    fireEvent.click(screen.getByRole('button', { name: 'Checklist files' }));
    fireEvent.click(screen.getByRole('button', { name: 'Checklist storage' }));
  }
  replace();
  change('Access Key ID', 'c'.repeat(32));
  change('Secret Access Key', 'e'.repeat(64));
  fireEvent.click(screen.getByRole('checkbox'));
  await act(async () => save.resolve(result()));
  expect(screen.getByRole('heading', { name: 'Replace Cloudflare access keys' })).toBeTruthy();
  expect(input('Access Key ID').value).toBe('c'.repeat(32));
  expect(input('Secret Access Key').value).toBe('e'.repeat(64));
  expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
  expect((screen.getByRole('button', { name: 'Verify and replace keys' }) as HTMLButtonElement).disabled).toBe(false);
  expect(api.saveR2Connection).toHaveBeenCalledTimes(1);
  fireEvent.submit(input('Access Key ID').closest('form')!);
  expect(api.saveR2Connection).toHaveBeenCalledTimes(2);
  expect(api.saveR2Connection.mock.calls[1][0]).toMatchObject({
    expected_version: 2, access_key_id: 'c'.repeat(32), secret_access_key: 'e'.repeat(64),
  });
  expect(api.saveR2Connection.mock.calls[1][2]).toBe('r2-a');
});

it('preserves a closed and reopened create visit after an earlier create succeeds', async () => {
  const save = deferred(); api.saveR2Connection.mockReturnValueOnce(save.promise).mockReturnValue(new Promise(() => {}));
  await setup(true);
  replace(); add(); // Leave the busy create form before closing/reopening a fresh create form.
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  add(); change('Bucket name', 'synthetic-new-draft');
  await act(async () => save.resolve(result(1, 'r2-created')));
  expectDraft();
  expect(screen.getAllByRole('button', { name: 'Replace access keys' })).toHaveLength(2);
});

it.each(['replacement', 'creation'])('retains the idle %s child and typed keys on same-target re-click', async target => {
  render(<SellerWorkspacePage />);
  await screen.findByRole('button', { name: 'Replace access keys' });
  const open = target === 'replacement' ? replace : add;
  open();
  change('Access Key ID', 'c'.repeat(32));
  change('Secret Access Key', 'e'.repeat(64));
  fireEvent.click(screen.getByRole('checkbox'));
  const field = input('Access Key ID');
  open(); open();
  expect(input('Access Key ID')).toBe(field);
  expect(field.value).toBe('c'.repeat(32));
  expect(input('Secret Access Key').value).toBe('e'.repeat(64));
  expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
  expect(api.saveR2Connection).not.toHaveBeenCalled();
});

it.each(['replacement', 'creation'])('keeps the pending %s child busy on same-target re-click and completes normally', async target => {
  const save = deferred(); api.saveR2Connection.mockReturnValue(save.promise);
  await setup(target === 'creation');
  const form = input('Access Key ID').closest('form')!;
  const open = target === 'replacement' ? replace : add;
  open(); open();
  expect(input('Access Key ID').closest('form')).toBe(form);
  expect((form.querySelector('fieldset') as HTMLFieldSetElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: 'Checking connection…' }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.submit(form); fireEvent.submit(form);
  expect(api.saveR2Connection).toHaveBeenCalledTimes(1);
  expect(api.createIdempotencyKey).toHaveBeenCalledTimes(1);
  await act(async () => save.resolve(target === 'creation' ? result(1, 'r2-created') : result()));
  expect(screen.queryByRole('heading', { name: target === 'creation' ? 'Connect Cloudflare R2' : 'Replace Cloudflare access keys' })).toBeNull();
  expect(screen.getAllByRole('button', { name: 'Replace access keys' })).toHaveLength(target === 'creation' ? 2 : 1);
});

it('an old failure leaves a newer pending form busy and untouched', async () => {
  const old = deferred(), current = deferred();
  api.saveR2Connection.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  await setup(); add(); change('Bucket name', 'synthetic-new-draft'); submit();
  await act(async () => old.reject(new Error('synthetic-private-provider-detail')));
  expectDraft();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(input('Secret Access Key').value).toBe('b'.repeat(64));
  expect((screen.getByRole('button', { name: 'Checking connection…' }) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => current.resolve(result(1, 'r2-created')));
  expect(screen.queryByRole('heading', { name: 'Connect Cloudflare R2' })).toBeNull();
});

it('keeps current errors safe, blocks duplicate submissions, and reuses only unchanged retry keys', async () => {
  const first = deferred(), retry = deferred(), edited = deferred();
  api.saveR2Connection.mockReturnValueOnce(first.promise).mockReturnValueOnce(retry.promise).mockReturnValueOnce(edited.promise);
  await setup();
  const form = input('Access Key ID').closest('form')!;
  fireEvent.submit(form); fireEvent.submit(form);
  expect(api.saveR2Connection).toHaveBeenCalledTimes(1);
  expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => first.reject(new Error('synthetic-private-provider-detail')));
  expect(screen.getByRole('alert').textContent).toContain('Connection could not be confirmed');
  expect(screen.getByRole('alert').textContent).not.toContain('synthetic-private-provider-detail');
  expect(input('Secret Access Key').value).toBe('b'.repeat(64));
  replace();
  expect(input('Access Key ID').closest('form')).toBe(form);
  expect(screen.getByRole('alert').textContent).toContain('Connection could not be confirmed');
  fireEvent.submit(form);
  expect(api.saveR2Connection.mock.calls[1]).toEqual(api.saveR2Connection.mock.calls[0]);
  await act(async () => retry.reject(new Error('synthetic-retry-failure')));
  change('Access Key ID', 'c'.repeat(32)); fireEvent.submit(form);
  expect(api.saveR2Connection.mock.calls[2][1]).not.toBe(api.saveR2Connection.mock.calls[0][1]);
  await act(async () => edited.resolve(result()));
  expect(screen.queryByRole('heading', { name: 'Replace Cloudflare access keys' })).toBeNull();
});

it.each(['older first', 'newer first'])('keeps the highest saved row version when responses resolve %s', async order => {
  const old = deferred(), current = deferred();
  api.saveR2Connection.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise).mockReturnValue(new Promise(() => {}));
  await setup(); add(); replace(); submit();
  expect(api.saveR2Connection.mock.calls[1][1]).not.toBe(api.saveR2Connection.mock.calls[0][1]);
  if (order === 'older first') {
    await act(async () => old.resolve(result(2)));
    expect(screen.getByRole('button', { name: 'Checking connection…' })).toBeTruthy();
    await act(async () => current.resolve(result(3)));
  } else {
    await act(async () => current.resolve(result(3)));
    await act(async () => old.resolve(result(2)));
  }
  expect(screen.queryByRole('heading', { name: 'Replace Cloudflare access keys' })).toBeNull();
  replace(); submit();
  expect(api.saveR2Connection.mock.calls[2][0].expected_version).toBe(3);
  expect(api.saveR2Connection.mock.calls[2][2]).toBe('r2-a');
});
