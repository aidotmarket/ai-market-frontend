'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  fetchListingShare,
  updateListingShareCaption,
  type ListingShareCaption,
  type ListingShareResponse,
} from '@/api/share';
import ShareKitModal from './ShareKitModal';

interface SellerShareControlsProps {
  listingId: string;
  locale?: string;
  compact?: boolean;
}

interface CaptionForm {
  og_title: string;
  og_description: string;
  caption_text: string;
}

function toCaptionForm(caption: ListingShareCaption | null): CaptionForm {
  return {
    og_title: caption?.og_title || '',
    og_description: caption?.og_description || '',
    caption_text: caption?.caption_text || '',
  };
}

function selectDraftCaption(
  captions: ListingShareCaption[],
  locale?: string,
): ListingShareCaption | null {
  if (captions.length === 0) return null;
  return captions.find((caption) => caption.locale === locale) || captions[0];
}

export default function SellerShareControls({
  listingId,
  locale,
  compact = false,
}: SellerShareControlsProps) {
  const [open, setOpen] = useState(false);
  const [share, setShare] = useState<ListingShareResponse | null>(null);
  const [form, setForm] = useState<CaptionForm>(toCaptionForm(null));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [fallbackUsed, setFallbackUsed] = useState<boolean | null>(null);
  const [kitOpen, setKitOpen] = useState(false);

  useEffect(() => {
    if (!open || share) return;

    let active = true;
    setLoading(true);
    setError('');
    fetchListingShare(listingId, locale)
      .then((data) => {
        if (!active) return;
        setShare(data);
        setForm(toCaptionForm(data.caption));
      })
      .catch(() => {
        if (!active) return;
        setError('Share controls are unavailable right now.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [listingId, locale, open, share]);

  const captionStatus = share?.caption?.status;
  const isFlagged = captionStatus === 'flagged';
  const shareTitle = form.og_title || share?.caption?.og_title || 'ai.market listing';
  const shareText = form.caption_text || form.og_description || share?.caption?.caption_text || '';

  const statusMessage = useMemo(() => {
    if (fallbackUsed) return 'Fallback caption used. Review before posting.';
    if (isFlagged) return 'Caption flagged for review. Public metadata will use the safe fallback.';
    if (captionStatus) return `Caption status: ${captionStatus}`;
    return '';
  }, [captionStatus, fallbackUsed, isFlagged]);

  async function copyLink() {
    if (!share?.share_url) return;
    try {
      await navigator.clipboard.writeText(share.share_url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Could not copy the share link.');
    }
  }

  async function nativeShare() {
    if (!share) return;
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({
          url: share.share_url,
          title: shareTitle,
          text: shareText,
        });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }
    await copyLink();
  }

  async function regenerateCaption() {
    setSaving(true);
    setError('');
    try {
      const result = await updateListingShareCaption(listingId, {
        mode: 'regenerate',
        locale,
      });
      if ('captions' in result) {
        const caption = selectDraftCaption(result.captions, locale);
        setFallbackUsed(!!result.fallback_used);
        if (caption) {
          setShare((prev) => prev ? { ...prev, caption } : prev);
          setForm(toCaptionForm(caption));
        }
      }
    } catch {
      setError('Could not regenerate the caption.');
    } finally {
      setSaving(false);
    }
  }

  async function saveCaption() {
    setSaving(true);
    setError('');
    try {
      const result = await updateListingShareCaption(listingId, {
        mode: 'accept_edit',
        locale,
        ...form,
      });
      if ('caption' in result) {
        setShare((prev) => prev ? { ...prev, caption: result.caption } : prev);
        setForm(toCaptionForm(result.caption));
        setFallbackUsed(null);
      }
    } catch {
      setError('Could not save the caption.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={compact ? 'text-left' : 'rounded-lg border border-gray-200 bg-white p-4'}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="rounded-md border border-[#3F51B5] px-3 py-1.5 text-xs font-medium text-[#3F51B5] hover:bg-[#E8EAF6]"
      >
        {open ? 'Hide share' : 'Share'}
      </button>

      {open && (
        <div className="mt-3 space-y-4">
          {loading && (
            <p className="text-sm text-gray-500" role="status">
              Loading share controls...
            </p>
          )}

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
              {error}
            </div>
          )}

          {share && (
            <>
              <div className="grid gap-4 md:grid-cols-[240px_1fr]">
                <div>
                  <img
                    src={share.card_url}
                    alt="Share card preview"
                    className="aspect-[1.91/1] w-full rounded-md border border-gray-200 object-cover"
                  />
                  <p className="mt-2 break-all text-xs text-gray-500">{share.share_url}</p>
                  <p className="mt-1 text-xs text-gray-500">Code: {share.short_code}</p>
                </div>

                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={copyLink}
                      className="rounded-md bg-[#3F51B5] px-3 py-2 text-xs font-medium text-white hover:bg-[#303F9F]"
                    >
                      {copied ? 'Copied' : 'Copy link'}
                    </button>
                    <button
                      type="button"
                      onClick={nativeShare}
                      className="rounded-md border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Native share
                    </button>
                    <button
                      type="button"
                      onClick={() => setKitOpen(true)}
                      className="rounded-md border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Share kit
                    </button>
                  </div>

                  {statusMessage && (
                    <p className={`text-xs ${isFlagged || fallbackUsed ? 'text-amber-700' : 'text-gray-500'}`}>
                      {statusMessage}
                    </p>
                  )}

                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-gray-700">
                      OG title
                      <input
                        type="text"
                        value={form.og_title}
                        onChange={(event) => setForm((prev) => ({ ...prev, og_title: event.target.value }))}
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3F51B5]"
                      />
                    </label>
                    <label className="block text-xs font-medium text-gray-700">
                      OG description
                      <textarea
                        rows={2}
                        value={form.og_description}
                        onChange={(event) => setForm((prev) => ({ ...prev, og_description: event.target.value }))}
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3F51B5]"
                      />
                    </label>
                    <label className="block text-xs font-medium text-gray-700">
                      Caption
                      <textarea
                        rows={3}
                        value={form.caption_text}
                        onChange={(event) => setForm((prev) => ({ ...prev, caption_text: event.target.value }))}
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3F51B5]"
                      />
                    </label>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={regenerateCaption}
                      disabled={saving}
                      className="rounded-md border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Regenerate
                    </button>
                    <button
                      type="button"
                      onClick={saveCaption}
                      disabled={saving}
                      className="rounded-md bg-gray-900 px-3 py-2 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                    >
                      Save edit
                    </button>
                  </div>
                </div>
              </div>

              {kitOpen && <ShareKitModal share={share} onClose={() => setKitOpen(false)} />}
            </>
          )}
        </div>
      )}
    </div>
  );
}
