// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EditListingPage from './page';

const routerPush = vi.hoisted(() => vi.fn());
const router = vi.hoisted(() => ({ push: routerPush }));

const listingsApi = vi.hoisted(() => ({
  getListing: vi.fn(),
  updateListing: vi.fn(),
  unpublishListing: vi.fn(),
  publishListing: vi.fn(),
}));
const capabilitiesApi = vi.hoisted(() => ({getSellerWorkspaceCapabilities:vi.fn()}));
vi.mock('@/api/sellerWorkspace',()=>capabilitiesApi);
const identityApi = vi.hoisted(() => ({getSellerLegalIdentity:vi.fn(),refreshSellerLegalIdentity:vi.fn(),saveSellerLegalIdentity:vi.fn()}));
vi.mock('@/api/sellerLegalIdentity',async(importOriginal)=>({...(await importOriginal<typeof import('@/api/sellerLegalIdentity')>()),...identityApi}));
const knownIdentity={status:'known',source:'stripe_connect',legal_name:'Sam Seller Ltd',jurisdiction:'US',version:4,seller_editable:false};

const toast = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'listing-1' }),
  useRouter: () => router,
}));

vi.mock('@/api/listings', () => listingsApi);
vi.mock('@/components/Toast', () => ({
  useToast: () => ({ toast }),
}));
vi.mock('@/components/listings/SellerShareControls', () => ({
  default: () => <div data-testid="seller-share-controls" />,
}));

const baseListing = {
  title: 'Example listing',
  description: 'Useful dataset',
  category: 'Technology',
  tags: ['finance'],
  pricing: { price: 25, pricing_type: 'one_time' },
  data_format: 'csv',
  row_count: 100,
  compliance_frameworks: ['GDPR'],
  compliance_notes: 'Reviewed by legal.',
  status: 'published',
};

