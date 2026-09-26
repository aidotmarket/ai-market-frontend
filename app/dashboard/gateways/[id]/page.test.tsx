// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/store/auth';
import GatewayPage from './page';
import { bodies, file, gateway } from '../fixtures';
import { DESCRIPTION_CONFIRMATION } from '@/components/gateways/presentation';
import type { SellerGateway } from '@/types/sellerGateway';

const api = vi.hoisted(() => ({
  capabilities: vi.fn(), list: vi.fn(), get: vi.fn(), files: vi.fn(), file: vi.fn(), received: vi.fn(),
  patch: vi.fn(), door: vi.fn(), ack: vi.fn(), revoke: vi.fn(), describe: vi.fn(), createDraft: vi.fn(), saveSource: vi.fn(), push: vi.fn(),
}));
const route = vi.hoisted(() => ({ id: 'gateway-1' }));
vi.mock('next/navigation', () => ({ useParams: () => ({ id: route.id }), useRouter: () => ({ push: api.push }) }));
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('@/api/capabilities', () => ({ getCapabilities: api.capabilities }));
vi.mock('@/api/listings', () => ({ createDraftListing: api.createDraft }));
vi.mock('@/api/sellerGateways', () => ({
  listSellerGateways: api.list, getSellerGateway: api.get, listGatewayFiles: api.files, getGatewayFile: api.file,
  listReceivedMessages: api.received, patchSellerGateway: api.patch, startDoorCheck: api.door,
  acknowledgeGatewayIdentity: api.ack, revokeSellerGateway: api.revoke, describeGatewayFile: api.describe,
  saveGatewayListingSource: api.saveSource,
  gatewayErrorDetails: (error: { response?: { data?: { error?: { details?: object } } } }) => error.response?.data?.error?.details ?? null,
}));

beforeEach(() => {
  vi.clearAllMocks();
  route.id = 'gateway-1';
  api.capabilities.mockResolvedValue({ seller: { effective_status: 'active' } });
  api.list.mockResolvedValue([gateway]); api.get.mockResolvedValue(gateway);
  api.files.mockResolvedValue({ files: [file], next_cursor: null });
  api.file.mockResolvedValue({ data: file, retryAfter: null });
  api.received.mockResolvedValue({ messages: [], next_cursor: null });
  api.patch.mockResolvedValue(gateway); api.ack.mockResolvedValue({ ...gateway, identity_ack_at: '2026-01-01T00:00:00Z' });
  api.door.mockResolvedValue({ data: { door_check: { state: 'pending', checked_at: '2026-01-01T00:00:00Z', failure_code: null, certificate_flags: [] } }, retryAfter: 2 });
  api.describe.mockResolvedValue({ data: { ...file, description: { ...file.description, state: 'requested' } }, retryAfter: 10 });
  api.createDraft.mockResolvedValue({ id: 'listing-1', status: 'draft' });
  api.saveSource.mockResolvedValue({ type: 'gateway', gateway_id: 'gateway-1', file_ids: [file.file_id] });
  useAuthStore.setState({ hydrated: true, isAuthenticated: true, isLoading: false });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
async function ready() { render(<GatewayPage />); await screen.findByText('Test gateway', { selector: 'h1' }); }

const describedFile = { ...file, offerable: true, description: { ...file.description, state: 'described' as const, row_count: 2, columns: [{ name: 'safe', type: 'integer', null_rate_pct: 0, distinct_bucket: '2-10' }] } };

it('creates a raw draft from selected offerable files, saves its source, then opens the editor', async () => {
  const second = { ...describedFile, file_id: 'second', display_name: 'second.csv', description: { ...describedFile.description, row_count: 3 } };
  api.files.mockResolvedValue({ files: [describedFile, second], next_cursor: null });
  await ready();
  fireEvent.click(screen.getByLabelText(`Select ${describedFile.display_name}`));
  fireEvent.click(screen.getByLabelText('Select second.csv'));
  fireEvent.click(screen.getByRole('button', { name: 'Create listing' }));
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Safe data' } });
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'A useful data set' } });
  fireEvent.change(screen.getByLabelText('Price'), { target: { value: '25' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));
  await waitFor(() => expect(api.push).toHaveBeenCalledWith('/dashboard/listings/listing-1/edit'));
  expect(api.createDraft).toHaveBeenCalledWith({ title: 'Safe data', description: 'A useful data set', price: 25, model_provider: 'anthropic', listing_type: 'raw', data_format: 'csv', schema_info: { row_count: 5, columns: [{ name: 'safe', type: 'integer' }] } });
  expect(api.saveSource).toHaveBeenCalledWith('listing-1', { type: 'gateway', gateway_id: 'gateway-1', file_ids: [describedFile.file_id, 'second'] });
  expect(api.createDraft.mock.invocationCallOrder[0]).toBeLessThan(api.saveSource.mock.invocationCallOrder[0]);
  expect(api.saveSource.mock.invocationCallOrder[0]).toBeLessThan(api.push.mock.invocationCallOrder[0]);
});

