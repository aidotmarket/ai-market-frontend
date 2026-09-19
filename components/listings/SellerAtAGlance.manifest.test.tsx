// @vitest-environment jsdom
import {cleanup, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import * as api from '@/lib/api';
import type {Manifest} from '@/lib/listing-preview/types';
import {preview} from '@/tests/summaryFixture';
import SellerAtAGlance from './SellerAtAGlance';

vi.mock('@/lib/api', () => ({
  fetchSummaryPreview: vi.fn(), regenerateSummary: vi.fn(), approveSummary: vi.fn(), withdrawSummary: vi.fn(),
  fetchListingEnrichment: vi.fn(), saveListingEnrichment: vi.fn(), fetchPreviewManifest: vi.fn(),
  fetchPreviewKeys: vi.fn(), fetchPreviewConsistency: vi.fn(), fetchSignedSummaryPayload: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.fetchSummaryPreview).mockResolvedValue({...preview, state: 'approved'});
  vi.mocked(api.fetchListingEnrichment).mockResolvedValue({
    profile: 'aim-listing-enrichment-profile-v2', source_revision: preview.source_revision,
    summary_id: preview.summary_id, state: 'approved', values: {}, schema_info: null,
    aggregate_statistics: null, drafts: [],
  });
  vi.mocked(api.fetchPreviewManifest).mockRejectedValue(new Error('manifest offline'));
});
afterEach(cleanup);

it('does not claim no fields are selected when the approved manifest request rejects', async () => {
  render(<SellerAtAGlance listingId="listing" slug="sales" />);
  await screen.findByRole('button', {name: 'Withdraw'});
  expect(api.fetchPreviewManifest).toHaveBeenCalled();
  expect(screen.queryByText('No fields are selected for a sample.')).toBeNull();
  expect(screen.getByText('The current selection is not shown here. Field selection is set and signed in AIM Data.')).toBeTruthy();
});

it('shows the definitive empty-selection copy only after a manifest is received', async () => {
  vi.mocked(api.fetchPreviewManifest).mockResolvedValue({listing_id: 'listing', selected_fields: []} as unknown as Manifest);
  vi.mocked(api.fetchPreviewKeys).mockResolvedValue(null);
  render(<SellerAtAGlance listingId="listing" slug="sales" />);
  expect(await screen.findByText('No fields are selected for a sample.')).toBeTruthy();
  expect(screen.queryByText('The current selection is not shown here. Field selection is set and signed in AIM Data.')).toBeNull();
});
