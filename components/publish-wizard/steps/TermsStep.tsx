'use client';

import type { TermsData } from '../types';

export function TermsStep({
  data,
  onChange,
}: {
  data: TermsData;
  onChange: (patch: Partial<TermsData>) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-stone-500">Step 2</p>
        <h3 className="mt-2 text-3xl font-semibold text-stone-950">Confirm marketplace terms</h3>
        <p className="mt-3 max-w-3xl text-base leading-7 text-stone-600">
          Listing publication requires seller authorization, one-time pricing, and explicit consent for any allAI-assisted field changes.
        </p>
      </div>

      <div className="rounded-[2rem] border border-stone-200 bg-white p-6">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={data.accepted}
            onChange={(event) =>
              onChange({
                accepted: event.target.checked,
                acceptedAt: event.target.checked ? new Date().toISOString() : undefined,
              })
            }
            className="mt-1 h-5 w-5 rounded border-stone-300"
          />
          <span className="text-sm leading-7 text-stone-700">
            I accept the ai.market seller terms, confirm I have the right to publish this dataset, and understand this wizard will not auto-accept allAI proposals without my consent.
          </span>
        </label>
      </div>
    </div>
  );
}
