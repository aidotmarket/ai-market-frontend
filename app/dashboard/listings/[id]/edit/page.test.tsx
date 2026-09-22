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
    }));
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