it.each([
  ['application/json', 'json'],
  ['application/x-parquet', 'parquet'],
  ['application/vnd.apache.parquet', 'parquet'],
])('sends %s as %s when the first selected file uses that media type', async (mediaType, dataFormat) => {
  const otherFile = { ...describedFile, file_id: 'other-file', display_name: 'other-file', media_type: mediaType };
  api.files.mockResolvedValue({ files: [describedFile, otherFile], next_cursor: null });
  await ready();
  fireEvent.click(screen.getByLabelText('Select other-file'));
  fireEvent.click(screen.getByLabelText(`Select ${describedFile.display_name}`));
  fireEvent.click(screen.getByRole('button', { name: 'Create listing' }));
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Safe data' } });
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'A useful data set' } });
  fireEvent.change(screen.getByLabelText('Price'), { target: { value: '0' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));
  await waitFor(() => expect(api.createDraft).toHaveBeenCalled());
  expect(api.createDraft.mock.calls[0][0]).toHaveProperty('data_format', dataFormat);
  expect(api.saveSource).toHaveBeenCalledWith('listing-1', { type: 'gateway', gateway_id: 'gateway-1', file_ids: ['other-file', describedFile.file_id] });
});

it('blocks files whose column names or types differ', async () => {
  const different = { ...describedFile, file_id: 'different', display_name: 'different.csv', description: { ...describedFile.description, columns: [{ ...describedFile.description.columns[0], type: 'string' }] } };
  api.files.mockResolvedValue({ files: [describedFile, different], next_cursor: null });
  await ready();
  fireEvent.click(screen.getByLabelText(`Select ${describedFile.display_name}`));
  fireEvent.click(screen.getByLabelText('Select different.csv'));
  fireEvent.click(screen.getByRole('button', { name: 'Create listing' }));
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Safe data' } });
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'A useful data set' } });
  fireEvent.change(screen.getByLabelText('Price'), { target: { value: '0' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Pick files with the same columns and types.');
  expect(api.createDraft).not.toHaveBeenCalled();
});

it('does not select a non-offerable file or show creation on a revoked gateway', async () => {
  api.files.mockResolvedValue({ files: [file], next_cursor: null });
  await ready();
  expect((screen.getByLabelText(`Select ${file.display_name}`) as HTMLInputElement).disabled).toBe(true);
  expect(screen.queryByRole('button', { name: 'Create listing' })).toBeNull();
  cleanup();
  api.get.mockResolvedValue({ ...gateway, status: 'revoked' });
  api.files.mockResolvedValue({ files: [describedFile], next_cursor: null });
  await ready();
  expect(screen.queryByLabelText(`Select ${describedFile.display_name}`)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Create listing' })).toBeNull();
});

it('shows backend errors and stays on the gateway page', async () => {
  api.files.mockResolvedValue({ files: [describedFile], next_cursor: null });
  api.createDraft.mockRejectedValueOnce({ response: { data: { detail: { error: 'capability_required', missing_steps: ['totp_enabled'] } } } });
  await ready();
  fireEvent.click(screen.getByLabelText(`Select ${describedFile.display_name}`));
  fireEvent.click(screen.getByRole('button', { name: 'Create listing' }));
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Safe data' } });
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'A useful data set' } });
  fireEvent.change(screen.getByLabelText('Price'), { target: { value: '0' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));
  expect((await screen.findByRole('alert')).textContent).toContain('capability_required: missing_steps: totp_enabled');
  expect(api.saveSource).not.toHaveBeenCalled();
  expect(api.push).not.toHaveBeenCalled();
  api.createDraft.mockRejectedValueOnce({ response: { data: { detail: { code: 'TERMS_ACCEPTANCE_REQUIRED', terms_url: '/legal/terms', acceptance_url: '/legal/terms' } } } });
  fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));
  expect((await screen.findByRole('link', { name: 'Review terms' })).getAttribute('href')).toBe('/legal/terms');
  expect(api.push).not.toHaveBeenCalled();
});

