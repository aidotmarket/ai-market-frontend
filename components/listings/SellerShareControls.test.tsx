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

  it('saves German edits using the loaded share locale when the parent omits locale', async () => {
    const caption = {
      og_title: 'Deutscher Datensatz',
      og_description: 'Beschreibung',
      caption_text: 'Deutscher Text',
      status: 'seller_edited',
    };
    fetchListingShare.mockResolvedValueOnce(makeShare({ locale: 'de', caption }));
    updateListingShareCaption.mockResolvedValueOnce({ status: 'accepted', caption });

    render(<SellerShareControls listingId="listing-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    await screen.findByDisplayValue('Deutscher Text');
    expect(fetchListingShare).toHaveBeenCalledWith('listing-1', undefined);
    fireEvent.change(screen.getByLabelText('Caption'), { target: { value: 'Bearbeiteter Text' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save edit' }));

    await waitFor(() => expect(updateListingShareCaption).toHaveBeenCalledTimes(1));
    expect(JSON.parse(JSON.stringify(updateListingShareCaption.mock.calls[0][1]))).toEqual({
      mode: 'accept_edit',
      locale: 'de',
      og_title: caption.og_title,
      og_description: caption.og_description,
      caption_text: 'Bearbeiteter Text',
    });
  });

  it('regenerates in the loaded German locale and selects its draft even when it is not first', async () => {
    const caption = {
      og_title: 'Deutscher Datensatz',
      og_description: 'Beschreibung',
      caption_text: 'Deutscher Text',
      status: 'seller_edited',
    };
    fetchListingShare.mockResolvedValueOnce(makeShare({ locale: 'de', caption }));
    updateListingShareCaption.mockResolvedValueOnce({
      status: 'drafted',
      captions: [
        { ...caption, locale: 'en', caption_text: 'English draft' },
        { ...caption, locale: 'de', caption_text: 'Neuer deutscher Text' },
      ],
    });

    render(<SellerShareControls listingId="listing-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    await screen.findByDisplayValue('Deutscher Text');
    expect(fetchListingShare).toHaveBeenCalledWith('listing-1', undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));

    expect(await screen.findByDisplayValue('Neuer deutscher Text')).toBeTruthy();
    expect(JSON.parse(JSON.stringify(updateListingShareCaption.mock.calls[0][1]))).toEqual({
      mode: 'regenerate',
      locale: 'de',
    });
  });

  it.each([
    { name: 'explicit prop overrides loaded locale', locale: 'fr', loadedLocale: 'de', expectedLocale: 'fr' },
    { name: 'missing compatibility locale remains omitted', locale: undefined, loadedLocale: undefined, expectedLocale: undefined },
  ])('$name for both mutations and draft selection', async ({ locale, loadedLocale, expectedLocale }) => {
    const caption = {
      og_title: 'Loaded title',
      og_description: 'Loaded description',
      caption_text: 'Loaded caption',
      status: 'machine',
    };
    const selected = { ...caption, locale: expectedLocale, caption_text: 'Selected draft' };
    fetchListingShare.mockResolvedValueOnce(makeShare({ locale: loadedLocale, caption }));
    updateListingShareCaption
      .mockResolvedValueOnce({
        status: 'drafted',
        captions: [{ ...caption, locale: 'de', caption_text: 'First draft' }, selected],
      })
      .mockResolvedValueOnce({ status: 'accepted', caption: selected });

    render(<SellerShareControls listingId="listing-1" locale={locale} />);
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    await screen.findByDisplayValue('Loaded caption');
    expect(fetchListingShare).toHaveBeenCalledWith('listing-1', locale);
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));
    await screen.findByDisplayValue('Selected draft');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save edit' }).hasAttribute('disabled')).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Save edit' }));

    await waitFor(() => expect(updateListingShareCaption).toHaveBeenCalledTimes(2));
    const bodies = updateListingShareCaption.mock.calls.map(([, body]) => JSON.parse(JSON.stringify(body)));
    expect(bodies[0]).toEqual({ mode: 'regenerate', ...(expectedLocale === undefined ? {} : { locale: expectedLocale }) });
    expect(bodies[1]).toEqual({
      mode: 'accept_edit',
      ...(expectedLocale === undefined ? {} : { locale: expectedLocale }),
      og_title: selected.og_title,
      og_description: selected.og_description,
      caption_text: selected.caption_text,
    });
    if (expectedLocale === undefined) {
      for (const body of bodies) expect(body).not.toHaveProperty('locale');
    }
  });

  it.each(['unmatched', 'empty'])('preserves %s regenerated draft fallback behavior', async (kind) => {
    const share = makeShare({ locale: 'de' });
    const firstDraft = { ...share.caption!, locale: 'fr', caption_text: 'First available draft' };
    fetchListingShare.mockResolvedValueOnce(share);
    updateListingShareCaption.mockResolvedValueOnce({
      status: 'drafted',
      captions: kind === 'empty' ? [] : [firstDraft, { ...firstDraft, locale: 'en', caption_text: 'Other draft' }],
    });

    render(<SellerShareControls listingId="listing-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    await screen.findByDisplayValue(share.caption!.caption_text);
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));

    await waitFor(() => expect(updateListingShareCaption).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Regenerate' }).hasAttribute('disabled')).toBe(false));
    expect((screen.getByLabelText('Caption') as HTMLTextAreaElement).value).toBe(
      kind === 'empty' ? share.caption!.caption_text : firstDraft.caption_text,
    );
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
