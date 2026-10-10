'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { SafeBatchValue, SellerSingleSummary, SellerBatchSummary } from '@/lib/seller-batch';

function Fields({ values }: { values: Record<string, SafeBatchValue> }) {
  return <dl className="space-y-2">{Object.entries(values).map(([key, value]) => <div key={key}>
    <dt className="font-medium">{key.replaceAll('_', ' ')}</dt>
    <dd className="break-all whitespace-pre-wrap">{value === null ? 'None' : String(value)}</dd>
  </div>)}</dl>;
}

export default function SellerBatchReview({ summary, expiresAt, reviewHash }: { summary: SellerBatchSummary | SellerSingleSummary; expiresAt: string; reviewHash?: string }) {
  const [page, setPage] = useState(0);
  const single = summary.summary_type === 'seller_single_v1';
  const pages = Math.ceil(summary.items.length / 10);
  return <section aria-label={single ? "Seller item review" : "Seller batch review"} className="space-y-4 rounded-lg border p-6">
    <h2 className="text-lg font-semibold">{summary.client_display_name} asks to {summary.verb} {summary.summary_type === 'seller_single_v1' ? 'one seller item' : 'a seller batch'}</h2>
    <p>Requested at <time dateTime={summary.requested_at}>{summary.requested_at}</time></p>
    <p>{summary.requested_count} requested · {summary.eligible_count} eligible · {summary.blocked_count} blocked</p>
    {!single && <p>Best-effort partial execution: eligible members execute independently after authorization. Some may fail; successful members remain completed. Blocked members will not execute.</p>}
    <p>{single ? "One Confirm authorizes this exact saved item." : `One Confirm authorizes the complete saved batch across all ${pages} display pages.`} It also reviews the exact saved presentation and sample references; it never signs licences.</p>
    <p>Review expires: <time dateTime={expiresAt}>{expiresAt}</time></p>
    <p>Execution deadline: <time dateTime={summary.execution_deadline}>{summary.execution_deadline}</time></p>
    <p>Absolute request ceiling: 50 items. Requests are never automatically split. Exact exceptions do not change standing limits.</p>
    {reviewHash && <p className="break-all">Bound pending review hash: {reviewHash}</p>}
    <p>Limit version {summary.limit_version} · Proposed usage {summary.proposed_usage}</p>
    <ol start={page * 10 + 1} className="space-y-6">{summary.items.slice(page * 10, (page + 1) * 10).map(item => <li key={item.item_id} className="space-y-3 border-t pt-4">
      <h3 className="font-semibold">Target {item.target_id}</h3>
      <p>Caller index {item.result_index} · {item.status} · {item.reason}</p>
      <p>Action {item.action} · Version {item.action_version}</p>
      <div className="grid gap-4 sm:grid-cols-2"><section aria-label={`Before ${item.target_id}`}><h4 className="font-semibold">Before</h4><Fields values={item.before} /></section>
        <section aria-label={`After ${item.target_id}`}><h4 className="font-semibold">After</h4><Fields values={item.after} /></section></div>
      <section aria-label={`References ${item.target_id}`}><h4 className="font-semibold">Target, version, price/currency, legal/signature, sample and presentation references</h4><Fields values={item.references} /></section>
      <p>Policy reasons: {item.policy_reasons.join(' · ')}</p>
      <details><summary>Item binding details</summary><Fields values={{ item_id: item.item_id, args_hash: item.args_hash, facts_hash: item.facts_hash, binding_hash: item.binding_hash }} /></details>
    </li>)}</ol>
    {pages > 1 && <nav aria-label="Batch display pages" className="flex gap-4">
      <button type="button" disabled={page === 0} onClick={() => setPage(n => n - 1)}>Previous members</button>
      <span>Page {page + 1} of {pages}</span>
      <button type="button" disabled={page + 1 === pages} onClick={() => setPage(n => n + 1)}>Next members</button>
    </nav>}
    <section aria-label="Separate Workspace legal signing"><h3 className="font-semibold">Workspace step: Sign licences</h3>
      <p>Sign licences separately in Workspace against the exact targets and versions. After any legal change, ask your assistant for a fresh connector request, key and snapshot before confirming.</p>
      <Link href="/dashboard/seller-workspace" prefetch={false} rel="noreferrer">Open Workspace for legal signing</Link>
    </section>
    <details><summary>Complete batch identity</summary><Fields values={{ summary_type: summary.summary_type, format_version: summary.format_version,
      action: summary.action, action_version: summary.action_version, user_id: summary.user_id, org_id: summary.org_id,
      client_id: summary.client_id, grant_id: summary.grant_id, profile: summary.profile, tool_set: summary.tool_set,
      execution_semantics: summary.execution_semantics }} /></details>
  </section>;
}