describe('EditListingPage', () => {
  beforeEach(() => {
    capabilitiesApi.getSellerWorkspaceCapabilities.mockResolvedValue({});
    identityApi.refreshSellerLegalIdentity.mockResolvedValue(knownIdentity);
    identityApi.getSellerLegalIdentity.mockResolvedValue(knownIdentity);
    listingsApi.updateListing.mockResolvedValue({});
    listingsApi.unpublishListing.mockResolvedValue({});
    listingsApi.publishListing.mockResolvedValue({});
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows Publish and not Unpublish for unlisted listings, then marks publish success locally', async () => {
    listingsApi.getListing.mockResolvedValue({
      ...baseListing,
      status: 'unlisted',
    });

    render(<EditListingPage />);

    const publishButton = await screen.findByRole('button', { name: /^Publish$/ });
    expect(screen.queryByRole('button', { name: /^Unpublish$/ })).toBeNull();

    fireEvent.click(publishButton);

    await waitFor(() => {
      expect(listingsApi.publishListing).toHaveBeenCalledWith('listing-1');
    });
    expect(identityApi.refreshSellerLegalIdentity).not.toHaveBeenCalled();
    expect(identityApi.getSellerLegalIdentity).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith('Listing published', 'success');
    expect(await screen.findByText('published')).toBeTruthy();
    expect(screen.queryByText('How can buyers use this data?')).toBeNull();
  });

  it('keeps publish disabled until licence covenant authority is confirmed and posts the exact selection',async()=>{
    listingsApi.getListing.mockResolvedValue({...baseListing,status:'unlisted'});
    capabilitiesApi.getSellerWorkspaceCapabilities.mockResolvedValue({listing_licenses:true});
    render(<EditListingPage/>);
    const publish=await screen.findByRole('button',{name:'Publish'}) as HTMLButtonElement;
    expect(within(screen.getByText('How can buyers use this data?').closest('fieldset')!).getAllByRole('radio')).toHaveLength(2);expect((screen.getByLabelText('Allow AI/ML training') as HTMLInputElement).checked).toBe(true);
    expect(publish.disabled).toBe(true);
    const details=screen.getByText('Read the summary and full terms').closest('details')!;
    Object.defineProperty(details,'open',{value:true,configurable:true});fireEvent(details,new Event('toggle'));
    fireEvent.change(screen.getByLabelText('Signer full name'),{target:{value:'Sam Seller'}});
    fireEvent.change(screen.getByLabelText('Signer title'),{target:{value:'Director'}});
    fireEvent.click(screen.getByLabelText('Confirm covenant and authority'));
    expect(publish.disabled).toBe(false);fireEvent.click(publish);
    await waitFor(()=>expect(listingsApi.publishListing).toHaveBeenCalledWith('listing-1',{
      kind:'standard',version:'1.0',ai_training:true,license_document_id:null,
      license_sha256:'4b05dbcd0c186746d3deab6c68beaebba88610de8e85122efb4d527edb1263c6',rider_sha256:null,
      covenant_code:'marketplace-listing',covenant_version:'1.0',covenant_sha256:'a91234b67bf7467a0c80f6e1caa47b563032e94751146901b796eaaf220431af',
      seller_acceptance:{signer_name:'Sam Seller',signer_title:'Director',authority_confirmed:true},
      identity_version:4,
    }));
  });

  async function completeLicence(){
    const publish=await screen.findByRole('button',{name:'Publish'}) as HTMLButtonElement;
    const details=screen.getByText('Read the summary and full terms').closest('details')!;
    Object.defineProperty(details,'open',{value:true,configurable:true});fireEvent(details,new Event('toggle'));
    fireEvent.change(screen.getByLabelText('Signer full name'),{target:{value:'Sam Seller'}});
    fireEvent.change(screen.getByLabelText('Signer title'),{target:{value:'Director'}});
    fireEvent.click(screen.getByLabelText('Confirm covenant and authority'));
    expect(publish.disabled).toBe(false);
    return publish;
  }

  it('refreshes then reads the legal identity at publish time and sends its version',async()=>{
    const order:string[]=[];
    identityApi.refreshSellerLegalIdentity.mockImplementation(async()=>{order.push('refresh');return knownIdentity;});
    identityApi.getSellerLegalIdentity.mockImplementation(async()=>{order.push('get');return knownIdentity;});
    listingsApi.getListing.mockResolvedValue({...baseListing,status:'unlisted'});
    capabilitiesApi.getSellerWorkspaceCapabilities.mockResolvedValue({listing_licenses:true});
    render(<EditListingPage/>);
    const publish=await completeLicence();
    expect(order).toEqual([]);
    fireEvent.click(publish);
    await waitFor(()=>expect(listingsApi.publishListing).toHaveBeenCalled());
    expect(order).toEqual(['refresh','get']);
    expect(listingsApi.publishListing.mock.calls[0][1].identity_version).toBe(4);
  });

  it('does not block a seller without a personal legal identity (organization sellers resolve identity server-side)',async()=>{
    const required={status:'required',source:null,legal_name:null,jurisdiction:null,version:null,seller_editable:true};
    identityApi.refreshSellerLegalIdentity.mockRejectedValue(new Error('stripe unavailable'));identityApi.getSellerLegalIdentity.mockResolvedValue(required);
    listingsApi.getListing.mockResolvedValue({...baseListing,status:'unlisted'});
    capabilitiesApi.getSellerWorkspaceCapabilities.mockResolvedValue({listing_licenses:true});
    render(<EditListingPage/>);
    fireEvent.click(await completeLicence());
    await waitFor(()=>expect(listingsApi.publishListing).toHaveBeenCalled());
    expect(listingsApi.publishListing.mock.calls[0][1]).not.toHaveProperty('identity_version');
    expect(listingsApi.publishListing.mock.calls[0][1].seller_acceptance.authority_confirmed).toBe(true);
  });

  it('explains a backend legal identity refusal instead of a generic failure',async()=>{
    const required={status:'required',source:null,legal_name:null,jurisdiction:null,version:null,seller_editable:true};
    identityApi.getSellerLegalIdentity.mockResolvedValue(required);
    listingsApi.publishListing.mockRejectedValue({response:{status:409,data:{detail:{code:'SELLER_LEGAL_IDENTITY_REQUIRED'}}}});
    listingsApi.getListing.mockResolvedValue({...baseListing,status:'unlisted'});
    capabilitiesApi.getSellerWorkspaceCapabilities.mockResolvedValue({listing_licenses:true});
    render(<EditListingPage/>);
    fireEvent.click(await completeLicence());
    expect((await screen.findByRole('alert')).textContent).toContain('Save your legal name and country before publishing a licensed listing.');
    expect(toast).not.toHaveBeenCalledWith(expect.anything(),'error');
  });

  it('shows Unpublish and not Publish for published listings, then switches local status to unlisted', async () => {
    listingsApi.getListing.mockResolvedValue(baseListing);

    render(<EditListingPage />);

    const unpublishButton = await screen.findByRole('button', { name: /^Unpublish$/ });
    expect(screen.queryByRole('button', { name: /^Publish$/ })).toBeNull();

    fireEvent.click(unpublishButton);

    await waitFor(() => {
      expect(listingsApi.unpublishListing).toHaveBeenCalledWith('listing-1');
    });
    expect(toast).toHaveBeenCalledWith('Listing unpublished', 'success');
    expect(await screen.findByRole('button', { name: /^Publish$/ })).toBeTruthy();
    expect(screen.getByText('unlisted')).toBeTruthy();
  });

  it('falls back to row_count and saves it with the compliance fields', async () => {
    listingsApi.getListing.mockResolvedValue(baseListing);

    render(<EditListingPage />);

    expect(await screen.findByDisplayValue('Reviewed by legal.')).toBeTruthy();
    expect(screen.getByDisplayValue('100')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));

    await waitFor(() => {
      expect(listingsApi.updateListing).toHaveBeenCalledWith('listing-1', {
        title: 'Example listing',
        description: 'Useful dataset',
        category: 'Technology',
        tags: ['finance'],
        price: 25,
        pricing_type: 'one_time',
        data_format: 'csv',
        source_row_count: 100,
        compliance_frameworks: ['GDPR'],
        compliance_notes: 'Reviewed by legal.',
      });
    });
  });

  it.each(['', null, undefined])('omits an empty stored format on a title-only save (%s)', async (data_format) => {
    listingsApi.getListing.mockResolvedValue({ ...baseListing, data_format });
    render(<EditListingPage />);
    const title = await screen.findByDisplayValue(baseListing.title);
    fireEvent.change(title, { target: { value: 'Updated title only' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    await waitFor(() => expect(listingsApi.updateListing).toHaveBeenCalledWith('listing-1', expect.objectContaining({
      title: 'Updated title only',
    })));
    expect(listingsApi.updateListing.mock.calls[0][1]).not.toHaveProperty('data_format');
    const format = screen.getAllByRole('combobox').find(select => within(select).queryByRole('option', { name: 'CSV' })) as HTMLSelectElement;
    expect(format.value).toBe('');
    expect(within(format).getByRole('option', { name: 'No common table format' })).toBeTruthy();
  });

  it('preserves a stored CSV format on a title-only save', async () => {
    listingsApi.getListing.mockResolvedValue(baseListing);
    render(<EditListingPage />);
    const title = await screen.findByDisplayValue(baseListing.title);
    fireEvent.change(title, { target: { value: 'Updated title only' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    await waitFor(() => expect(listingsApi.updateListing).toHaveBeenCalledWith('listing-1', expect.objectContaining({
      title: 'Updated title only', data_format: 'csv',
    })));
  });

  it('does not offer an empty option for a stored CSV format', async () => {
    listingsApi.getListing.mockResolvedValue(baseListing);
    render(<EditListingPage />);
    await screen.findByDisplayValue(baseListing.title);
    const format = screen.getAllByRole('combobox').find(select => within(select).queryByRole('option', { name: 'CSV' })) as HTMLSelectElement;
    expect(format.value).toBe('csv');
    expect(Array.from(format.options).map(option => option.value)).not.toContain('');
  });

  it('stops offering an empty option after saving a newly selected format', async () => {
    listingsApi.getListing.mockResolvedValue({ ...baseListing, data_format: null });
    render(<EditListingPage />);
    await screen.findByDisplayValue(baseListing.title);
    const format = screen.getAllByRole('combobox').find(select => within(select).queryByRole('option', { name: 'CSV' })) as HTMLSelectElement;
    fireEvent.change(format, { target: { value: 'parquet' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    await waitFor(() => expect(listingsApi.updateListing).toHaveBeenCalledWith('listing-1', expect.objectContaining({
      data_format: 'parquet',
    })));
    await waitFor(() => expect(Array.from(format.options).map(option => option.value)).not.toContain(''));
    expect(format.value).toBe('parquet');
  });

  it('prefers source_row_count when both row count fields are present', async () => {
    listingsApi.getListing.mockResolvedValue({
      ...baseListing,
      source_row_count: 75,
    });

    render(<EditListingPage />);

    expect(await screen.findByDisplayValue('75')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));

    await waitFor(() => {
      expect(listingsApi.updateListing).toHaveBeenCalledWith(
        'listing-1',
        expect.objectContaining({ source_row_count: 75 }),
      );
    });
  });

  it('preserves an explicit zero source_row_count over row_count', async () => {
    listingsApi.getListing.mockResolvedValue({
      ...baseListing,
      source_row_count: 0,
    });

    render(<EditListingPage />);

    expect(await screen.findByDisplayValue('0')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));

    await waitFor(() => {
      expect(listingsApi.updateListing).toHaveBeenCalledWith(
        'listing-1',
        expect.objectContaining({ source_row_count: 0 }),
      );
    });
  });

  it('defaults an absent row count to zero and keeps it in the update payload', async () => {
    const { row_count: _rowCount, ...listingWithoutRowCount } = baseListing;
    listingsApi.getListing.mockResolvedValue(listingWithoutRowCount);

    render(<EditListingPage />);

    expect(await screen.findByDisplayValue('0')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));

    await waitFor(() => {
      expect(listingsApi.updateListing).toHaveBeenCalledWith(
        'listing-1',
        expect.objectContaining({ source_row_count: 0 }),
      );
    });
  });
});
