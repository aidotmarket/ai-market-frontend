'use client';

import { useState } from 'react';
import type { FieldProposal } from './WizardAllAIBridge';

const FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  description: 'Description',
  ai_title: 'Title',
  ai_description: 'Description',
  ai_category: 'Category',
  ai_tags: 'Tags',
  ai_suggested_price: 'Suggested Price',
  price: 'Price',
  data_format: 'Format',
  row_count: 'Row Count',
  pricing_type: 'Pricing Type',
  currency: 'Currency',
  compliance_notes: 'Compliance Notes',
};

export default function FieldProposalCard({
  proposal,
  onAccept,
  onEdit,
  onReject,
}: {
  proposal: FieldProposal;
  onAccept: () => void;
  onEdit: (editedValue: string) => void;
  onReject: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(proposal.proposedValue);

  if (proposal.status !== 'pending') return null;

  const label = FIELD_LABELS[proposal.field] || proposal.field;

  const handleEdit = () => {
    setEditValue(proposal.proposedValue);
    setIsEditing(true);
  };

  const handleEditSubmit = () => {
    onEdit(editValue);
    setIsEditing(false);
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 rounded-lg border border-blue-200/60 bg-blue-950/40 p-3 my-2">
      <div className="flex items-start gap-2 mb-2">
        <span className="text-blue-300 text-sm shrink-0">&#128161;</span>
        <p className="text-xs text-blue-200/80">
          allAI suggests for <span className="font-semibold text-blue-100">&ldquo;{label}&rdquo;</span>:
        </p>
      </div>

      {!isEditing ? (
        <>
          <div className="ml-6 mb-2">
            <p className="text-sm text-white/90 font-medium leading-relaxed break-words">
              &ldquo;{proposal.proposedValue}&rdquo;
            </p>
          </div>

          {proposal.reasoning && (
            <div className="ml-6 mb-3">
              <p className="text-xs text-white/50 leading-relaxed">
                <span className="font-medium text-white/60">Reasoning:</span> {proposal.reasoning}
              </p>
            </div>
          )}

          <div className="ml-6 flex items-center gap-2">
            <button
              onClick={onAccept}
              className="inline-flex items-center gap-1 rounded-md bg-green-600/80 hover:bg-green-600 px-2.5 py-1 text-xs font-medium text-white transition-colors"
            >
              &#10003; Accept
            </button>
            <button
              onClick={handleEdit}
              className="inline-flex items-center gap-1 rounded-md bg-white/10 hover:bg-white/20 px-2.5 py-1 text-xs font-medium text-white/80 transition-colors"
            >
              &#9998; Edit
            </button>
            <button
              onClick={onReject}
              className="inline-flex items-center gap-1 rounded-md bg-white/5 hover:bg-red-600/40 px-2.5 py-1 text-xs font-medium text-white/50 hover:text-white/80 transition-colors"
            >
              &#10005; Reject
            </button>
          </div>
        </>
      ) : (
        <div className="ml-6 space-y-2">
          <textarea
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/90 placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
            autoFocus
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleEditSubmit}
              className="inline-flex items-center gap-1 rounded-md bg-blue-600/80 hover:bg-blue-600 px-2.5 py-1 text-xs font-medium text-white transition-colors"
            >
              Apply
            </button>
            <button
              onClick={() => setIsEditing(false)}
              className="inline-flex items-center gap-1 rounded-md bg-white/5 hover:bg-white/10 px-2.5 py-1 text-xs font-medium text-white/50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
