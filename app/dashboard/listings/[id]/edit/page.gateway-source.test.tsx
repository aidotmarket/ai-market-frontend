// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import EditListingPage from './page';
import { file, gateway } from '@/app/dashboard/gateways/fixtures';

const listingApi = vi.hoisted(() => ({ getListing: vi.fn(), updateListing: vi.fn(), publishListing: vi.fn(), unpublishListing: vi.fn() }));
const gatewayApi = vi.hoisted(() => ({ listSellerGateways: vi.fn(), listGatewayFiles: vi.fn(), getGatewayListingSource: vi.fn(), saveGatewayListingSource: vi.fn() }));
const toast = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'listing-1' }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock('@/api/listings', () => listingApi);
vi.mock('@/api/sellerGateways', () => gatewayApi);
vi.mock('@/api/sellerWorkspace', () => ({ getSellerWorkspaceCapabilities: () => Promise.resolve({}) }));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ toast }) }));
vi.mock('@/components/listings/SellerAtAGlance', () => ({ default: () => null }));
vi.mock('@/components/listings/SellerShareControls', () => ({ default: () => null }));

const draft = { id: 'listing-1', title: 'Example', status: 'draft', tags: [], pricing: { price: 10, pricing_type: 'one_time' } };
const error = (code: string, details?: object) => ({ response: { data: { error: { code, details } } } });

beforeEach(() => {
  vi.resetAllMocks();
  listingApi.getListing.mockResolvedValue(draft);
  listingApi.publishListing.mockResolvedValue({});
  gatewayApi.listSellerGateways.mockResolvedValue([{ ...gateway, identity_ack_at: null, blockers: [{ code: 'identity_ack_missing' }], can_publish: false }]);
  gatewayApi.listGatewayFiles.mockResolvedValue({ files: [file], next_cursor: null });
  gatewayApi.getGatewayListingSource.mockResolvedValue(null);
  gatewayApi.saveGatewayListingSource.mockResolvedValue({ type: 'gateway', gateway_id: gateway.gateway_id, file_ids: [file.file_id] });
});
afterEach(cleanup);

async function chooseGateway() {
  render(<EditListingPage />);
  const select = await screen.findByRole('combobox', { name: 'Gateway' });
  fireEvent.change(select, { target: { value: gateway.gateway_id } });
  await screen.findByText(file.display_name);
}

it.each(['gateway_disabled', 'network_error'])('hides the section when gateway list fails with %s', async code => {
  gatewayApi.listSellerGateways.mockRejectedValue(error(code));
  render(<EditListingPage />);
  await screen.findByRole('button', { name: 'Save Draft' });
  await waitFor(() => expect(gatewayApi.listSellerGateways).toHaveBeenCalled());
  expect(screen.queryByText('Deliver from a gateway')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
});

it('links to gateways when the seller has none', async () => {
  gatewayApi.listSellerGateways.mockResolvedValue([]);
  render(<EditListingPage />);
  expect(await screen.findByText(/You have no gateways yet\./)).toBeTruthy();
  expect(screen.getByRole('link', { name: 'View gateways' }).getAttribute('href')).toBe('/dashboard/gateways');
  expect(screen.queryByRole('combobox', { name: 'Gateway' })).toBeNull();
});

it('keeps Publish and the identity reminder hidden for a draft without a saved gateway source', async () => {
  render(<EditListingPage />);
  await screen.findByRole('combobox', { name: 'Gateway' });
  expect(gatewayApi.getGatewayListingSource).toHaveBeenCalledWith('listing-1');
  expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
  expect(screen.queryByText(/Before this listing goes live/)).toBeNull();
  fireEvent.change(screen.getByRole('combobox', { name: 'Gateway' }), { target: { value: gateway.gateway_id } });
  await screen.findByText(file.display_name);
  expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
  expect(screen.queryByText(/Before this listing goes live/)).toBeNull();
});

it('restores the saved gateway and files, then hides Publish on the first change', async () => {
  gatewayApi.getGatewayListingSource.mockResolvedValue({ type: 'gateway', gateway_id: gateway.gateway_id, file_ids: [file.file_id, 'later'] });
  gatewayApi.listGatewayFiles.mockResolvedValueOnce({ files: [file], next_cursor: 'next' })
    .mockResolvedValueOnce({ files: [{ ...file, file_id: 'later', display_name: 'later.csv' }], next_cursor: null });
  render(<EditListingPage />);
  const select = await screen.findByRole('combobox', { name: 'Gateway' });
  expect((select as HTMLSelectElement).value).toBe(gateway.gateway_id);
  await screen.findByText(file.display_name);
  expect(screen.getByText(file.display_name).closest('label')!.querySelector('input')!.checked).toBe(true);
  expect(screen.getByText('1 selected file is not in the current file list.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Publish' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Review and acknowledge the gateway identity notice' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Load more files' }));
  await screen.findByText('later.csv');
  expect(screen.getByText('later.csv').closest('label')!.querySelector('input')!.checked).toBe(true);
  expect(screen.queryByText(/not in the current file list/)).toBeNull();
  fireEvent.click(screen.getByText(file.display_name).closest('label')!.querySelector('input')!);
  expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
  expect(screen.queryByText(/Before this listing goes live/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Save gateway source' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Publish' })).toBeTruthy());
  expect(gatewayApi.saveGatewayListingSource).toHaveBeenCalledWith('listing-1', { type: 'gateway', gateway_id: gateway.gateway_id, file_ids: ['later'] });
});