it('shows a plain-string detail without crashing', async () => {
  api.files.mockResolvedValue({ files: [describedFile], next_cursor: null });
  api.createDraft.mockRejectedValueOnce({ response: { data: { detail: 'Invalid listing details' } } });
  await ready();
  fireEvent.click(screen.getByLabelText(`Select ${describedFile.display_name}`));
  fireEvent.click(screen.getByRole('button', { name: 'Create listing' }));
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Safe data' } });
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'A useful data set' } });
  fireEvent.change(screen.getByLabelText('Price'), { target: { value: '0' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Invalid listing details');
  expect(screen.queryByRole('link', { name: 'Review terms' })).toBeNull();
});

it('keeps the created draft for a retry when saving the source fails', async () => {
  api.files.mockResolvedValue({ files: [describedFile], next_cursor: null });
  api.saveSource.mockRejectedValueOnce({ response: { data: { error: { code: 'file_not_found' } } } });
  await ready();
  fireEvent.click(screen.getByLabelText(`Select ${describedFile.display_name}`));
  fireEvent.click(screen.getByRole('button', { name: 'Create listing' }));
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Safe data' } });
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'A useful data set' } });
  fireEvent.change(screen.getByLabelText('Price'), { target: { value: '0' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));
  expect((await screen.findByRole('alert')).textContent).toContain('file_not_found');
  expect(api.push).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));
  await waitFor(() => expect(api.push).toHaveBeenCalledWith('/dashboard/listings/listing-1/edit'));
  expect(api.createDraft).toHaveBeenCalledTimes(1);
});

it('hides gateway content when the list is unavailable', async () => {
  api.list.mockRejectedValue({ response: { data: { error: { code: 'gateway_disabled' } } } });
  render(<GatewayPage />);
  await screen.findByText('Gateways are not available.');
  expect(screen.queryByText('Files', { selector: 'h2' })).toBeNull();
});

it('renders every blocker, a file name, and unknown status and blocker fallbacks', async () => {
  const codes = ['gateway_offline', 'gateway_revoked', 'version_below_minimum', 'egress_open', 'door_url_missing', 'door_check_not_passed', 'door_check_stale', 'identity_ack_missing', 'file_not_described', 'file_stale', 'file_missing', 'new_blocker'];
  api.get.mockResolvedValue({ ...gateway, status_reason: 'new_reason', blockers: codes.map(code => ({ code, file_id: code.startsWith('file_') ? file.file_id : undefined })) });
  await ready();
  expect(screen.getByText(/needs attention. Check its status/)).toBeTruthy();
  const list = screen.getByRole('heading', { name: 'What needs attention' }).nextElementSibling!;
  expect(within(list as HTMLElement).getAllByRole('listitem')).toHaveLength(codes.length);
  expect(list.textContent).toContain('file-01234567.csv needs a current description');
  expect(list.textContent).toContain('file-01234567.csv changed');
  expect(list.textContent).toContain('file-01234567.csv is missing');
  expect(list.textContent).toContain('This gateway needs attention. Check its setup');
});

