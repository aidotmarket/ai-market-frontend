'use client';

import { useState } from 'react';
import type { ListingShareResponse, PromoteOut, PromoteNetwork } from '@/api/share';
import type { AnonymousAllAILocale } from '@/lib/i18n/anonymous-allai';
import { PROMOTE_STRINGS, PROMOTE_NETWORKS } from '@/lib/i18n/promote';

export function PromoteNetworkButtons({ promote, uiLocale = 'en' }: { promote: PromoteOut; uiLocale?: AnonymousAllAILocale }) {
  const [message, setMessage] = useState('');
  const [copyFailed, setCopyFailed] = useState(false);
  const t = PROMOTE_STRINGS[uiLocale];
  if (!promote.can_share) return null;
  function copyText() {
    setMessage('');
    setCopyFailed(false);
    // Start within the click gesture, before the composer takes focus.
    try {
      return navigator.clipboard.writeText(promote.copy_text).then(() => {
        setMessage(t.paste);
      }, () => { setCopyFailed(true); });
    } catch {
      setCopyFailed(true);
    }
  }
  function compose(network: PromoteNetwork) {
    const link = promote.links[network];
    if (!link.prefilled) void copyText();
    window.open(link.compose_url, '_blank', 'noopener,noreferrer');
  }
  return <><div className="flex flex-wrap gap-2">
    {(Object.keys(PROMOTE_NETWORKS) as PromoteNetwork[]).map(network => <button type="button" key={network}
      onClick={() => compose(network)} className="rounded-md bg-[#3F51B5] px-3 py-2 text-xs font-medium text-white hover:bg-[#303F9F]">
      {PROMOTE_NETWORKS[network]}
    </button>)}
  </div>{copyFailed && <button type="button" onClick={() => { void copyText(); }}
    className="rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50">{t.copyText}</button>}{message && <p role="status" className="text-sm text-gray-600">{message}</p>}</>;
}

export default function ShareKitModal({ share, onClose, uiLocale = 'en' }: {
  share: ListingShareResponse; onClose: () => void; uiLocale?: AnonymousAllAILocale;
}) {
  const t = PROMOTE_STRINGS[uiLocale];
  if (!share.promote?.can_share) return null;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true" aria-labelledby="share-kit-title">
    <div className="max-h-[90vh] w-full max-w-3xl space-y-4 overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
      <div className="flex items-center justify-between"><h2 id="share-kit-title" className="text-lg font-semibold text-gray-900">{t.kit}</h2>
        <button type="button" onClick={onClose} className="rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50">{t.close}</button></div>
      <img src={share.card_url} alt={t.preview} className="aspect-[1.91/1] w-full rounded-md border border-gray-200 object-cover" />
      <p className="whitespace-pre-line text-sm text-gray-700">{share.promote.copy_text}</p>
      <PromoteNetworkButtons promote={share.promote} uiLocale={uiLocale} />
    </div>
  </div>;
}
