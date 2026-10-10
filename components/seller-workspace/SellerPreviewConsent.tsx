'use client';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { useSellerSwitches } from '@/hooks/useSellerSwitches';
import { newDecision, readPreview, revokePreview, type PreviewStatus, type PreviewRevoke } from '@/api/connector-seller-settings';
import NativeSellerAuth from '@/components/NativeSellerAuth';

export const PREVIEW_CONSENT_WORDING = 'Allow AI preview of this exact approved public sample for the selected grants and Claude profile (at most 5 rows / 2 KB).';
export default function SellerPreviewConsent({ listingId }: { listingId: string }) {
  const switches = useSellerSwitches(); const { user, token } = useAuthStore();
  if (switches?.seller !== true || !user) return null;
  return <PreviewConsentScreen key={`${user.id}:${token}:${listingId}`} listingId={listingId} />;
}
export function PreviewConsentScreen({ listingId }: { listingId: string }) {
  const [status, setStatus] = useState<PreviewStatus | null>(null); const [error, setError] = useState<unknown>(null);
  const [retry, setRetry] = useState(0); const [busy, setBusy] = useState(false); const [decision, setDecision] = useState<PreviewRevoke | null>(null);
  useEffect(() => { let active = true; setStatus(null); setDecision(null);
    readPreview(listingId).then(s => { if (active) { setStatus(s); setError(null); } }).catch(e => { if (active) setError(e); });
    return () => { active = false; };
  }, [listingId, retry]);
  const revoke = async () => {
    if (!status || busy || !status.consent_publication_version_id || !status.consent_sample_set_hash) return;
    setBusy(true); setError(null);
    try { const body = decision ?? { ...newDecision(status.version), listing_id: listingId, publication_version_id: status.consent_publication_version_id, sample_set_hash: status.consent_sample_set_hash };
      setDecision(body); await revokePreview(body); setRetry(n => n + 1);
    } catch(e) { setError(e); } finally { setBusy(false); }
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
    <button onClick={() => setRetry(n => n + 1)}>Refresh consent status</button>
    <NativeSellerAuth error={error} onRetry={() => setRetry(n => n + 1)} onToken={async () => { setRetry(n => n + 1); }} />
  </section>;
}
