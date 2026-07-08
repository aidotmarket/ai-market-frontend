// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('loads compliance notes and saves compliance fields in the listing update payload', async () => {
    listingsApi.getListing.mockResolvedValue(baseListing);

    render(<EditListingPage />);

    expect(await screen.findByDisplayValue('Reviewed by legal.')).toBeTruthy();

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
});
