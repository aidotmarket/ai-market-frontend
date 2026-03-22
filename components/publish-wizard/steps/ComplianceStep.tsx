'use client';

import type { ComplianceData } from '../types';

const FRAMEWORKS = ['GDPR', 'CCPA', 'HIPAA', 'SOC2'];

export function ComplianceStep({
  data,
  onChange,
}: {
  data: ComplianceData;
  onChange: (patch: Partial<ComplianceData>) => void;
}) {
  const toggleFramework = (framework: string) => {
    const next = data.frameworks.includes(framework)
      ? data.frameworks.filter((item) => item !== framework)
      : [...data.frameworks, framework];
    onChange({ frameworks: next });
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-stone-500">Step 4</p>
        <h3 className="mt-2 text-3xl font-semibold text-stone-950">Map compliance coverage</h3>
      </div>

      <div className="flex flex-wrap gap-3">
        {FRAMEWORKS.map((framework) => (
          <button
            key={framework}
            type="button"
            onClick={() => toggleFramework(framework)}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              data.frameworks.includes(framework)
                ? 'bg-stone-900 text-white'
                : 'bg-white text-stone-700 ring-1 ring-stone-200'
            }`}
          >
            {framework}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="space-y-2">
          <span className="text-sm font-medium text-stone-700">Contains personal data?</span>
          <select
            value={data.handlingPII}
            onChange={(event) => onChange({ handlingPII: event.target.value })}
            className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3"
          >
            <option value="">Select</option>
            <option value="no">No</option>
            <option value="limited">Limited</option>
            <option value="yes">Yes</option>
          </select>
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium text-stone-700">Cross-border transfers</span>
          <select
            value={data.crossBorderTransfers}
            onChange={(event) => onChange({ crossBorderTransfers: event.target.value })}
            className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3"
          >
            <option value="">Select</option>
            <option value="none">None</option>
            <option value="regional">Regional only</option>
            <option value="global">Global</option>
          </select>
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium text-stone-700">Regulated data exposure</span>
          <select
            value={data.regulatedData}
            onChange={(event) => onChange({ regulatedData: event.target.value })}
            className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3"
          >
            <option value="">Select</option>
            <option value="none">None</option>
            <option value="moderate">Moderate</option>
            <option value="high">High</option>
          </select>
        </label>
      </div>
    </div>
  );
}
