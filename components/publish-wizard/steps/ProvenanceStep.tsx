'use client';

import type { ProvenanceData } from '../types';

export function ProvenanceStep({
  data,
  onChange,
}: {
  data: ProvenanceData;
  onChange: (patch: Partial<ProvenanceData>) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-stone-500">Step 5</p>
        <h3 className="mt-2 text-3xl font-semibold text-stone-950">Describe data provenance</h3>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {[
          ['source', 'Original source'],
          ['collectionMethod', 'Collection method'],
          ['collectionDates', 'Collection dates'],
          ['geoCoverage', 'Geographic coverage'],
          ['license', 'License'],
        ].map(([field, label]) => (
          <label key={field} className="space-y-2">
            <span className="text-sm font-medium text-stone-700">{label}</span>
            <input
              value={data[field as keyof ProvenanceData] as string}
              onChange={(event) => onChange({ [field]: event.target.value } as Partial<ProvenanceData>)}
              className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3"
            />
          </label>
        ))}
      </div>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-stone-700">Processing summary</span>
        <textarea
          value={data.processingSummary}
          onChange={(event) => onChange({ processingSummary: event.target.value })}
          rows={5}
          className="w-full rounded-[1.5rem] border border-stone-200 bg-white px-4 py-3"
        />
      </label>
    </div>
  );
}
