'use client';

import type { ListingShareCaption, ListingShareResponse } from '@/api/share';

interface ShareKitModalProps {
  share: ListingShareResponse;
  onClose: () => void;
}

export function buildShareKitDrafts(share: ListingShareResponse) {
  const caption = share.caption;
  const title = caption?.og_title || 'ai.market listing';
  const text = caption?.caption_text || caption?.og_description || title;
  const emailBody = `${text}\n\n${share.share_url}`;

  return [
    {
      platform: 'X/Twitter',
      draft: text,
      href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(share.share_url)}`,
    },
    {
      platform: 'LinkedIn',
      draft: text,
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(share.share_url)}`,
    },
    {
      platform: 'Email',
      draft: emailBody,
      href: `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(emailBody)}`,
    },
  ];
}

export function getCaptionTitle(caption: ListingShareCaption | null): string {
  return caption?.og_title || 'Share this listing';
}

export default function ShareKitModal({ share, onClose }: ShareKitModalProps) {
  const drafts = buildShareKitDrafts(share);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-kit-title"
    >
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h2 id="share-kit-title" className="text-lg font-semibold text-gray-900">
            Share Kit
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            Close
          </button>
        </div>

        <div className="grid gap-5 p-5 md:grid-cols-[280px_1fr]">
          <div>
            <img
              src={share.card_url}
              alt="Share card preview"
              className="aspect-[1.91/1] w-full rounded-md border border-gray-200 object-cover"
            />
            <p className="mt-3 break-all text-xs text-gray-500">{share.share_url}</p>
          </div>

          <div className="space-y-3">
            {drafts.map((draft) => (
              <div key={draft.platform} className="rounded-lg border border-gray-200 p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-gray-900">{draft.platform}</h3>
                  <a
                    href={draft.href}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md bg-[#3F51B5] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#303F9F]"
                  >
                    Open
                  </a>
                </div>
                <p className="whitespace-pre-line break-words text-sm leading-6 text-gray-700">
                  {draft.draft}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
