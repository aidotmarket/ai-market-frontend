'use client';
import { useEffect, useRef, useState } from 'react';
import { authSessionIdentity, useAuthStore } from '@/store/auth';
import { useSellerSwitches, sellerEffectsEnabled, type SellerSwitchReport } from '@/hooks/useSellerSwitches';
import { nativeClient, nativeSession } from '@/api/connector-seller-settings';
import { licenseHashesFor, licenseDocumentPath, isCurrentLicenseSelection } from '@/api/listingLicenses';
import { readSigningInstruments, signInstruments, type SigningInstrument, type SigningRequest, type PreparationView } from '@/api/seller-batch-signing';
import NativeSellerAuth from '@/components/NativeSellerAuth';

export default function WorkspaceBatchSigning({preparation,onSigned}:{preparation?: SigningInstrument;onSigned?:(rows:PreparationView[])=>void}) {
  const switches = useSellerSwitches(); const sessionIdentity = useAuthStore(authSessionIdentity);
  if (!sessionIdentity) return <p role="status">Licence signing is currently unavailable.</p>;
  const mode = switches?.profiles?.openai?.seller_mode;
  return <>
    {mode && <p>ChatGPT seller mode: {mode === 'full' ? 'Full' : mode === 'fallback' ? 'Limited mode' : 'Off'}.</p>}
    <BatchSigningScreen key={sessionIdentity} switches={switches ?? {seller:false,bulk:false,effects:false}} preparation={preparation} onSigned={onSigned} />
  </>;
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
        if (!isCurrentLicenseSelection(s)) throw new Error('LICENSE_ACCEPTANCE_STALE');
        // GET preparation returns selection/hash only, not saved custom text.
        // No undisplayed custom acceptance or fabricated text endpoint.
        if (s.kind !== 'standard' || s.license_sha256 !== licenseHashesFor(s.version).standard[String(s.ai_training) as 'true' | 'false'] || s.covenant_sha256 !== licenseHashesFor(s.covenant_version).covenant)
          throw new Error('FULL_INSTRUMENT_UNAVAILABLE');
        paths.add(licenseDocumentPath('standard', s.ai_training, s.version)); paths.add(licenseDocumentPath('covenant', undefined, s.covenant_version));
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
  const enabled = sellerEffectsEnabled(switches) && switches.bulk;
  // Revalidation may temporarily hide the screen, but must retain the displayed action.
  useEffect(() => {
    if (preparation && enabled && loadedPreparation.current !== preparation && !busy) {
      loadedPreparation.current = preparation;
      void load(preparation);
    }
  }, [preparation, enabled]);
  const ready = enabled && !error && consent && instruments.length > 0 && instruments.length <= 50
    && instruments.every(i => isCurrentLicenseSelection(i.license_selection) && i.status === 'prepared' && i.signing_required && i.license_selection.kind === 'standard'
      && !!texts[licenseDocumentPath('standard', i.license_selection.ai_training, i.license_selection.version)] && !!texts[licenseDocumentPath('covenant', undefined, i.license_selection.covenant_version)]);
  const detail = (error as {response?: {data?: {detail?: string | {code?: string}}}})?.response?.data?.detail;
  const stale = instruments.some(i => !isCurrentLicenseSelection(i.license_selection)) ||
    (error instanceof Error && error.message === 'LICENSE_ACCEPTANCE_STALE') ||
    (typeof detail === 'string' ? detail : detail?.code) === 'LICENSE_ACCEPTANCE_STALE';
  const sign = async () => {
    if (stale || !ready || busy || done) return;
    setBusy(true); setError(null);
    const controller = new AbortController(); action.current = controller;
    try {
      request.current ??= { request_id: crypto.randomUUID(), csrf: nativeSession().csrf,
        instruments: instruments.map(i => ({ preparation_id: i.id, coverage_hash: i.coverage_hash, selection: i.license_selection })) };
      request.current.csrf = nativeSession().csrf;
      const rows = await signInstruments(request.current, controller.signal); if (active.current) {setDone(true);onSigned?.(rows);}
    } catch(e) { if (active.current) setError(e); } finally { if (active.current) setBusy(false); }
  };
  const openai = switches.profiles?.openai;
  const openaiOnly = openai && !switches.profiles?.claude;
  if (!enabled) return <><p role="status">{openaiOnly && (openai.seller_mode === 'fallback' ? 'ChatGPT seller tools are in limited mode. ' : 'ChatGPT seller tools are paused. ')}Licence signing is currently unavailable.</p>{!!error&&<p role="alert">Licence signing could not be confirmed. Refresh and review again before signing.</p>}</>;
  return <section aria-label="Workspace batch licence signing" className="space-y-4 rounded-xl border bg-white p-6">
    <h2 className="text-xl font-semibold">Sign your licence</h2>
    <p>You’re signing the licence buyers will accept and the ai.market listing covenant for this listing. Read both below, tick the box, then sign. Nothing is published by signing.</p>
    {!preparation && <><label>Listing preparation IDs (one per line)<textarea className="block w-full rounded border p-2" value={ids} disabled={busy} onChange={e => { setIds(e.target.value); setInstruments([]); setTexts({}); setConsent(false); setDone(false); setError(null); request.current = null; }} /></label>
    <button type="button" className="rounded-lg bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-600" disabled={busy || !enabled} onClick={() => void load()}>Load licences</button></>}
    {(instruments.length > 50 || (!preparation && ids.split(/\s+/).filter(Boolean).length > 50)) && <p role="alert">You can sign up to 50 listings at once.</p>}
    {stale && <p role="alert">This saved licence choice is out of date. Go back to Choose a licence, choose the current licence and covenant, then prepare and sign again.</p>}
    {instruments.map((i, index) => <section key={i.id} aria-label={`Licence ${index + 1}`} className="space-y-3 border-t pt-4">
      <h3>{i.license_selection.kind === 'standard' ? 'Standard licence' : 'Custom licence'}</h3>
      <p>Signer: {i.license_selection.seller_acceptance.signer_name} · {i.license_selection.seller_acceptance.signer_title}</p>
      <p>AI/ML training: {i.license_selection.ai_training ? 'Allowed' : 'Not allowed'}</p>
      {i.license_selection.kind === 'custom' ? <p role="alert">The saved custom licence and rider cannot be fully displayed by this contract. Signing is disabled for the whole batch.</p> : <>
        <h4>Full licence (version {i.license_selection.version})</h4><pre className="max-h-96 overflow-auto whitespace-pre-wrap font-sans">{texts[licenseDocumentPath('standard', i.license_selection.ai_training, i.license_selection.version)] ?? 'Full licence unavailable'}</pre>
        <h4>Marketplace Listing Covenant (version {i.license_selection.covenant_version})</h4><pre className="max-h-96 overflow-auto whitespace-pre-wrap font-sans">{texts[licenseDocumentPath('covenant', undefined, i.license_selection.covenant_version)] ?? 'Covenant unavailable'}</pre>
      </>}
    </section>)}
    <label className="flex items-start gap-3"><input className="mt-1 h-4 w-4 shrink-0" type="checkbox" checked={consent} disabled={busy || done || stale || !instruments.length} onChange={e => setConsent(e.target.checked)} /><span>I have read {instruments.length > 1 ? `all ${instruments.length} licences and covenants` : 'the licence and covenant'} above, the covenant facts are true, and I am authorised to accept them for the seller.</span></label>
    <button type="button" className="block rounded-lg bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-600" disabled={!ready || busy || done} onClick={() => void sign()}>{instruments.length === 1 ? 'Sign licence' : `Sign ${instruments.length} licences`}</button>
    {!consent && !done && instruments.length > 0 && <p className="text-sm text-gray-600">Tick the box above to sign.</p>}
    {done && <p role="status">Licence signed. Your listing is not published yet. Go back to the review step and publish when ready.</p>}
    <NativeSellerAuth error={stale ? null : error} />
  </section>;
}
