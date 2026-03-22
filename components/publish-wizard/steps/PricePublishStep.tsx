'use client';

import type { PricePublishData, PublishWizardContextSnapshot } from '../types';

export function PricePublishStep({
  data,
  context,
  onChange,
  onPublish,
  publishing,
}: {
  data: PricePublishData;
  context: PublishWizardContextSnapshot;
  onChange: (patch: Partial<PricePublishData>) => void;
  onPublish: () => void;
  publishing: boolean;
}) {
  const priceNumber = Number(data.price || '0');
  const sellerShare = Number.isFinite(priceNumber) ? priceNumber * 0.95 : 0;
  const marketplaceShare = Number.isFinite(priceNumber) ? priceNumber * 0.05 : 0;

  const checklist = data.checklist;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-stone-500">Step 8</p>
        <h3 className="mt-2 text-3xl font-semibold text-stone-950">Set price and publish</h3>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-[2rem] border border-stone-200 bg-white p-6">
          <label className="space-y-2">
            <span className="text-sm font-medium text-stone-700">One-time price (USD)</span>
            <input
              type="number"
              min="1"
              step="1"
              value={data.price}
              onChange={(event) => onChange({ price: event.target.value })}
              className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3"
            />
          </label>

          <div className="mt-6 rounded-[1.5rem] bg-stone-100 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-stone-500">Revenue split</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl bg-white px-4 py-4">
                <p className="text-sm text-stone-500">Seller 95%</p>
                <p className="mt-2 text-2xl font-semibold text-stone-900">${sellerShare.toFixed(2)}</p>
              </div>
              <div className="rounded-2xl bg-white px-4 py-4">
                <p className="text-sm text-stone-500">ai.market 5%</p>
                <p className="mt-2 text-2xl font-semibold text-stone-900">${marketplaceShare.toFixed(2)}</p>
              </div>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {[
              ['oneTimeOnly', 'I confirm this listing uses one-time pricing only.'],
              ['reviewedPrivacy', 'I reviewed privacy findings and all allAI redaction proposals.'],
              ['reviewedMetadata', 'I reviewed metadata proposals and listing copy.'],
            ].map(([field, label]) => (
              <label key={field} className="flex items-start gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
                <input
                  type="checkbox"
                  checked={checklist[field as keyof typeof checklist]}
                  onChange={(event) =>
                    onChange({
                      checklist: {
                        ...checklist,
                        [field]: event.target.checked,
                      },
                    })
                  }
                  className="mt-1 h-5 w-5"
                />
                <span className="text-sm text-stone-700">{label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="rounded-[2rem] bg-stone-950 p-6 text-stone-50">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-300">Publish status</p>
          <p className="mt-4 text-sm leading-7 text-stone-300">
            The backend FSM currently reports <span className="font-semibold text-white">{context.status}</span>. The publish button will only complete when the operation is already at the final legal transition window.
          </p>
          <p className="mt-4 text-sm text-stone-400">
            Last saved {context.lastSavedAt ? new Date(context.lastSavedAt).toLocaleString() : 'not yet'}.
          </p>
          <button
            type="button"
            onClick={onPublish}
            disabled={publishing}
            className="mt-8 w-full rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-stone-950 disabled:opacity-60"
          >
            {publishing ? 'Publishing...' : 'Publish Listing'}
          </button>
        </div>
      </div>
    </div>
  );
}
