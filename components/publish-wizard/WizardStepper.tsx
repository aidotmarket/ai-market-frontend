'use client';

import { WIZARD_STEPS } from './types';

export function WizardStepper({
  currentStep,
  completedSteps,
  onSelect,
  isStepUnlocked,
}: {
  currentStep: number;
  completedSteps: Set<number>;
  onSelect: (index: number) => void;
  isStepUnlocked: (index: number) => boolean;
}) {
  return (
    <aside className="rounded-[2rem] border border-stone-200 bg-white/90 p-5 shadow-[0_24px_80px_-48px_rgba(36,32,20,0.45)] backdrop-blur">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-stone-500">Publish Flow</p>
        <h2 className="mt-2 text-xl font-semibold text-stone-900">Eight-step launch checklist</h2>
      </div>

      <div className="space-y-3">
        {WIZARD_STEPS.map((step, index) => {
          const active = index === currentStep;
          const unlocked = isStepUnlocked(index);
          const complete = completedSteps.has(index);

          return (
            <button
              key={step.key}
              type="button"
              onClick={() => unlocked && onSelect(index)}
              className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${
                active
                  ? 'bg-stone-900 text-stone-50'
                  : unlocked
                    ? 'bg-stone-50 text-stone-700 hover:bg-stone-100'
                    : 'cursor-not-allowed bg-stone-50/70 text-stone-400'
              }`}
            >
              <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
                active ? 'bg-amber-300 text-stone-900' : complete ? 'bg-emerald-500 text-white' : 'bg-stone-200 text-stone-600'
              }`}>
                {complete ? 'OK' : index + 1}
              </span>
              <div>
                <p className="text-xs uppercase tracking-[0.25em] opacity-60">{step.key.replace('_', ' ')}</p>
                <p className="text-sm font-medium">{step.label}</p>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
