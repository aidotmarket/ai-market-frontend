'use client';

import { AllAIProposal } from '../AllAIProposal';
import type { MetadataData, ProposalDecisionValue } from '../types';

export function MetadataStep({
  data,
  onChange,
  onProposalDecision,
}: {
  data: MetadataData;
  onChange: (patch: Partial<MetadataData>) => void;
  onProposalDecision: (proposalId: string, status: ProposalDecisionValue, editedValue?: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-stone-500">Step 7</p>
        <h3 className="mt-2 text-3xl font-semibold text-stone-950">Finalize listing metadata</h3>
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

      <div className="grid gap-4">
        <label className="space-y-2">
          <span className="text-sm font-medium text-stone-700">Title</span>
          <input
            value={data.title}
            onChange={(event) => onChange({ title: event.target.value })}
            className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3"
          />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium text-stone-700">Description</span>
          <textarea
            value={data.description}
            onChange={(event) => onChange({ description: event.target.value })}
            rows={5}
            className="w-full rounded-[1.5rem] border border-stone-200 bg-white px-4 py-3"
          />
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-stone-700">Tags</span>
            <input
              value={data.tags.join(', ')}
              onChange={(event) => onChange({ tags: event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean) })}
              className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-stone-700">Category</span>
            <input
              value={data.category}
              onChange={(event) => onChange({ category: event.target.value })}
              className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3"
            />
          </label>
        </div>
      </div>

      <div className="rounded-[2rem] border border-stone-200 bg-stone-950 p-6 text-stone-50">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-300">Live listing preview</p>
        <h4 className="mt-4 text-2xl font-semibold">{data.title || 'Untitled dataset listing'}</h4>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-stone-300">{data.description || 'Describe the dataset, why it matters, and what buyers can do with it.'}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {data.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-stone-200">{tag}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
