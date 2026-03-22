'use client';

import { useState } from 'react';
import type { ProposalCardData, ProposalDecisionState, ProposalDecisionValue } from './types';

export function AllAIProposal({
  proposal,
  decision,
  onDecision,
}: {
  proposal: ProposalCardData;
  decision: ProposalDecisionState;
  onDecision: (status: ProposalDecisionValue, editedValue?: string) => void;
}) {
  const [draftValue, setDraftValue] = useState(decision.editedValue ?? proposal.value);

  return (
    <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-700">allAI proposal</p>
          <h4 className="mt-1 text-sm font-semibold text-stone-900">{proposal.label}</h4>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">
          {decision.status}
        </span>
      </div>

      <p className="mt-3 rounded-2xl bg-white px-4 py-3 text-sm text-stone-700">{proposal.value}</p>
      <p className="mt-3 text-sm leading-6 text-stone-600">{proposal.reasoning}</p>

      <textarea
        value={draftValue}
        onChange={(event) => setDraftValue(event.target.value)}
        rows={3}
        className="mt-3 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700 outline-none ring-0 focus:border-stone-900"
      />

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onDecision('accept')}
          className="rounded-full bg-stone-900 px-4 py-2 text-sm font-semibold text-white"
        >
          Accept
        </button>
        <button
          type="button"
          onClick={() => onDecision('edit', draftValue)}
          className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-stone-900 ring-1 ring-stone-200"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => onDecision('reject')}
          className="rounded-full bg-rose-100 px-4 py-2 text-sm font-semibold text-rose-700"
        >
          Reject
        </button>
      </div>
    </div>
  );
}
