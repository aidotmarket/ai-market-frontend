'use client';

import type { AccountLinkData } from '../types';

export function AccountLinkStep({
  data,
  onChange,
}: {
  data: AccountLinkData;
  onChange: (patch: Partial<AccountLinkData>) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-stone-500">Step 1</p>
        <h3 className="mt-2 text-3xl font-semibold text-stone-950">Link your Vectoraiz device</h3>
        <p className="mt-3 max-w-3xl text-base leading-7 text-stone-600">
          This wizard resumes the publish operation your device started. Confirm the account and label the device so ai.market can keep the listing traceable end to end.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-medium text-stone-700">Account email</span>
          <input
            value={data.email}
            onChange={(event) => onChange({ email: event.target.value })}
            className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3"
            placeholder="seller@company.com"
          />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium text-stone-700">Device label</span>
          <input
            value={data.deviceLabel}
            onChange={(event) => onChange({ deviceLabel: event.target.value })}
            className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3"
            placeholder="Revenue warehouse exporter"
          />
        </label>
      </div>

      <button
        type="button"
        onClick={() => onChange({ linked: !data.linked })}
        className={`rounded-full px-5 py-3 text-sm font-semibold ${
          data.linked ? 'bg-emerald-600 text-white' : 'bg-stone-900 text-white'
        }`}
      >
        {data.linked ? 'Device linked' : 'Link device to ai.market'}
      </button>
    </div>
  );
}