it.each(['listing_not_found', 'gateway_disabled', 'network_error'])('keeps the draft empty when source load fails with %s', async code => {
  gatewayApi.getGatewayListingSource.mockRejectedValue(error(code));
  render(<EditListingPage />);
  await screen.findByRole('combobox', { name: 'Gateway' });
  expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
});

it('keeps the existing Publish action for an unlisted listing', async () => {
  listingApi.getListing.mockResolvedValue({ ...draft, status: 'unlisted' });
  render(<EditListingPage />);
  const publish = await screen.findByRole('button', { name: 'Publish' });
  expect(screen.queryByText('Deliver from a gateway')).toBeNull();
  expect(screen.queryByText(/Before this listing goes live/)).toBeNull();
  fireEvent.click(publish);
  await waitFor(() => expect(listingApi.publishListing).toHaveBeenCalledWith('listing-1'));
});

it('does not offer source editing for a published listing', async () => {
  listingApi.getListing.mockResolvedValue({ ...draft, status: 'published' });
  render(<EditListingPage />);
  await screen.findByRole('button', { name: 'Unpublish' });
  expect(screen.queryByText('Deliver from a gateway')).toBeNull();
  expect(gatewayApi.listSellerGateways).not.toHaveBeenCalled();
  expect(gatewayApi.getGatewayListingSource).not.toHaveBeenCalled();
});

it('explains both undescribed and missing selected files', async () => {
  gatewayApi.listGatewayFiles.mockResolvedValue({ files: [file, { ...file, file_id: 'missing', display_name: 'missing.csv', present: false }], next_cursor: null });
  await chooseGateway();
  fireEvent.click(screen.getByText(file.display_name).closest('label')!.querySelector('input')!);
  fireEvent.click(screen.getByText('missing.csv').closest('label')!.querySelector('input')!);
  expect(screen.getByText(/file-01234567.csv needs a current description/)).toBeTruthy();
  expect(screen.getByText(/missing.csv is missing from the latest inventory/)).toBeTruthy();
  expect(screen.getAllByText('Review gateway file')).toHaveLength(2);
});

