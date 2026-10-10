'use client';
import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { useSellerSwitches, type SellerSwitchReport } from '@/hooks/useSellerSwitches';
import { nativeClient, nativeSession } from '@/api/connector-seller-settings';
import { LICENSE_HASHES, licenseDocumentPath } from '@/api/listingLicenses';
import { readSigningInstruments, signInstruments, type SigningInstrument, type SigningRequest } from '@/api/seller-batch-signing';
import NativeSellerAuth from '@/components/NativeSellerAuth';

export default function WorkspaceBatchSigning() {
  const switches = useSellerSwitches(); const { user, token } = useAuthStore();
  if (!user || switches?.seller !== true || !switches.bulk || !switches.effects) return null;
  return <BatchSigningScreen key={`${user.id}:${token}`} switches={switches} />;
}
export function BatchSigningScreen({ switches }: { switches: SellerSwitchReport }) {
  const [ids, setIds] = useState(''); const [instruments, setInstruments] = useState<SigningInstrument[]>([]);
  const [texts, setTexts] = useState<Record<string, string>>({}); const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null); const [done, setDone] = useState(false);
  const request = useRef<SigningRequest | null>(null); const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const load = async () => {
    if (busy) return;
    setBusy(true); setError(null); setInstruments([]); setTexts({}); setConsent(false); setDone(false); request.current = null;
    try {
      const rows = await readSigningInstruments(ids.split(/\s+/).filter(Boolean));
      if (!active.current) return;
      setInstruments(rows);
      const paths = new Set<string>();
      for (const row of rows) {
        const s = row.license_selection;
        // GET preparation returns selection/hash only, not saved custom text.
        // No undisplayed custom acceptance or fabricated text endpoint.
        if (s.kind !== 'standard' || s.license_sha256 !== LICENSE_HASHES.standard[String(s.ai_training) as 'true' | 'false'] || s.covenant_sha256 !== LICENSE_HASHES.covenant)
          throw new Error('FULL_INSTRUMENT_UNAVAILABLE');
        paths.add(licenseDocumentPath('standard', s.ai_training)); paths.add(licenseDocumentPath('covenant'));
      }
      const session = nativeSession();
      const loaded = await Promise.all([...paths].map(async path => {
        const { data } = await nativeClient.get(`${path}?format=json`, { headers: session.headers });
        if (typeof data?.full_text !== 'string' || !data.full_text.trim()) throw new Error('FULL_INSTRUMENT_UNAVAILABLE');
        return [path, data.full_text] as const;
      }));
      if (nativeSession().token !== session.token) throw new Error('SESSION_CHANGED');
      if (active.current) setTexts(Object.fromEntries(loaded));
    } catch(e) { if (active.current) setError(e); } finally { if (active.current) setBusy(false); }
  };
  const ready = switches.seller && switches.bulk && switches.effects && !error && consent && instruments.length > 0 && instruments.length <= 50
    && instruments.every(i => i.status === 'prepared' && i.signing_required && i.license_selection.kind === 'standard'
      && !!texts[licenseDocumentPath('standard', i.license_selection.ai_training)] && !!texts[licenseDocumentPath('covenant')]);
  const sign = async (reauth?: string) => {
    if ((!ready && !reauth) || busy || done || !switches.effects) return;
    // A factor retry is permitted only for the retained displayed request.
    if (reauth && !request.current) return;
    setBusy(true); setError(null);
    try {
      request.current ??= { request_id: crypto.randomUUID(), csrf: nativeSession().csrf,
        instruments: instruments.map(i => ({ preparation_id: i.id, coverage_hash: i.coverage_hash, selection: i.license_selection })) };
      if (reauth) request.current.reauth_token = reauth;
      await signInstruments(request.current); if (active.current) setDone(true);
    } catch(e) { if (active.current) setError(e); } finally { if (active.current) setBusy(false); }
  };
  if (!switches.seller || !switches.bulk || !switches.effects) return null;
  return <section aria-label="Workspace batch licence signing" className="space-y-4 rounded-xl border bg-white p-6">
    <h2 className="text-xl font-semibold">Workspace step: Sign licences</h2>
    <p>Display and sign all selected instruments in one native session before a fresh action-batch review. Generic Confirm never signs licences.</p>
    <p>50 instruments maximum. Requests are never automatically split.</p>
    <label>Prepared instrument IDs (one per line)<textarea className="block w-full rounded border p-2" value={ids} disabled={busy} onChange={e => { setIds(e.target.value); setInstruments([]); setTexts({}); setConsent(false); setDone(false); setError(null); request.current = null; }} /></label>
    <button disabled={busy || !switches.effects} onClick={() => void load()}>Load complete licence batch</button>
    {instruments.map(i => <section key={i.id} aria-label={`Instrument ${i.id}`} className="space-y-3 border-t pt-4">
      <h3>Listing {i.binding.listing_id} · Version {i.binding.version_id}</h3>
      <p>Signer: {i.license_selection.seller_acceptance.signer_name} · {i.license_selection.seller_acceptance.signer_title}</p>
      <p>AI/ML training: {i.license_selection.ai_training ? 'Allowed' : 'Not allowed'}</p>
      <pre className="overflow-auto whitespace-pre-wrap">{JSON.stringify({ ...i.binding, status: i.status, coverage_hash: i.coverage_hash, selection: i.license_selection }, null, 2)}</pre>
      {i.license_selection.kind === 'custom' ? <p role="alert">The saved custom licence and rider cannot be fully displayed by this contract. Signing is disabled for the whole batch.</p> : <>
        <h4>Full licence</h4><pre className="max-h-96 overflow-auto whitespace-pre-wrap font-sans">{texts[licenseDocumentPath('standard', i.license_selection.ai_training)] ?? 'Full licence unavailable'}</pre>
        <h4>Marketplace Listing Covenant</h4><pre className="max-h-96 overflow-auto whitespace-pre-wrap font-sans">{texts[licenseDocumentPath('covenant')] ?? 'Covenant unavailable'}</pre>
      </>}
    </section>)}
    <label><input type="checkbox" checked={consent} disabled={busy || done || !instruments.length} onChange={e => setConsent(e.target.checked)} />I have read all {instruments.length} displayed licences, covenants and applicable riders. I confirm the covenant facts and that I am authorised to accept them for the seller.</label>
    <button disabled={!ready || busy || done} onClick={() => void sign()}>Sign {instruments.length} licences</button>
    {done && <p role="status">Licences signed. Nothing was published. Request a fresh connector snapshot with a new key, then review and Confirm the action batch separately.</p>}
    {!switches.effects && <p>Seller effects are off. Signing is unavailable.</p>}
    <NativeSellerAuth error={error} onRetry={() => { request.current = null; void load(); }} onToken={sign} />
  </section>;
}
