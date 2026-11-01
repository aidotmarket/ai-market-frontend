'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  fetchListingShare,
  updateListingShareCaption,
  type ListingShareCaption,
  type ListingShareResponse,
} from '@/api/share';
import ShareKitModal, { PromoteNetworkButtons } from './ShareKitModal';
import { preferredAnonymousAllAILocale } from '@/lib/i18n/anonymous-allai';
import { PROMOTE_STRINGS, PROMOTE_NETWORKS } from '@/lib/i18n/promote';

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
  const [open, setOpen] = useState(!compact);
  const [share, setShare] = useState<ListingShareResponse | null>(null);
  const [form, setForm] = useState<CaptionForm>(toCaptionForm(null));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [fallbackUsed, setFallbackUsed] = useState<boolean | null>(null);
  const [kitOpen, setKitOpen] = useState(false);

  const [uiLocale, setUiLocale] = useState<ReturnType<typeof preferredAnonymousAllAILocale>>('en');
  const t = PROMOTE_STRINGS[uiLocale];

  useEffect(() => {
    const detected = preferredAnonymousAllAILocale(navigator.language);
    setUiLocale(detected);
    let active = true;
    let newestRequest = 0;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    let deadline = 0;
    let captionInitialized = false;
    setShare(null);
    async function refresh() {
      const sequence = ++newestRequest;
      const started = performance.now();
      setLoading(true);
      try {
        const data = await fetchListingShare(listingId, { locale, uiLocale: detected });
        if (!active || sequence !== newestRequest) return;
        clearTimeout(expiry);
        deadline = started + (data.promote?.ttl_seconds ?? 0) * 1000;
        if (!data.promote || performance.now() >= deadline) {
          setShare(null);
          setKitOpen(false);
          return;
        }
        setShare(data);
        if (!captionInitialized) {
          setForm(toCaptionForm(data.caption));
          captionInitialized = true;
        }
        setError('');
        expiry = setTimeout(() => { setShare(null); setKitOpen(false); }, deadline - performance.now());
      } catch {
        if (active && sequence === newestRequest) setError(PROMOTE_STRINGS[detected].unavailable);
      } finally {
        if (active && sequence === newestRequest) setLoading(false);
      }
    }
    const onFocus = () => {
      if (performance.now() >= deadline) { setShare(null); setKitOpen(false); }
      void refresh();
    };
    void refresh();
    const interval = setInterval(() => { void refresh(); }, 30000);
    window.addEventListener('focus', onFocus);
    return () => {
      active = false;
      clearTimeout(expiry);
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [listingId, locale]);

  const effectiveLocale = locale ?? share?.locale;
  const captionStatus = share?.caption?.status;
  const isFlagged = captionStatus === 'flagged';
  const promote = share?.promote;
  const shareTitle = promote?.share_title;
  const shareText = promote?.copy_text;
  const shareUrl = share ? `${new URL(share.share_url).origin}/l/${share.short_code}` : '';

  const statusMessage = useMemo(() => {
    if (fallbackUsed) return t.fallback;
    if (isFlagged) return t.flagged;
    if (captionStatus) return `${t.status}: ${captionStatus}`;
    return '';
  }, [captionStatus, fallbackUsed, isFlagged, t]);

  async function copyLink() {
    if (!promote?.can_share) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError(t.copyError);
    }
  }

  async function nativeShare() {
    if (!promote?.can_share) return;
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({
          url: shareUrl,
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
        locale: effectiveLocale,
      });
      if ('captions' in result) {
        const caption = selectDraftCaption(result.captions, effectiveLocale);
        setFallbackUsed(!!result.fallback_used);
        if (caption) {
          setShare((prev) => prev ? { ...prev, caption } : prev);
          setForm(toCaptionForm(caption));
        }
      }
    } catch {
      setError(t.regenerateError);
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
        locale: effectiveLocale,
        ...form,
      });
      if ('caption' in result) {
        setShare((prev) => prev ? { ...prev, caption: result.caption } : prev);
        setForm(toCaptionForm(result.caption));
        setFallbackUsed(null);
      }
    } catch {
      setError(t.saveError);
    } finally {
      setSaving(false);
    }
  }

  if (!promote) return null;

  return (
    <div aria-label={t.share} className={compact ? 'text-left' : 'rounded-lg border border-gray-200 bg-white p-4'}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="rounded-md border border-[#3F51B5] px-3 py-1.5 text-xs font-medium text-[#3F51B5] hover:bg-[#E8EAF6]"
      >
        {open ? t.hide : t.share}
      </button>

      {open && (
        <div className="mt-3 space-y-4">
          {loading && (
            <p className="text-sm text-gray-500" role="status">
              {t.loading}
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
                    alt={t.preview}
                    className="aspect-[1.91/1] w-full rounded-md border border-gray-200 object-cover"
                  />
                  <p className="mt-2 break-all text-xs text-gray-500">{share.share_url}</p>
                  <p className="mt-1 text-xs text-gray-500">{t.code}: {share.short_code}</p>
                </div>

                <div className="space-y-3">
                  {promote.can_share && <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={copyLink}
                      className="rounded-md bg-[#3F51B5] px-3 py-2 text-xs font-medium text-white hover:bg-[#303F9F]"
                    >
                      {copied ? t.copied : t.copy}
                    </button>
                    <button
                      type="button"
                      onClick={nativeShare}
                      className="rounded-md border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      {t.native}
                    </button>
                    <button
                      type="button"
                      onClick={() => setKitOpen(true)}
                      className="rounded-md border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      {t.kit}
                    </button>
                  </div>}
                  {promote.can_share && <PromoteNetworkButtons promote={promote} uiLocale={uiLocale} />}

                  {statusMessage && (
                    <p className={`text-xs ${isFlagged || fallbackUsed ? 'text-amber-700' : 'text-gray-500'}`}>
                      {statusMessage}
                    </p>
                  )}

                  {promote.can_share && <div className="space-y-2">
                    <label className="block text-xs font-medium text-gray-700">
                      {t.title}
                      <input
                        type="text"
                        value={form.og_title}
                        onChange={(event) => setForm((prev) => ({ ...prev, og_title: event.target.value }))}
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3F51B5]"
                      />
                    </label>
                    <label className="block text-xs font-medium text-gray-700">
                      {t.description}
                      <textarea
                        rows={2}
                        value={form.og_description}
                        onChange={(event) => setForm((prev) => ({ ...prev, og_description: event.target.value }))}
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3F51B5]"
                      />
                    </label>
                    <label className="block text-xs font-medium text-gray-700">
                      {t.caption}
                      <textarea
                        rows={3}
                        value={form.caption_text}
                        onChange={(event) => setForm((prev) => ({ ...prev, caption_text: event.target.value }))}
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3F51B5]"
                      />
                    </label>
                  </div>}

                  {promote.can_share && <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={regenerateCaption}
                      disabled={saving}
                      className="rounded-md border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {t.regenerate}
                    </button>
                    <button
                      type="button"
                      onClick={saveCaption}
                      disabled={saving}
                      className="rounded-md bg-gray-900 px-3 py-2 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                    >
                      {t.save}
                    </button>
                  </div>}
                </div>
              </div>

              <table className="w-full text-left text-xs"><thead><tr>
                <th>{t.network}</th><th>{t.opens} · {t.all}</th><th>{t.opens} · {t.d30}</th><th>{t.inquiries} · {t.all}</th><th>{t.inquiries} · {t.d30}</th>
              </tr></thead><tbody>{promote.counts.map(row => <tr key={row.network}>
                <th>{row.network === 'other' ? t.other : PROMOTE_NETWORKS[row.network]}</th><td>{row.opens.all}</td><td>{row.opens.d30}</td>
                <td>{row.inquiries.all.masked ? t.masked : row.inquiries.all.value ?? '—'}</td><td>{row.inquiries.d30.masked ? t.masked : row.inquiries.d30.value ?? '—'}</td>
              </tr>)}</tbody></table>
              <p className="text-xs text-gray-500">{promote.rules}</p>
              {kitOpen && promote.can_share && <ShareKitModal share={share} uiLocale={uiLocale} onClose={() => setKitOpen(false)} />}
            </>
          )}
        </div>
      )}
    </div>
  );
}