it('paginates, shows only safe file fields, explains non-offerable selections, and saves the exact source', async () => {
  const stale = { ...file, file_id: 'second', display_name: 'second.csv', description: { ...file.description, state: 'stale' }, offerable: false, path: '/private/source/data.csv' };
  gatewayApi.listGatewayFiles.mockResolvedValueOnce({ files: [file], next_cursor: 'next' }).mockResolvedValueOnce({ files: [stale], next_cursor: null });
  await chooseGateway();
  expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
  expect(screen.queryByText(/after purchase, buyers learn your door hostname/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Load more files' }));
  await screen.findByText('second.csv');
  fireEvent.click(screen.getByText('second.csv').closest('label')!.querySelector('input')!);
  expect(screen.getByText(/second.csv changed. Describe it again/)).toBeTruthy();
  expect(document.body.textContent).not.toContain('/private/source/data.csv');
  fireEvent.click(screen.getByRole('button', { name: 'Save gateway source' }));
  await waitFor(() => expect(gatewayApi.saveGatewayListingSource).toHaveBeenCalledWith('listing-1', { type: 'gateway', gateway_id: gateway.gateway_id, file_ids: ['second'] }));
  expect(screen.getByText('Gateway source saved.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Publish' })).toBeTruthy();
  expect(screen.getByText(/after purchase, buyers learn your door hostname/)).toBeTruthy();
  expect(screen.getByText(/Review and acknowledge the gateway identity notice/).closest('a')?.getAttribute('href')).toBe(`/dashboard/gateways/${gateway.gateway_id}`);
});

it('hides Publish on the first source change and restores it only after a successful save', async () => {
  const secondFile = { ...file, file_id: 'second', display_name: 'second.csv' };
  const secondGateway = { ...gateway, gateway_id: 'gateway-2', name: 'Second gateway', identity_ack_at: '2026-01-01T00:00:00Z' };
  gatewayApi.listSellerGateways.mockResolvedValue([{ ...gateway, identity_ack_at: null }, secondGateway]);
  gatewayApi.listGatewayFiles.mockResolvedValue({ files: [file, secondFile], next_cursor: null });
  await chooseGateway();
  fireEvent.click(screen.getByText(file.display_name).closest('label')!.querySelector('input')!);
  fireEvent.click(screen.getByRole('button', { name: 'Save gateway source' }));
  await screen.findByText(/Gateway source saved/);
  expect(screen.getByRole('button', { name: 'Publish' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Review and acknowledge the gateway identity notice' }).getAttribute('href')).toBe(`/dashboard/gateways/${gateway.gateway_id}`);

  fireEvent.click(screen.getByText(secondFile.display_name).closest('label')!.querySelector('input')!);
  expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
  expect(screen.queryByText(/Before this listing goes live/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Save gateway source' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Publish' })).toBeTruthy());
  expect(gatewayApi.saveGatewayListingSource).toHaveBeenLastCalledWith('listing-1', { type: 'gateway', gateway_id: gateway.gateway_id, file_ids: [file.file_id, secondFile.file_id] });

  fireEvent.change(screen.getByRole('combobox', { name: 'Gateway' }), { target: { value: secondGateway.gateway_id } });
  expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
  await screen.findByText(secondFile.display_name);
  fireEvent.click(screen.getByText(secondFile.display_name).closest('label')!.querySelector('input')!);
  gatewayApi.saveGatewayListingSource.mockRejectedValueOnce(error('file_not_found'));
  fireEvent.click(screen.getByRole('button', { name: 'Save gateway source' }));
  expect(await screen.findByText(/selected file is no longer available/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
  expect(screen.queryByText(/Before this listing goes live/)).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Save gateway source' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Publish' })).toBeTruthy());
  expect(gatewayApi.saveGatewayListingSource).toHaveBeenLastCalledWith('listing-1', { type: 'gateway', gateway_id: secondGateway.gateway_id, file_ids: [secondFile.file_id] });
  expect(screen.queryByText(/Before this listing goes live/)).toBeNull();
});

it.each([
  ['invalid_gateway_source', '1 to 200'], ['gateway_not_found', 'no longer available'],
  ['listing_not_found', 'listing is no longer available'], ['file_not_found', 'selected file is no longer available'],
  ['listing_not_draft', 'Only a draft listing'],
])('shows a specific save error for %s', async (code, text) => {
  gatewayApi.saveGatewayListingSource.mockRejectedValue(error(code));
  await chooseGateway();
  fireEvent.click(screen.getByText(file.display_name).closest('label')!.querySelector('input')!);
  fireEvent.click(screen.getByRole('button', { name: 'Save gateway source' }));
  expect(await screen.findByText(new RegExp(text))).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
  expect(screen.queryByText(/Before this listing goes live/)).toBeNull();
});

it('renders publish blockers with known file names and handles other gateway publish codes', async () => {
  await chooseGateway();
  fireEvent.click(screen.getByText(file.display_name).closest('label')!.querySelector('input')!);
  fireEvent.click(screen.getByRole('button', { name: 'Save gateway source' }));
  await screen.findByText('Gateway source saved.');
  listingApi.publishListing.mockRejectedValueOnce(error('gateway_not_publishable', { blockers: [{ code: 'file_not_described', file_id: file.file_id }, { code: 'identity_ack_missing' }] }))
    .mockRejectedValueOnce(error('gateway_offline')).mockRejectedValueOnce(error('listing_not_draft'));
  fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
  expect(await screen.findByText(new RegExp(`${file.display_name} needs a current description`))).toBeTruthy();
  expect(screen.getAllByText(/Read and acknowledge the identity notice/).length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
  expect(await screen.findByText(/gateway is offline. Reconnect it before publishing/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
  expect(await screen.findByText(/Only a draft listing can be published/)).toBeTruthy();
});
