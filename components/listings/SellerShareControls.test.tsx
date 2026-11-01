/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ListingShareResponse } from '@/api/share';
import SellerShareControls from './SellerShareControls';
import ShareKitModal from './ShareKitModal';

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
    promote: {
      enabled: true, can_share: true, ttl_seconds: 45,
      links: Object.fromEntries(['x', 'li', 'rd', 'bs', 'wa', 'tg', 'em'].map(net => [net, { share_url: `https://ai.market/l/AbC123xYz987/${net}`, compose_url: `https://compose.example/${net}`, prefilled: net !== 'li' }])) as NonNullable<ListingShareResponse['promote']>['links'],
      copy_text: 'Server safe text', share_title: 'Server safe title',
      counts: [{ network: 'x', opens: { all: 10, d30: 3 }, inquiries: { all: { value: 2, masked: false }, d30: { value: null, masked: true } } }],
      rules: 'Attribution rules',
    },
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

    render(<SellerShareControls compact listingId="listing-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Share' }));

    expect(await screen.findByRole('button', { name: 'Copy link' })).toBeTruthy();
    expect(screen.getByAltText('Share card preview').getAttribute('src')).toBe(share.card_url);
    expect(screen.getByDisplayValue('Shared Dataset')).toBeTruthy();
    expect(screen.getByDisplayValue('A dataset ready for marketplace sharing.')).toBeTruthy();
    expect(screen.getByDisplayValue('Use this dataset to benchmark marketplace demand.')).toBeTruthy();
  });

  it('renders a freshly minted owner fallback short code from the share fetch', async () => {
    fetchListingShare.mockResolvedValueOnce(makeShare({ short_code: 'FreshMint123' }));

    render(<SellerShareControls compact listingId="legacy-listing" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Share' }));

    expect(await screen.findByText('Code: FreshMint123')).toBeTruthy();
    expect(fetchListingShare).toHaveBeenCalledWith('legacy-listing', { locale: undefined, uiLocale: 'en' });
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

    render(<SellerShareControls compact listingId="listing-1" locale="en_US" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Share' }));
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

    render(<SellerShareControls compact listingId="listing-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Share' }));
    await screen.findByDisplayValue('Deutscher Text');
    expect(fetchListingShare).toHaveBeenCalledWith('listing-1', { locale: undefined, uiLocale: 'en' });
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

    render(<SellerShareControls compact listingId="listing-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Share' }));
    await screen.findByDisplayValue('Deutscher Text');
    expect(fetchListingShare).toHaveBeenCalledWith('listing-1', { locale: undefined, uiLocale: 'en' });
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

    render(<SellerShareControls compact listingId="listing-1" locale={locale} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Share' }));
    await screen.findByDisplayValue('Loaded caption');
    expect(fetchListingShare).toHaveBeenCalledWith('listing-1', { locale, uiLocale: 'en' });
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

    render(<SellerShareControls compact listingId="listing-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Share' }));
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

    render(<SellerShareControls compact listingId="listing-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Share' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Native share' }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(share.share_url);
    });
  });


});

describe('ShareKitModal', () => {
  it('uses all seven server compose URLs and copies only server text when needed', async () => {
    const share = makeShare();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<ShareKitModal share={share} onClose={vi.fn()} />);
    expect(screen.getByText('Server safe text')).toBeTruthy();
    for (const [network, label] of Object.entries({ x: 'X', li: 'LinkedIn', rd: 'Reddit', bs: 'Bluesky', wa: 'WhatsApp', tg: 'Telegram', em: 'Email' })) {
      fireEvent.click(screen.getByRole('button', { name: label }));
      expect(open).toHaveBeenLastCalledWith(share.promote!.links[network as 'x'].compose_url, '_blank', 'noopener,noreferrer');
    }
    expect(await screen.findByText('Text copied, paste it into your post')).toBeTruthy();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Server safe text');
    open.mockRestore();
  });
});

const flush = async () => { await act(async () => {}); };
const advance = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }

describe('Promote expiry and outbound safety', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchListingShare.mockReset().mockResolvedValue(makeShare());
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) }, share: vi.fn().mockResolvedValue(undefined) });
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
  async function mount() {
    render(<SellerShareControls listingId="listing-1" />);
    await flush();
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeTruthy();
  }
  it('removes an open panel immediately on promote null refresh', async () => {
    await mount();
    fetchListingShare.mockResolvedValue(makeShare({ promote: null }));
    await advance(30000);
    expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
  });
  it.each([-60000, 60000])('expires at request-start deadline despite failed refreshes and wall offset %s', async offset => {
    vi.setSystemTime(Date.now() + offset);
    await mount();
    fetchListingShare.mockRejectedValue(new Error('offline'));
    await advance(44999);
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeTruthy();
    await advance(1);
    expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull();
  });
  it('removes adverse cache alignment by second 60 (last enabled request at second 14)', async () => {
    // Flag flips at t=0; cached enabled data is still returned at t=14.
    await advance(14000);
    await mount();
    fetchListingShare.mockRejectedValue(new Error('offline'));
    await advance(45000);
    expect(performance.now()).toBeGreaterThanOrEqual(59000);
    expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull();
    await advance(1000);
    expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull();
  });
  it('anchors a response delayed 20 seconds to its request start', async () => {
    const pending = deferred<ListingShareResponse>();
    fetchListingShare.mockReturnValueOnce(pending.promise);
    render(<SellerShareControls listingId="listing-1" />);
    await advance(20000);
    pending.resolve(makeShare()); await flush();
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeTruthy();
    fetchListingShare.mockRejectedValue(new Error('offline'));
    await advance(25000);
    expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull();
  });
  it('discards a late enabled response overtaken by a newer focus request', async () => {
    await mount();
    const older = deferred<ListingShareResponse>();
    fetchListingShare.mockReturnValueOnce(older.promise);
    fireEvent.focus(window); await flush();
    fetchListingShare.mockResolvedValueOnce(makeShare({ promote: null }));
    fireEvent.focus(window); await flush();
    older.resolve(makeShare()); await flush();
    expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull();
  });
  it('discards older responses even while the newer request is still in flight', async () => {
    const older = deferred<ListingShareResponse>(); const newer = deferred<ListingShareResponse>();
    fetchListingShare.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    render(<SellerShareControls listingId="listing-1" />);
    fireEvent.focus(window);
    older.resolve(makeShare()); await flush();
    expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull();
    newer.resolve(makeShare({ promote: null })); await flush();
    expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull();
  });
  it('uses server title and copy_text for device share, and the untagged URL for Copy link', async () => {
    await mount();
    fireEvent.change(screen.getByLabelText('OG title'), { target: { value: 'Unsafe draft title' } });
    fireEvent.change(screen.getByLabelText('Caption'), { target: { value: 'Unsafe draft text' } });
    fireEvent.click(screen.getByRole('button', { name: 'Native share' })); await flush();
    expect(navigator.share).toHaveBeenCalledWith({ title: 'Server safe title', text: 'Server safe text', url: makeShare().share_url });
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' })); await flush();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(makeShare().share_url);
  });
  it('renders read-only counts for unpublished can_share false', async () => {
    const share = makeShare(); share.promote!.can_share = false;
    fetchListingShare.mockResolvedValue(share);
    render(<SellerShareControls listingId="listing-1" />); await flush();
    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getByText('Hidden')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull();
    expect(screen.queryByLabelText('Caption')).toBeNull();
  });
  it.each([['es-ES', 'es', 'Copiar enlace'], ['zh-CN', 'zh-Hans', '复制链接']])('uses assistant locale detection for %s', async (language, uiLocale, label) => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue(language);
    render(<SellerShareControls listingId="listing-1" />); await flush();
    expect(fetchListingShare).toHaveBeenCalledWith('listing-1', { locale: undefined, uiLocale });
    expect(screen.getByRole('button', { name: label })).toBeTruthy();
  });
});
