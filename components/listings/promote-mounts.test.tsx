// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EditListingPage from '@/app/dashboard/listings/[id]/edit/page';
import ListingsPage from '@/app/dashboard/listings/page';
import SellerPublication from '@/components/seller-workspace/SellerPublication';
import type { ApprovalReceipt } from '@/api/sellerListingReview';
import type { ListingShareResponse } from '@/api/share';
import { promoteShare } from '@/tests/fixtures/promote';

const mocks = vi.hoisted(() => ({
  fetchListingShare: vi.fn(), getListing: vi.fn(), getMyListings: vi.fn(), readPublication: vi.fn(), publishListing: vi.fn(),
  getPendingSellerTermsListings: vi.fn(), getConnectStatus: vi.fn(), getSellerWorkspaceCapabilities: vi.fn(),
  push: vi.fn(), toast: vi.fn(),
}));
const auth = vi.hoisted(() => ({ user: { id: 'seller' }, token: 'session', hydrated: true, isAuthenticated: true, isLoading: false }));
vi.mock('@/store/auth', () => ({ useAuthStore: Object.assign((selector?: (state: typeof auth) => unknown) => selector ? selector(auth) : auth, { getState: () => auth }), authSessionIdentity: () => 'session' }));
const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, useParams: () => ({ id: 'listing-1' }) }));
vi.mock('@/api/share', () => ({ fetchListingShare: mocks.fetchListingShare, updateListingShareCaption: vi.fn() }));
vi.mock('@/api/listings', () => ({ ...mocks, updateListing: vi.fn(), unpublishListing: vi.fn(), deleteListing: vi.fn() }));
vi.mock('@/api/sellerListingPublication', () => mocks);
vi.mock('@/api/sellerWorkspace', () => mocks);
vi.mock('@/api/connect', () => mocks);
vi.mock('@/components/Toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/components/legal/TermsGate', () => ({ useTermsGate: () => ({ TermsGatePrompt: () => null, checkingTerms: false, ensureTermsAccepted: (action: () => void) => action() }) }));
vi.mock('@/components/listings/SellerAtAGlance', () => ({ default: () => null }));
vi.mock('@/components/seller-workspace/GuidedListingFlow', () => ({ useListingFlow: () => null }));
vi.mock('@/components/gateways/ListingGatewaySource', () => ({ default: () => null }));

const approval = { id: 'approval', review_hash: 'review', render_hash: 'render' } as ApprovalReceipt;
const publication = { listing_id: 'listing-1', title: 'Dataset', slug: 'dataset', status: 'published', is_listed: true };
const flush = async () => { await act(async () => {}); };
const advance = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
function pending() { let resolve!: (value: ListingShareResponse) => void; const promise = new Promise<ListingShareResponse>(r => { resolve = r; }); return { promise, resolve }; }

beforeEach(() => {
  vi.useFakeTimers(); vi.resetAllMocks();
  mocks.fetchListingShare.mockResolvedValue(promoteShare());
  mocks.getSellerWorkspaceCapabilities.mockResolvedValue({});
  mocks.getPendingSellerTermsListings.mockResolvedValue({ data: { count: 0, listings: [] } });
  mocks.getConnectStatus.mockResolvedValue({ data: { payouts_enabled: true } });
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) }, share: vi.fn().mockResolvedValue(undefined) });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

for (const mount of ['edit', 'dashboard', 'publication'] as const) {
  describe(`real promote controls on ${mount} mount`, () => {
    async function renderMount(status = 'published') {
      const listing = { id: 'listing-1', title: 'Dataset', status, description: 'Description', category: 'Research', tags: [], pricing: { price: 10 }, created_at: '2026-10-01' };
      mocks.getListing.mockResolvedValue(listing);
      mocks.getMyListings.mockResolvedValue({ data: [listing] });
      mocks.readPublication.mockResolvedValue({ publication_available: true, publication: status === 'draft' ? null : { ...publication, status } });
      render(mount === 'edit' ? <EditListingPage /> : mount === 'dashboard' ? <ListingsPage /> : <SellerPublication approval={approval} active rendered />);
      await flush();
      if (mount === 'dashboard' && status !== 'draft' && screen.queryByRole('button', { name: 'Share' })) {
        fireEvent.click(screen.getByRole('button', { name: 'Share' })); await flush();
      }
    }
    it('never mounts controls or calls owner share for a draft', async () => {
      await renderMount('draft');
      expect(mocks.fetchListingShare).not.toHaveBeenCalled();
      expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull();
    });
    it('shows unpublished read-only counts', async () => {
      mocks.fetchListingShare.mockResolvedValue(promoteShare(false));
      await renderMount('unlisted');
      expect(mocks.fetchListingShare).toHaveBeenCalledWith('listing-1', { locale: undefined, uiLocale: 'en' });
      expect(screen.getByText('Attribution rules')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'X' })).toBeNull();
    });
    it('shows a published panel and uses server text for device share and safe untagged Copy link', async () => {
      await renderMount();
      fireEvent.click(screen.getByRole('button', { name: 'Native share' })); await flush();
      expect(navigator.share).toHaveBeenCalledWith({ title: 'Safe server title', text: 'Safe server text', url: 'https://ai.market/l/Code' });
      fireEvent.click(screen.getByRole('button', { name: 'Copy link' })); await flush();
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://ai.market/l/Code');
    });
    if (mount !== 'dashboard') it('shows the expanded panel immediately after publishing', async () => {
      await renderMount(mount === 'edit' ? 'unlisted' : 'draft');
      mocks.publishListing.mockResolvedValue(publication);
      fireEvent.click(screen.getByRole('button', { name: mount === 'edit' ? 'Publish' : 'Publish this listing' })); await flush();
      expect(screen.getByRole('button', { name: 'Copy link' })).toBeTruthy();
    });
    it('removes the open panel when the next fetch disables promote', async () => {
      await renderMount(); mocks.fetchListingShare.mockResolvedValue({ ...promoteShare(), promote: null });
      await advance(30000);
      expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull();
      expect(screen.queryByText('Attribution rules')).toBeNull();
    });
    it.each([-60000, 60000])('expires after failed refreshes with wall clock offset %s', async offset => {
      vi.setSystemTime(Date.now() + offset);
      await renderMount(); mocks.fetchListingShare.mockRejectedValue(new Error('offline'));
      await advance(44999); expect(screen.getByRole('button', { name: 'Copy link' })).toBeTruthy();
      await advance(1); expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull();
    });
    it('expires by second 60 with the last enabled request at second 14 of backend cache', async () => {
      await advance(14000); await renderMount(); mocks.fetchListingShare.mockRejectedValue(new Error('offline'));
      await advance(46000); expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull();
    });
    it('anchors a delayed response to request start', async () => {
      await renderMount(); const delayed = pending();
      mocks.fetchListingShare.mockReturnValueOnce(delayed.promise);
      fireEvent.focus(window); await advance(20000);
      delayed.resolve(promoteShare()); await flush();
      mocks.fetchListingShare.mockRejectedValue(new Error('offline'));
      await advance(24999); expect(screen.getByRole('button', { name: 'Copy link' })).toBeTruthy();
      await advance(1); expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull();
    });
    it('discards a response overtaken by a newer request', async () => {
      await renderMount(); const older = pending();
      mocks.fetchListingShare.mockReturnValueOnce(older.promise); fireEvent.focus(window); await flush();
      mocks.fetchListingShare.mockResolvedValueOnce({ ...promoteShare(), promote: null }); fireEvent.focus(window); await flush();
      older.resolve(promoteShare()); await flush();
      expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull();
    });
  });
}
