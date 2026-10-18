// @vitest-environment jsdom
import React from 'react';
import { cleanup, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import EditPage from '@/app/dashboard/listings/[id]/edit/page';

const api = vi.hoisted(() => ({
  getListing: vi.fn(), updateListing: vi.fn(), publishListing: vi.fn(),
  unpublishListing: vi.fn(), toast: vi.fn(), router: { push: vi.fn() },
}));
vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'listing' }), useRouter: () => api.router }));
vi.mock('@/api/listings', () => api);
vi.mock('@/components/Toast', () => ({ useToast: () => ({ toast: api.toast }) }));
vi.mock('@/api/sellerWorkspace', () => ({ getSellerWorkspaceCapabilities: async () => ({}) }));
vi.mock('@/api/sellerLegalIdentity', () => ({ getSellerLegalIdentity: vi.fn(), refreshSellerLegalIdentity: vi.fn(), legalIdentityFailure: () => null, LEGAL_IDENTITY_SUPPORT_PATH: '/support' }));
vi.mock('@/components/listings/SellerAtAGlance', () => ({ default: () => null }));
vi.mock('@/components/listings/SellerShareControls', () => ({ default: () => null }));
vi.mock('@/components/seller-workspace/SellerLicenseSelection', () => ({ default: () => null }));
vi.mock('@/components/gateways/ListingGatewaySource', () => ({ default: () => null }));
vi.mock('@/components/onboarding/SellerSetupProgressBar', () => ({ notifyCapabilitiesChanged: vi.fn() }));

const listing = {
  title: 'Synthetic listing', description: 'Synthetic description', category: 'Technology',
  tags: ['existing tag'], pricing: { price: 25, pricing_type: 'one_time' },
  data_format: 'json', source_row_count: 42, compliance_frameworks: ['GDPR'],
  compliance_notes: 'Synthetic notes', status: 'draft',
};
const networkDenied = vi.fn(() => { throw new Error('Network forbidden'); });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', networkDenied);
  vi.stubGlobal('XMLHttpRequest', networkDenied);
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000000');
  api.getListing.mockResolvedValue(listing);
  api.updateListing.mockResolvedValue({});
});
afterEach(() => {
  cleanup();
  expect(api.publishListing).not.toHaveBeenCalled();
  expect(api.unpublishListing).not.toHaveBeenCalled();
  expect(networkDenied).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function mount() {
  render(<EditPage />);
  await screen.findByRole('button', { name: 'Save Draft' });
}
function fixedUSD() {
  expect(screen.queryAllByRole('option', { name: /^(EUR|GBP)$/ })).toHaveLength(0);
  const currency = screen.getByRole<HTMLInputElement>('textbox', { name: 'Currency' });
  expect(currency.value).toBe('USD');
  expect(currency.readOnly).toBe(true);
  expect(screen.queryByRole('combobox', { name: /currency/i })).toBeNull();
  expect(screen.queryByRole('option', { name: /^(USD|EUR|GBP)$/ })).toBeNull();
  expect(screen.queryByText(/EUR|GBP/)).toBeNull();
  expect(screen.getByText('Price (USD)')).toBeTruthy();
}
async function save() {
  fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
  await waitFor(() => expect(api.toast).toHaveBeenCalledWith('Listing saved', 'success'));
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Save Draft' }).disabled).toBe(false);
  expect(api.updateListing).toHaveBeenCalledOnce();
}

it('shows accessible fixed USD without unsupported choices before and after a normal changed-price save', async () => {
  await mount();
  fixedUSD();
  const price = screen.getByDisplayValue<HTMLInputElement>('25');
  expect(price.type).toBe('number');
  expect(price.min).toBe('1');
  expect(price.step).toBe('0.01');
  fireEvent.change(price, { target: { value: '30.75' } });
  fireEvent.click(screen.getByRole('radio', { name: 'Subscription' }));
  fireEvent.change(screen.getByDisplayValue('Synthetic listing'), { target: { value: 'Updated synthetic listing' } });
  const tag = screen.getByPlaceholderText<HTMLInputElement>('Add a tag');
  fireEvent.change(tag, { target: { value: '  composed tag  ' } });
  fireEvent.compositionStart(tag);
  const composing = createEvent.keyDown(tag, { key: 'Enter', isComposing: true, keyCode: 13, bubbles: true, cancelable: true });
  fireEvent(tag, composing);
  expect(composing.defaultPrevented).toBe(false);
  expect(tag.value).toBe('  composed tag  ');
  expect(screen.queryByText('composed tag')).toBeNull();
  fireEvent.compositionEnd(tag);
  fireEvent.keyDown(tag, { key: 'Enter', isComposing: false, keyCode: 13 });
  expect(screen.getAllByText('composed tag')).toHaveLength(1);
  await save();
  expect(api.updateListing).toHaveBeenCalledWith('listing', {
    title: 'Updated synthetic listing', description: listing.description, category: listing.category,
    tags: ['existing tag', 'composed tag'], price: 30.75, pricing_type: 'subscription',
    data_format: 'json', source_row_count: 42, compliance_frameworks: ['GDPR'],
    compliance_notes: 'Synthetic notes',
  });
  expect(api.updateListing.mock.calls[0][1]).not.toHaveProperty('currency');
  expect(price.value).toBe('30.75');
  fixedUSD();
});

it.each([
  { name: 'nested price takes precedence', pricing: { price: 25, pricing_type: 'subscription' }, price: 99, expected: 25, type: 'subscription' },
  { name: 'flat price', pricing: undefined, price: 18.45, expected: 18.45, type: 'one_time' },
  { name: 'zero is preserved', pricing: { price: 0, pricing_type: 'one_time' }, price: 99, expected: 0, type: 'one_time' },
  { name: 'missing price uses existing default', pricing: undefined, price: undefined, expected: 10, type: 'one_time' },
])('preserves $name on an ordinary Save Draft', async ({ pricing, price, expected, type }) => {
  api.getListing.mockResolvedValue({ ...listing, pricing, price });
  await mount();
  fixedUSD();
  expect(screen.getByDisplayValue<HTMLInputElement>(String(expected)).value).toBe(String(expected));
  await save();
  expect(api.updateListing).toHaveBeenCalledWith('listing', {
    title: listing.title, description: listing.description, category: listing.category,
    tags: ['existing tag'], price: expected, pricing_type: type, data_format: 'json',
    source_row_count: 42, compliance_frameworks: ['GDPR'], compliance_notes: 'Synthetic notes',
  });
  fixedUSD();
});
