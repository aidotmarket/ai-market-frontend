'use client';
import { useEffect, useRef, useState } from 'react';
import { authSessionIdentity, useAuthStore } from '@/store/auth';
import { useSellerSwitches, type SellerSwitchReport } from '@/hooks/useSellerSwitches';
import { nativeClient, nativeSession } from '@/api/connector-seller-settings';
import { LICENSE_HASHES, licenseDocumentPath } from '@/api/listingLicenses';
import { readSigningInstruments, signInstruments, type SigningInstrument, type SigningRequest, type PreparationView } from '@/api/seller-batch-signing';
import NativeSellerAuth from '@/components/NativeSellerAuth';

export default function WorkspaceBatchSigning({preparation,onSigned}:{preparation?: SigningInstrument;onSigned?:(rows:PreparationView[])=>void}) {
  const switches = useSellerSwitches(); const sessionIdentity = useAuthStore(authSessionIdentity);
  if (!sessionIdentity) return <p role="status">Licence signing is currently unavailable.</p>;
  return <BatchSigningScreen key={sessionIdentity} switches={switches ?? {seller:false,bulk:false,effects:false}} preparation={preparation} onSigned={onSigned} />;
}
export function BatchSigningScreen({ switches, preparation, onSigned }: { switches: SellerSwitchReport; preparation?: SigningInstrument; onSigned?:(rows:PreparationView[])=>void }) {
  const [ids, setIds] = useState(''); const [instruments, setInstruments] = useState<SigningInstrument[]>([]);
  const [texts, setTexts] = useState<Record<string, string>>({}); const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null); const [done, setDone] = useState(false);
  const request = useRef<SigningRequest | null>(null); const active = useRef(true);
  const action = useRef<AbortController | null>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; action.current?.abort(); }; }, []);
  const load = async (preloaded?: SigningInstrument) => {
    if (busy) return;
    setBusy(true); setError(null); setInstruments([]); setTexts({}); setConsent(false); setDone(false); request.current = null;
    try {
      const rows = preloaded ? [preloaded] : await readSigningInstruments(ids.split(/\s+/).filter(Boolean));
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
  const loadedPreparation = useRef<SigningInstrument | null>(null);
  const enabled = switches.seller && switches.bulk && switches.effects;
  // Revalidation may temporarily hide the screen, but must retain the displayed action.
  useEffect(() => {
    if (preparation && enabled && loadedPreparation.current !== preparation && !busy) {
      loadedPreparation.current = preparation;
      void load(preparation);
    }
  }, [preparation, enabled]);
  const ready = switches.seller && switches.bulk && switches.effects && !error && consent && instruments.length > 0 && instruments.length <= 50
    && instruments.every(i => i.status === 'prepared' && i.signing_required && i.license_selection.kind === 'standard'
      && !!texts[licenseDocumentPath('standard', i.license_selection.ai_training)] && !!texts[licenseDocumentPath('covenant')]);
  const sign = async (reauth?: string) => {
    if ((!ready && !reauth) || busy || done || !switches.effects) return;
    // A factor retry is permitted only for the retained displayed request.
    if (reauth && !request.current) return;
    setBusy(true); setError(null);
    const controller = new AbortController(); action.current = controller;
    try {
      request.current ??= { request_id: crypto.randomUUID(), csrf: nativeSession().csrf,
        instruments: instruments.map(i => ({ preparation_id: i.id, coverage_hash: i.coverage_hash, selection: i.license_selection })) };
      if (reauth) request.current.reauth_token = reauth;
      request.current.csrf = nativeSession().csrf;
      const rows = await signInstruments(request.current, controller.signal); if (active.current) {setDone(true);onSigned?.(rows);}
    } catch(e) { if (active.current) setError(e); } finally { if (active.current) setBusy(false); }
  };
  if (!enabled) return <><p role="status">Licence signing is currently unavailable.</p>{!!error&&<p role="alert">Licence signing could not be confirmed. Refresh and review again before signing.</p>}</>;
  return <section aria-label="Workspace batch licence signing" className="space-y-4 rounded-xl border bg-white p-6">
    <h2 className="text-xl font-semibold">Sign your licence</h2>
    <p>You’re signing the licence buyers will accept and the ai.market listing covenant for this listing. Read both below, tick the box, then sign. Nothing is published by signing.</p>
    {!preparation && <><label>Listing preparation IDs (one per line)<textarea className="block w-full rounded border p-2" value={ids} disabled={busy} onChange={e => { setIds(e.target.value); setInstruments([]); setTexts({}); setConsent(false); setDone(false); setError(null); request.current = null; }} /></label>
    <button disabled={busy || !switches.effects} onClick={() => void load()}>Load licences</button></>}
    {(instruments.length > 50 || (!preparation && ids.split(/\s+/).filter(Boolean).length > 50)) && <p role="alert">You can sign up to 50 listings at once.</p>}
    {instruments.map((i, index) => <section key={i.id} aria-label={`Licence ${index + 1}`} className="space-y-3 border-t pt-4">
      <h3>{i.license_selection.kind === 'standard' ? 'Standard licence' : 'Custom licence'}</h3>
      <p>Signer: {i.license_selection.seller_acceptance.signer_name} · {i.license_selection.seller_acceptance.signer_title}</p>
      <p>AI/ML training: {i.license_selection.ai_training ? 'Allowed' : 'Not allowed'}</p>
      {i.license_selection.kind === 'custom' ? <p role="alert">The saved custom licence and rider cannot be fully displayed by this contract. Signing is disabled for the whole batch.</p> : <>
        <h4>Full licence</h4><pre className="max-h-96 overflow-auto whitespace-pre-wrap font-sans">{texts[licenseDocumentPath('standard', i.license_selection.ai_training)] ?? 'Full licence unavailable'}</pre>
        <h4>Marketplace Listing Covenant</h4><pre className="max-h-96 overflow-auto whitespace-pre-wrap font-sans">{texts[licenseDocumentPath('covenant')] ?? 'Covenant unavailable'}</pre>
      </>}
    </section>)}
    <label><input type="checkbox" checked={consent} disabled={busy || done || !instruments.length} onChange={e => setConsent(e.target.checked)} />I have read {instruments.length > 1 ? `all ${instruments.length} licences and covenants` : 'the licence and covenant'} above, the covenant facts are true, and I am authorised to accept them for the seller.</label>
    <button disabled={!ready || busy || done} onClick={() => void sign()}>{instruments.length === 1 ? 'Sign licence' : `Sign ${instruments.length} licences`}</button>
    {done && <p role="status">Licence signed. Your listing is not published yet. Go back to the review step and publish when ready.</p>}
    {!switches.effects && <p>Seller effects are off. Signing is unavailable.</p>}
    <NativeSellerAuth error={error} onRetry={() => { request.current = null; void load(preparation); }} onToken={sign} />
  </section>;
}
