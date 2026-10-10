'use client';
import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { newDecision, nativeSession, readPreview, reviewRevokePreview, revokePreview, type PreviewStatus, type PreviewRevoke, type DecisionReview } from '@/api/connector-seller-settings';
import NativeSellerAuth from '@/components/NativeSellerAuth';

export const PREVIEW_CONSENT_WORDING = 'Allow AI preview of this exact approved public sample for the selected grants and Claude profile (at most 5 rows / 2 KB).';
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
  const revoke = async (reauth?: string) => {
    if (!status || busy || !status.consent_publication_version_id || !status.consent_sample_set_hash) return;
    setBusy(true); setError(null); setReview(null);
    try {
      if (decision.current?.expected_version !== status.version) decision.current = null;
      const retained = decision.current ?? { ...newDecision(status.version), listing_id: listingId, publication_version_id: status.consent_publication_version_id, sample_set_hash: status.consent_sample_set_hash };
      const csrf = nativeSession().csrf;
      const body = { ...retained, csrf, reauth_token: reauth ?? (retained.csrf === csrf ? retained.reauth_token : undefined) };
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
  return <section aria-label="Public sample and AI preview consent" className="space-y-3 rounded border p-4">
    <h3>Public sample and AI preview consent</h3>
    <label><input type="checkbox" checked={false} disabled />Approve a new or replaced public sample</label>
    <p>Native sample upload and review selection are unavailable. Public sample approval, AI preview consent and licence acceptance are independent decisions.</p>
    <label><input type="checkbox" checked={false} disabled />{PREVIEW_CONSENT_WORDING}</label>
    <p>Preview values withheld: the verified native sample adapter is unavailable. Schema, statistics and descriptors only. Consent defaults off; a saved consent alone cannot enable values.</p>
    {status && <><p>Saved consent: {status.enabled ? 'On for the current sample' : 'Off, revoked or stale'} · Version {status.version}</p>
      <dl><dt>Publication version</dt><dd>{status.publication_version_id}</dd><dt>Current sample digest</dt><dd>{status.sample_set_hash ?? 'Unavailable'}</dd>
      <dt>Consented publication</dt><dd>{status.consent_publication_version_id ?? 'None'}</dd><dt>Consented sample digest</dt><dd>{status.consent_sample_set_hash ?? 'None'}</dd>
      <dt>Current grants</dt><dd>{status.grant_ids.join(', ') || 'None reported'}</dd><dt>Current profiles</dt><dd>{status.profiles.join(', ') || 'None reported'}</dd></dl>
      <button disabled={busy || !status.consent_publication_version_id || !status.consent_sample_set_hash} onClick={() => void revoke()}>Revoke AI preview consent</button></>}
    <button onClick={() => { decision.current = null; setRetry(n => n + 1); }}>Refresh consent status</button>
    {review && <section aria-label="Exact server preview withdrawal review"><pre>{JSON.stringify(review.result, null, 2)}</pre><button disabled={busy} onClick={() => void confirmRevoke()}>Confirm revoke AI preview consent</button></section>}
    <NativeSellerAuth error={error} onRetry={() => { if (decision.current) void revoke(); else setRetry(n => n + 1); }} onToken={revoke} />
  </section>;
}