it('edits the name and door URL with inline validation', async () => {
  await ready();
  fireEvent.change(screen.getByLabelText('Gateway name'), { target: { value: 'Renamed' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save name' }));
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith('gateway-1', { name: 'Renamed' }));
  fireEvent.change(screen.getByLabelText('Door URL'), { target: { value: 'http://door.example' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save door URL' }));
  expect(screen.getByText('Use an https URL.')).toBeTruthy();
  api.patch.mockRejectedValueOnce({ response: { data: { error: { code: 'door_url_invalid' } } } });
  fireEvent.change(screen.getByLabelText('Door URL'), { target: { value: 'https://bad.example' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save door URL' }));
  expect(await screen.findByText('Enter a valid public door URL.')).toBeTruthy();
  api.patch.mockRejectedValueOnce({ response: { data: { error: { code: 'door_url_not_https' } } } });
  fireEvent.click(screen.getByRole('button', { name: 'Save door URL' }));
  expect(await screen.findByText('Use an https URL.')).toBeTruthy();
  expect(screen.getByText(/resets its door check/)).toBeTruthy();
});

it('shows the D-A notice, certificate warnings, and saves acknowledgement', async () => {
  api.get.mockResolvedValue({ ...gateway, door_check: { ...gateway.door_check, certificate_flags: ['organization_in_subject', 'extra_subject_alt_names'] } });
  await ready();
  expect(screen.getByText(/buyer learns your door hostname/)).toBeTruthy();
  expect(screen.getByText(/subject names an organization/)).toBeTruthy();
  expect(screen.getByText(/names hosts besides this door/)).toBeTruthy();
  fireEvent.click(screen.getByLabelText('I have read the identity notice.'));
  fireEvent.click(screen.getByRole('button', { name: 'Acknowledge notice' }));
  await waitFor(() => expect(api.ack).toHaveBeenCalledWith('gateway-1'));
  expect(await screen.findByText(/Acknowledged:/)).toBeTruthy();
});

it('revokes directly and retries with confirmed open orders', async () => {
  await ready();
  api.get.mockResolvedValueOnce({ ...gateway, status: 'revoked', status_reason: null, blockers: [{ code: 'gateway_revoked' }], can_publish: false });
  fireEvent.click(screen.getByRole('button', { name: 'Revoke gateway' }));
  expect(screen.getByText(/Orders with undelivered files become blocked/)).toBeTruthy();
  api.revoke.mockRejectedValueOnce({ response: { data: { error: { code: 'gateway_has_open_orders', details: { open_order_count: 3 } } } } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm revoke' }));
  expect(await screen.findByText(/3 open orders/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm revoke' }));
  await waitFor(() => expect(api.revoke).toHaveBeenCalledWith('gateway-1', true));
  expect(await screen.findByText(/Status: revoked/)).toBeTruthy();
});

it('revokes without open orders after one confirmation', async () => {
  await ready();
  api.get.mockResolvedValueOnce({ ...gateway, status: 'revoked', status_reason: null, blockers: [{ code: 'gateway_revoked' }], can_publish: false });
  fireEvent.click(screen.getByRole('button', { name: 'Revoke gateway' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm revoke' }));
  await waitFor(() => expect(api.revoke).toHaveBeenCalledWith('gateway-1', false));
  expect(await screen.findByText(/Status: revoked/)).toBeTruthy();
});

it('renders authoritative status, reason, blockers and controls after revoke', async () => {
  api.get.mockResolvedValueOnce({ ...gateway, status: 'unsupported', status_reason: 'egress_open', blockers: [], can_publish: true })
    .mockResolvedValueOnce({ ...gateway, status: 'revoked', status_reason: null, blockers: [{ code: 'gateway_revoked' }], can_publish: false });
  await ready();
  fireEvent.click(screen.getByRole('button', { name: 'Revoke gateway' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm revoke' }));
  expect(await screen.findByText('Status: revoked')).toBeTruthy();
  expect(screen.getByText('This gateway has been revoked.')).toBeTruthy();
  expect(screen.getByText(/Can publish: No/)).toBeTruthy();
  expect(screen.queryByText(/network can reach more/)).toBeNull();
  expect(screen.queryByText('No blockers.')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Save name' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Run door check' })).toBeNull();
  expect(api.get).toHaveBeenCalledTimes(2);
});

it('shows safe revoked state when the post-revoke refresh fails', async () => {
  api.get.mockResolvedValueOnce({ ...gateway, status: 'unsupported', status_reason: 'egress_open', blockers: [], can_publish: true })
    .mockRejectedValueOnce(new Error('network'));
  await ready();
  fireEvent.click(screen.getByRole('button', { name: 'Revoke gateway' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm revoke' }));
  expect(await screen.findByText('Status: revoked')).toBeTruthy();
  expect(screen.getByText('This gateway has been revoked.')).toBeTruthy();
  expect(screen.getByText(/Can publish: No/)).toBeTruthy();
  expect(screen.queryByText(/network can reach more/)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Save name' })).toBeNull();
});

it('confirms exact description text, polls to described, and renders columns', async () => {
  await ready();
  fireEvent.click(screen.getByRole('button', { name: 'Describe' }));
  expect(screen.getByText(DESCRIPTION_CONFIRMATION).textContent).toBe(DESCRIPTION_CONFIRMATION);
  expect(screen.getByText(`aim-gateway preview ${file.file_id}`)).toBeTruthy();
  api.file.mockResolvedValueOnce({ data: { ...file, description: { ...file.description, state: 'described', row_count: 2, sha256: 'a'.repeat(64), columns: [{ name: 'safe', type: 'integer', null_rate_pct: 0, distinct_bucket: '2-10' }] } }, retryAfter: null });
  api.describe.mockResolvedValueOnce({ data: { ...file, description: { ...file.description, state: 'requested' } }, retryAfter: 3 });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm describe' }));
  await waitFor(() => expect(api.describe).toHaveBeenCalledWith('gateway-1', file.file_id));
  vi.useFakeTimers();
  await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
  expect(screen.getByText('safe')).toBeTruthy();
  expect(screen.getByText(/Rows: 2/)).toBeTruthy();
});

it.each([['gateway_offline', 'offline'], ['already_described', 'already described'], ['confirmation_required', 'Confirm the description']])('shows describe error %s', async (code, text) => {
  api.describe.mockRejectedValue({ response: { data: { error: { code } } } });
  await ready(); fireEvent.click(screen.getByRole('button', { name: 'Describe' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm describe' }));
  expect(await screen.findByText(new RegExp(text))).toBeTruthy();
});

it('renders failed and stale descriptions', async () => {
  api.files.mockResolvedValue({ files: [{ ...file, description: { ...file.description, state: 'failed', failure_code: 'read_error' } }, { ...file, file_id: 'another', display_name: 'another.csv', description: { ...file.description, state: 'stale' } }], next_cursor: null });
  await ready();
  expect(screen.getByText(/gateway could not read this file/)).toBeTruthy();
  expect(screen.getByText(/stale. Describe again/)).toBeTruthy();
});

it.each([['unsupported_format', 'format cannot be described'], ['read_error', 'could not read'], ['gateway_timeout', 'did not finish'], ['future_failure', 'could not be described']])('renders description failure %s', async (code, text) => {
  api.files.mockResolvedValue({ files: [{ ...file, description: { ...file.description, state: 'failed', failure_code: code } }], next_cursor: null });
  await ready();
  expect(screen.getByText(new RegExp(text))).toBeTruthy();
});

it('loads the next file page without showing a path', async () => {
  api.files.mockResolvedValueOnce({ files: [file], next_cursor: file.file_id })
    .mockResolvedValueOnce({ files: [{ ...file, file_id: 'second', display_name: 'second.csv' }], next_cursor: null });
  await ready();
  fireEvent.click(screen.getByRole('button', { name: 'Load more files' }));
  expect(await screen.findByText('second.csv')).toBeTruthy();
  expect(api.files).toHaveBeenCalledWith('gateway-1', file.file_id);
  expect(document.body.textContent).not.toContain('/private/source/data.csv');
});

it('clears files, cursors and messages while loading a different route id', async () => {
  api.files.mockResolvedValueOnce({ files: [file], next_cursor: file.file_id })
    .mockResolvedValueOnce({ files: [], next_cursor: null });
  api.received.mockResolvedValueOnce({ messages: [{ seq: 1, received_at: '2026-01-01T00:00:00Z', message_type: 'hello', body: bodies.hello }], next_cursor: '1' })
    .mockResolvedValueOnce({ messages: [], next_cursor: null });
  const view = render(<GatewayPage />);
  await screen.findByText('file-01234567.csv');
  await screen.findByText(/test-only-nonce/);
  fireEvent.click(screen.getByLabelText('I have read the identity notice.'));
  expect((screen.getByLabelText('I have read the identity notice.') as HTMLInputElement).checked).toBe(true);
  route.id = 'gateway-2';
  api.get.mockResolvedValueOnce({ ...gateway, name: 'Second gateway' });
  view.rerender(<GatewayPage />);
  expect(screen.getByText('Loading…')).toBeTruthy();
  expect(await screen.findByText('Second gateway')).toBeTruthy();
  expect((screen.getByLabelText('I have read the identity notice.') as HTMLInputElement).checked).toBe(false);
  expect(screen.queryByText('file-01234567.csv')).toBeNull();
  expect(screen.queryByText(/test-only-nonce/)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Load more files' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Load more messages' })).toBeNull();
});

it('ignores a revoke refresh for the previous route id', async () => {
  let resolveRefresh!: (value: SellerGateway) => void;
  const view = render(<GatewayPage />);
  await screen.findByText('Test gateway', { selector: 'h1' });
  api.get.mockImplementationOnce(() => new Promise<SellerGateway>(resolve => { resolveRefresh = resolve; }));
  fireEvent.click(screen.getByRole('button', { name: 'Revoke gateway' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm revoke' }));
  await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
  route.id = 'gateway-2';
  api.get.mockResolvedValueOnce({ ...gateway, name: 'Second gateway' });
  view.rerender(<GatewayPage />);
  expect(await screen.findByText('Second gateway')).toBeTruthy();
  await act(async () => { resolveRefresh({ ...gateway, name: 'First gateway revoked', status: 'revoked' }); });
  expect(screen.getByText('Second gateway', { selector: 'h1' })).toBeTruthy();
  expect(screen.queryByText('First gateway revoked')).toBeNull();
});

it('paginates received messages, filters, shows gaps, and formats vector bodies', async () => {
  api.received.mockResolvedValueOnce({ messages: [{ seq: 1, received_at: '2026-01-01T00:00:00Z', message_type: 'hello', body: bodies.hello }], next_cursor: '1' })
    .mockResolvedValueOnce({ messages: [{ seq: 3, received_at: '2026-01-01T00:00:00Z', message_type: 'inventory', body: bodies.inventory }], next_cursor: null })
    .mockResolvedValueOnce({ messages: [{ seq: 4, received_at: '2026-01-01T00:00:00Z', message_type: 'receipt', body: bodies.receipt }], next_cursor: null });
  await ready();
  expect(screen.getByText(/test-only-nonce/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Load more messages' }));
  expect(await screen.findByText('Messages 2 to 2 missing')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Message type'), { target: { value: 'receipt' } });
  await waitFor(() => expect(api.received).toHaveBeenCalledWith('gateway-1', undefined, 100, 'receipt'));
  expect(screen.getByText(/blocks_verified/)).toBeTruthy();
  expect(screen.queryByText(/buyer_identifier/)).toBeNull();
});

it('renders each contract vector message body as formatted JSON', async () => {
  api.received.mockResolvedValue({ messages: Object.entries(bodies).map(([message_type, body], index) => ({ seq: index + 1, received_at: '2026-01-01T00:00:00Z', message_type, body })), next_cursor: null });
  await ready();
  const entries = screen.getAllByRole('listitem');
  expect(entries).toHaveLength(9);
  for (const body of Object.values(bodies)) expect(document.body.textContent).toContain(JSON.stringify(body, null, 2));
  expect(document.body.textContent).not.toContain('buyer_identifier');
});

it.each(['dns_failed', 'address_not_public', 'tls_failed', 'redirect_refused', 'timeout', 'bad_signature', 'gateway_mismatch', 'response_too_large', 'future_failure'])('shows door failure %s', async (code) => {
  api.get.mockResolvedValue({ ...gateway, door_check: { state: 'failed', checked_at: '2026-01-01T00:00:00Z', failure_code: code, certificate_flags: [] } } satisfies SellerGateway);
  await ready();
  const messages: Record<string, string> = {
    dns_failed: 'could not be found in DNS', address_not_public: 'nonpublic address', tls_failed: 'TLS connection failed',
    redirect_refused: 'redirected the check', timeout: 'did not respond in time', bad_signature: 'signature did not verify',
    gateway_mismatch: 'different gateway', response_too_large: 'exceeded the allowed size', future_failure: 'door check failed',
  };
  expect(screen.getByRole('alert').textContent).toContain(messages[code]);
});

it.each([['door_check_rate_limited', 'Wait a minute'], ['door_url_missing', 'Add a door URL']])('shows door start error %s', async (code, text) => {
  api.door.mockRejectedValue({ response: { data: { error: { code } } } });
  await ready(); fireEvent.click(screen.getByRole('button', { name: 'Run door check' }));
  expect(await screen.findByText(new RegExp(text))).toBeTruthy();
});

it.each(['passed', 'failed'])('polls door check to %s', async (state) => {
  await ready();
  api.get.mockResolvedValue({ ...gateway, door_check: { state, checked_at: '2026-01-01T00:00:00Z', failure_code: state === 'failed' ? 'dns_failed' : null, certificate_flags: [] } });
  vi.useFakeTimers();
  fireEvent.click(screen.getByRole('button', { name: 'Run door check' }));
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
  expect(screen.getByText(new RegExp(`State: ${state}`))).toBeTruthy();
});

const pendingGateway = { ...gateway, door_check: { ...gateway.door_check, state: 'pending' as const } };
async function readyWithFakeTimers() {
  vi.useFakeTimers();
  await act(async () => { render(<GatewayPage />); });
  expect(screen.getByText('Test gateway', { selector: 'h1' })).toBeTruthy();
}

it('polls an initially pending door check once after two seconds and renders passed', async () => {
  api.get.mockResolvedValueOnce(pendingGateway).mockResolvedValueOnce({ ...gateway, door_check: { ...gateway.door_check, state: 'passed' } });
  await readyWithFakeTimers();
  expect(api.get).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(1_999); });
  expect(api.get).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(api.get).toHaveBeenCalledTimes(2);
  expect(screen.getByText(/State: passed/)).toBeTruthy();
});

it('keeps polling a pending check after Run door check is rate limited', async () => {
  api.get.mockResolvedValueOnce(pendingGateway).mockResolvedValueOnce({ ...gateway, door_check: { ...gateway.door_check, state: 'passed' } });
  api.door.mockRejectedValueOnce({ response: { data: { error: { code: 'door_check_rate_limited' } } } });
  await readyWithFakeTimers();
  fireEvent.click(screen.getByRole('button', { name: 'Run door check' }));
  await act(async () => { await Promise.resolve(); });
  expect(screen.getByText(/Wait a minute/)).toBeTruthy();
  await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
  expect(api.get).toHaveBeenCalledTimes(2);
  expect(screen.getByText(/State: passed/)).toBeTruthy();
  expect(screen.queryByText(/Wait a minute/)).toBeNull();
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  expect(api.get).toHaveBeenCalledTimes(2);
});

it('polls a pending door URL PATCH and renders the failure code message', async () => {
  api.patch.mockResolvedValueOnce(pendingGateway);
  api.get.mockResolvedValueOnce(gateway).mockResolvedValueOnce({ ...gateway, door_check: { ...gateway.door_check, state: 'failed', failure_code: 'dns_failed' } });
  await readyWithFakeTimers();
  fireEvent.click(screen.getByRole('button', { name: 'Save door URL' }));
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
  expect(api.get).toHaveBeenCalledTimes(2);
  expect(screen.getByText(/State: failed/)).toBeTruthy();
  expect(screen.getByText(/could not be found in DNS/)).toBeTruthy();
});

it('stops a pending door check at thirty seconds', async () => {
  api.get.mockResolvedValue(pendingGateway);
  await readyWithFakeTimers();
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  expect(api.get).toHaveBeenCalledTimes(16);
  expect(screen.getByText(/still pending/)).toBeTruthy();
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
  expect(api.get).toHaveBeenCalledTimes(16);
});

it('continues after one failed refresh and clears the error when the check resolves', async () => {
  api.get.mockResolvedValueOnce(pendingGateway).mockRejectedValueOnce(new Error('network'))
    .mockResolvedValueOnce({ ...gateway, door_check: { ...gateway.door_check, state: 'failed', failure_code: 'dns_failed' } });
  await readyWithFakeTimers();
  await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
  expect(api.get).toHaveBeenCalledTimes(2);
  expect(screen.queryByText(/could not be refreshed/)).toBeNull();
  await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
  expect(api.get).toHaveBeenCalledTimes(3);
  expect(screen.getByText(/State: failed/)).toBeTruthy();
  expect(screen.queryByText(/could not be refreshed/)).toBeNull();
});

it('shows still pending after a failed refresh followed by successful pending refreshes', async () => {
  api.get.mockResolvedValueOnce(pendingGateway).mockRejectedValueOnce(new Error('network')).mockResolvedValue(pendingGateway);
  await readyWithFakeTimers();
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  expect(screen.getByText(/still pending/)).toBeTruthy();
  expect(screen.queryByText(/could not be refreshed/)).toBeNull();
});

it('shows a refresh error only after the deadline if refreshes keep failing', async () => {
  api.get.mockResolvedValueOnce(pendingGateway).mockRejectedValue(new Error('network'));
  await readyWithFakeTimers();
  await act(async () => { await vi.advanceTimersByTimeAsync(28_000); });
  expect(screen.queryByText(/could not be refreshed/)).toBeNull();
  await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
  expect(screen.getByText(/could not be refreshed/)).toBeTruthy();
});

it('cancels the existing door loop when Run door check starts a new one', async () => {
  api.get.mockResolvedValue(pendingGateway);
  await readyWithFakeTimers();
  await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
  fireEvent.click(screen.getByRole('button', { name: 'Run door check' }));
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
  expect(api.get).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
  expect(api.get).toHaveBeenCalledTimes(2);
});

it('makes no more door requests after unmount', async () => {
  api.get.mockResolvedValue(pendingGateway);
  vi.useFakeTimers();
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(<GatewayPage />); });
  expect(api.get).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  expect(api.get).toHaveBeenCalledTimes(1);
});
