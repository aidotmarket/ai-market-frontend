'use client';
import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { newDecision, nativeSession, readPreview, reviewRevokePreview, revokePreview, type PreviewStatus, type PreviewRevoke, type DecisionReview } from '@/api/connector-seller-settings';
import NativeSellerAuth from '@/components/NativeSellerAuth';

export const PREVIEW_CONSENT_WORDING = 'Allow AI preview of this exact approved public sample for the selected grants and Claude profile (at most 5 rows / 2 KB).';
const buttonClass = 'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium disabled:opacity-50';
export default function SellerPreviewConsent({ listingId }: { listingId: string }) {
  const { user, token } = useAuthStore();
  if (!user || !token) return null;
  return <PreviewConsentScreen key={`${user.id}:${listingId}`} listingId={listingId} />;
}
export function PreviewConsentScreen({ listingId }: { listingId: string }) {
  const token = useAuthStore(s => s.token);
  const active = useRef(true);
  const decision = useRef<PreviewRevoke | null>(null);
  const [review, setReview] = useState<{ body: PreviewRevoke; result: DecisionReview<PreviewRevoke> } | null>(null);
  const [status, setStatus] = useState<PreviewStatus | null>(null); const [error, setError] = useState<unknown>(null);
  const [retry, setRetry] = useState(0); const [busy, setBusy] = useState(false);
  useEffect(() => { let current = true; active.current = true; setStatus(null); setReview(null);
    readPreview(listingId).then(s => { if (current) { setStatus(s); setError(null); } }).catch(e => { if (current) setError(e); });
    return () => { current = false; active.current = false; };
  }, [listingId, retry, token]);
  const revoke = async () => {
    if (!status || busy || !status.consent_publication_version_id || !status.consent_sample_set_hash) return;
    setBusy(true); setError(null); setReview(null);
    try {
      if (decision.current?.expected_version !== status.version) decision.current = null;
      const retained = decision.current ?? { ...newDecision(status.version), listing_id: listingId, publication_version_id: status.consent_publication_version_id, sample_set_hash: status.consent_sample_set_hash };
      const csrf = nativeSession().csrf;
      const body = { ...retained, csrf };
      decision.current = body;
      const result = await reviewRevokePreview(body); if (active.current) setReview({ body, result });
    } catch(e) { if (active.current) setError(e); } finally { if (active.current) setBusy(false); }
  };
  const confirmRevoke = async () => {
    if (!review || busy) return;
    setBusy(true); setError(null);
    try { await revokePreview({ ...review.body, review_hash: review.result.review_hash });
      if (active.current) { decision.current = null; setReview(null); setRetry(n => n + 1); }
    } catch(e) { if (active.current) { setError(e); setReview(null); } }
    finally { if (active.current) setBusy(false); }
  };
  return <section aria-label="Public sample and AI preview consent" className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
    <h3 className="text-xl font-semibold text-gray-900">Public sample and AI preview consent</h3>
    <div className="space-y-3 border-t border-gray-200 pt-4">
      <label className="flex items-start gap-3 font-semibold text-gray-900"><input className="mt-1 h-4 w-4 shrink-0" type="checkbox" checked={false} disabled /><span>Approve a new or replaced public sample</span></label>
      <p className="text-sm text-gray-600">Native sample upload and review selection are unavailable. Public sample approval, AI preview consent and licence acceptance are independent decisions.</p>
    </div>
    <div className="space-y-3 border-t border-gray-200 pt-4">
      <label className="flex items-start gap-3 font-semibold text-gray-900"><input className="mt-1 h-4 w-4 shrink-0" type="checkbox" checked={false} disabled /><span>{PREVIEW_CONSENT_WORDING}</span></label>
      <p className="text-sm text-gray-600">Preview values withheld: the verified native sample adapter is unavailable. Schema, statistics and descriptors only. Consent defaults off; a saved consent alone cannot enable values.</p>
    </div>
    {status && <><p className="text-sm text-gray-600">Saved consent: {status.enabled ? 'On for the current sample' : 'Off, revoked or stale'} · Version {status.version}</p>
      <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-x-4 gap-y-2 text-sm">
        <dt className="text-gray-600">Publication version</dt><dd className="break-all font-mono text-xs text-gray-900">{status.publication_version_id}</dd>
        <dt className="text-gray-600">Current sample digest</dt><dd className="break-all font-mono text-xs text-gray-900">{status.sample_set_hash ?? 'Unavailable'}</dd>
        <dt className="text-gray-600">Consented publication</dt><dd className="break-all font-mono text-xs text-gray-900">{status.consent_publication_version_id ?? 'None'}</dd>
        <dt className="text-gray-600">Consented sample digest</dt><dd className="break-all font-mono text-xs text-gray-900">{status.consent_sample_set_hash ?? 'None'}</dd>
        <dt className="text-gray-600">Current grants</dt><dd className="break-all font-mono text-xs text-gray-900">{status.grant_ids.join(', ') || 'None reported'}</dd>
        <dt className="text-gray-600">Current profiles</dt><dd className="break-all text-gray-900">{status.profiles.join(', ') || 'None reported'}</dd>
      </dl></>}
    <div className="flex flex-wrap gap-2">
      {status && <button className={buttonClass} disabled={busy || !status.consent_publication_version_id || !status.consent_sample_set_hash} onClick={() => void revoke()}>Revoke AI preview consent</button>}
      <button className={buttonClass} onClick={() => { decision.current = null; setRetry(n => n + 1); }}>Refresh consent status</button>
    </div>
    {review && <section aria-label="Exact server preview withdrawal review" className="space-y-3 rounded-lg border border-indigo-200 p-4"><pre className="max-h-64 overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-3 font-mono text-xs text-gray-900">{JSON.stringify(review.result, null, 2)}</pre><button className={buttonClass} disabled={busy} onClick={() => void confirmRevoke()}>Confirm revoke AI preview consent</button></section>}
    <NativeSellerAuth error={error} />
  </section>;
}
