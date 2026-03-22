'use client';

import { AllAIProposal } from '../AllAIProposal';
import type { PrivacyData, ProposalDecisionValue } from '../types';

export function PrivacyStep({
  data,
  onChange,
  onRunScan,
  scanning,
  onProposalDecision,
}: {
  data: PrivacyData;
  onChange: (patch: Partial<PrivacyData>) => void;
  onRunScan: () => void;
  scanning: boolean;
  onProposalDecision: (proposalId: string, status: ProposalDecisionValue, editedValue?: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-stone-500">Step 3</p>
          <h3 className="mt-2 text-3xl font-semibold text-stone-950">Review privacy findings</h3>
          <p className="mt-3 max-w-3xl text-base leading-7 text-stone-600">
            Run the server-side PII scan, then explicitly accept, edit, or reject each allAI redaction suggestion before advancing.
          </p>
        </div>
        <button
          type="button"
          onClick={onRunScan}
          disabled={scanning}
          className="rounded-full bg-stone-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {scanning ? 'Scanning...' : 'Run PII Scan'}
        </button>
      </div>

      <div className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-stone-100 text-stone-600">
            <tr>
              <th className="px-5 py-4 font-semibold">Column</th>
              <th className="px-5 py-4 font-semibold">PII Type</th>
              <th className="px-5 py-4 font-semibold">Confidence</th>
              <th className="px-5 py-4 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {data.findings.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-6 text-stone-500">No findings yet. Run the scan to populate this review table.</td>
              </tr>
            ) : (
              data.findings.map((finding) => (
                <tr key={`${finding.column_name}-${finding.pii_type}`} className="border-t border-stone-100">
                  <td className="px-5 py-4 font-medium text-stone-800">{finding.column_name}</td>
                  <td className="px-5 py-4 text-stone-600">{finding.pii_type}</td>
                  <td className="px-5 py-4 text-stone-600">{Math.round(finding.confidence * 100)}%</td>
                  <td className="px-5 py-4 text-stone-600">{finding.redaction_action}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data.proposals.length > 0 && (
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
      )}

      <label className="block space-y-2">
        <span className="text-sm font-medium text-stone-700">Privacy review notes</span>
        <textarea
          value={data.notes}
          onChange={(event) => onChange({ notes: event.target.value })}
          rows={4}
          className="w-full rounded-[1.5rem] border border-stone-200 bg-white px-4 py-3"
          placeholder="Document reviewer notes, exceptions, or follow-up actions."
        />
      </label>
    </div>
  );
}
