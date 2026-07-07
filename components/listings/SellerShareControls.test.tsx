/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ListingShareResponse } from '@/api/share';
import SellerShareControls from './SellerShareControls';
import ShareKitModal, { buildShareKitDrafts } from './ShareKitModal';

const { fetchListingShare, updateListingShareCaption } = vi.hoisted(() => ({
  fetchListingShare: vi.fn(),
  updateListingShareCaption: vi.fn(),
}));

vi.mock('@/api/share', () => ({
  fetchListingShare,
  updateListingShareCaption,
}));

function makeShare(overrides: Partial<ListingShareResponse> = {}): ListingShareResponse {
  return {
    listing_id: 'listing-1',
    short_code: 'AbC123xYz987',
    share_url: 'https://ai.market/l/AbC123xYz987',
    card_url: 'https://ai.market/l/AbC123xYz987/card.png?v=hash-1',
    locale: 'en_US',
    caption: {
      locale: 'en_US',
      og_title: 'Shared Dataset',
      og_description: 'A dataset ready for marketplace sharing.',
      caption_text: 'Use this dataset to benchmark marketplace demand.',
      status: 'machine',
      confidence: 0.91,
    },
    ...overrides,
  };
}

describe('SellerShareControls', () => {
  beforeEach(() => {
    fetchListingShare.mockReset();
    updateListingShareCaption.mockReset();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      share: undefined,
    });
  });

  it('loads and renders copy link, card preview, and current caption fields', async () => {
    const share = makeShare();
    fetchListingShare.mockResolvedValueOnce(share);

    render(<SellerShareControls listingId="listing-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));

    expect(await screen.findByRole('button', { name: 'Copy link' })).toBeTruthy();
    expect(screen.getByAltText('Share card preview').getAttribute('src')).toBe(share.card_url);
    expect(screen.getByDisplayValue('Shared Dataset')).toBeTruthy();
    expect(screen.getByDisplayValue('A dataset ready for marketplace sharing.')).toBeTruthy();
    expect(screen.getByDisplayValue('Use this dataset to benchmark marketplace demand.')).toBeTruthy();
  });

  it('renders a freshly minted owner fallback short code from the share fetch', async () => {
    fetchListingShare.mockResolvedValueOnce(makeShare({ short_code: 'FreshMint123' }));

    render(<SellerShareControls listingId="legacy-listing" />);
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));

    expect(await screen.findByText('Code: FreshMint123')).toBeTruthy();
    expect(fetchListingShare).toHaveBeenCalledWith('legacy-listing', undefined);
  });

  it('regenerates and accepts caption edits with the expected request bodies', async () => {
    fetchListingShare.mockResolvedValueOnce(makeShare());
    updateListingShareCaption
      .mockResolvedValueOnce({
        status: 'drafted',
        fallback_used: true,
        captions: [
          {
            locale: 'en_US',
            og_title: 'Regenerated title',
            og_description: 'Regenerated description',
            caption_text: 'Regenerated caption',
            status: 'flagged',
            confidence: 0.42,
          },
        ],
      })
      .mockResolvedValueOnce({
        status: 'accepted',
        caption: {
          locale: 'en_US',
          og_title: 'Seller title',
          og_description: 'Seller description',
          caption_text: 'Seller caption',
          status: 'seller_edited',
          confidence: 1,
        },
      });

    render(<SellerShareControls listingId="listing-1" locale="en_US" />);
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    await screen.findByRole('button', { name: 'Regenerate' });

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));

    await waitFor(() => {
      expect(updateListingShareCaption).toHaveBeenCalledWith('listing-1', {
        mode: 'regenerate',
        locale: 'en_US',
      });
    });
    expect(await screen.findByText('Fallback caption used. Review before posting.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('OG title'), { target: { value: 'Seller title' } });
    fireEvent.change(screen.getByLabelText('OG description'), { target: { value: 'Seller description' } });
    fireEvent.change(screen.getByLabelText('Caption'), { target: { value: 'Seller caption' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save edit' }));

    await waitFor(() => {
      expect(updateListingShareCaption).toHaveBeenLastCalledWith('listing-1', {
        mode: 'accept_edit',
        locale: 'en_US',
        og_title: 'Seller title',
        og_description: 'Seller description',
        caption_text: 'Seller caption',
      });
    });
  });

  it('copies the share URL when native share is unavailable', async () => {
    const share = makeShare();
    fetchListingShare.mockResolvedValueOnce(share);

    render(<SellerShareControls listingId="listing-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Native share' }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(share.share_url);
    });
  });

  it('renders an error state without throwing when share fetch fails', async () => {
    fetchListingShare.mockRejectedValueOnce(new Error('unavailable'));

    render(<SellerShareControls listingId="listing-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Share controls are unavailable right now.');
    expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull();
  });
});

describe('ShareKitModal', () => {
  it('renders platform drafts and encoded intent URLs', () => {
    const share = makeShare({
      share_url: 'https://ai.market/l/Code With Space',
      caption: {
        locale: 'en_US',
        og_title: 'Revenue & Risk Dataset',
        og_description: 'Dataset for finance teams.',
        caption_text: 'Revenue & risk data for teams #AI',
        status: 'seller_edited',
      },
    });

    render(<ShareKitModal share={share} onClose={vi.fn()} />);

    expect(screen.getByText('X/Twitter')).toBeTruthy();
    expect(screen.getByText('LinkedIn')).toBeTruthy();
    expect(screen.getByText('Email')).toBeTruthy();
    expect(screen.getAllByText('Revenue & risk data for teams #AI')).toHaveLength(2);

    const links = screen.getAllByRole('link', { name: 'Open' });
    const byPlatform = new Map(
      links.map((link) => [
        within(link.closest('div') as HTMLElement).getByRole('heading').textContent,
        link.getAttribute('href'),
      ]),
    );

    expect(byPlatform.get('X/Twitter')).toBe(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent('Revenue & risk data for teams #AI')}&url=${encodeURIComponent(share.share_url)}`,
    );
    expect(byPlatform.get('LinkedIn')).toBe(
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(share.share_url)}`,
    );
    expect(byPlatform.get('Email')).toBe(
      `mailto:?subject=${encodeURIComponent('Revenue & Risk Dataset')}&body=${encodeURIComponent(`Revenue & risk data for teams #AI\n\n${share.share_url}`)}`,
    );
  });

  it('builds three ready-to-post drafts', () => {
    expect(buildShareKitDrafts(makeShare())).toHaveLength(3);
  });
});
