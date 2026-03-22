'use client';

import { AllAIProposal } from '../AllAIProposal';
import type { ProposalDecisionValue, QualityData } from '../types';

const DIMENSIONS = [
  'completeness',
  'consistency',
  'coverage',
  'freshness',
  'documentation',
  'trust',
] as const;

export function QualityStep({
  data,
  onChange,
  onProposalDecision,
}: {
  data: QualityData;
  onChange: (patch: Partial<QualityData>) => void;
  onProposalDecision: (proposalId: string, status: ProposalDecisionValue, editedValue?: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-stone-500">Step 6</p>
        <h3 className="mt-2 text-3xl font-semibold text-stone-950">Score quality and review allAI fixes</h3>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {DIMENSIONS.map((dimension) => (
          <label key={dimension} className="space-y-2 rounded-[1.5rem] border border-stone-200 bg-white p-4">
            <span className="text-sm font-medium capitalize text-stone-700">{dimension}</span>
            <input
              type="range"
              min="0"
              max="100"
              value={data.scores[dimension] ?? 0}
              onChange={(event) => onChange({ scores: { ...data.scores, [dimension]: Number(event.target.value) } })}
              className="w-full"
            />
            <span className="text-sm text-stone-500">{data.scores[dimension] ?? 0}/100</span>
          </label>
        ))}
      </div>

      <div className="rounded-[2rem] border border-stone-200 bg-white p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-stone-500">Synthetic preview</p>
        <ul className="mt-4 space-y-3 text-sm text-stone-600">
          {data.syntheticPreview.map((item) => (
            <li key={item} className="rounded-2xl bg-stone-50 px-4 py-3">{item}</li>
          ))}
        </ul>
      </div>

      <div className="grid gap-4">
        {data.proposals.map((proposal) => (
          <AllAIProposal
            key={proposal.id}
            proposal={proposal}
            decision={data.decisions[proposal.id] ?? { status: 'pending' }}
            onDecision={(status, editedValue) => onProposalDecision(proposal.id, status, editedValue)}
          />
        ))}
      </div>
    </div>
  );
}
