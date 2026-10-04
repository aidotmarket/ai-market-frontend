'use client';

import { useEffect, useRef, useState } from 'react';
import {
  getGatewayVerificationEpoch, getGatewayVerificationProbe, gatewayVerificationLifecycle,
  probeGatewayVerification, startGatewayVerification, verificationErrorCopy, verificationRefusalCopy,
} from '@/api/dataVerificationGateway';
import { getDataVerificationPayInReadiness } from '@/api/dataVerificationPayin';
import DataVerificationPaymentMethod from '@/components/DataVerificationPaymentMethod';
import ScanFindingsBadge from './ScanFindingsBadge';
import type {
  GatewayVerificationAction, GatewayVerificationDescription, GatewayVerificationEpoch,
  GatewayVerificationProbe, GatewayVerificationProbeCommand, GatewayVerificationStartCommand,
} from '@/types';

interface Props {
  listingId: string;
  sellerId: string;
  onChanged?: () => void;
}
interface Attempt {
  probeCommand: GatewayVerificationProbeCommand;
  probeId?: string;
  probe?: GatewayVerificationProbe;
  startCommand?: GatewayVerificationStartCommand;
  epochId?: string;
}
const runningStates = new Set(['CREATED', 'QUOTED', 'AUTHORIZING', 'AUTHORIZED', 'SCANNING_LOCAL', 'NARRATING_CLOUD', 'CAPTURE_PENDING', 'CAPTURE_RECONCILING']);
const terminalStates = new Set(['DECLINED', 'WITHDRAWN', 'SUPERSEDED', 'AUTH_FAILED', 'CANCELLED_VOIDED', 'FAILED_VOIDED', 'CAPTURE_FAILED']);
const buttonClass = 'rounded-lg border border-indigo-600 px-4 py-2 font-medium text-indigo-700 disabled:opacity-50';
const choices = {
  domain_class: ['education_learning', 'software_technology', 'business_finance', 'health_life_sciences', 'public_social', 'physical_environment'],
  record_granularity: ['entity', 'event', 'measurement', 'document', 'relationship', 'aggregate'],
  temporal_scope: ['current_snapshot', 'historical_period', 'time_series', 'mixed_periods', 'not_time_based'],
  update_cadence: ['one_time', 'irregular', 'continuous', 'daily', 'weekly', 'monthly', 'quarterly', 'yearly'],
} as const;
const fieldLabels = { domain_class: 'Subject area', record_granularity: 'What each record describes', temporal_scope: 'Time covered', update_cadence: 'How often the data changes' };
const useChoices: GatewayVerificationDescription['intended_use_tags'] = ['analysis_reporting', 'research_education', 'machine_learning', 'benchmarking', 'reference_lookup', 'operations_planning'];
const limitationChoices: GatewayVerificationDescription['known_limitation_tags'] = ['incomplete_coverage', 'missing_values', 'estimated_fields', 'historical_cutoff', 'sampled_source', 'known_duplicates', 'source_defined_categories'];
const label = (value: string) => value.replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());

export default function GatewayVerificationFlow({ listingId, sellerId, onChanged }: Props) {
  const storageKey = `gateway-verification:${sellerId}:${listingId}`;
  const attempt = useRef<Attempt | null>(null);
  const lock = useRef(false);
  const mounted = useRef(false);
  const nextPollAt = useRef(0);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [probe, setProbe] = useState<GatewayVerificationProbe | null>(null);
  const [epoch, setEpoch] = useState<GatewayVerificationEpoch | null>(null);
  const [error, setError] = useState('');
  const [setup, setSetup] = useState(false);
  const [preview, setPreview] = useState(false);
  const [publicationAck, setPublicationAck] = useState(false);
  const [corpusAck, setCorpusAck] = useState(false);
  const [description, setDescription] = useState<Partial<GatewayVerificationDescription>>({ intended_use_tags: [], known_limitation_tags: [] });
  const [confirmAction, setConfirmAction] = useState<GatewayVerificationAction | null>(null);
  const [delay, setDelay] = useState(2);

  function save(value: Attempt) {
    // Persist before any authorization request, including when its response is lost.
    window.localStorage.setItem(storageKey, JSON.stringify(value));
    attempt.current = value;
  }
  async function run(operation: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try { await operation(); }
    catch (cause) { if (mounted.current) setError(verificationErrorCopy(cause)); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  useEffect(() => {
    mounted.current = true;
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        const parsed: Attempt = JSON.parse(stored);
        if (!parsed.probeCommand || typeof parsed.probeCommand.idempotency_key !== 'string') throw new Error('Invalid saved attempt');
        attempt.current = parsed;
        setPreview(parsed.probeCommand.preview_requested);
        setProbe(parsed.probeId ? { probe_id: parsed.probeId, state: 'queued' } : null);
        if (parsed.startCommand) setDescription(parsed.startCommand.d6_description);
      }
      setReady(true);
    } catch {
      setError('We could not restore your verification request. Please contact support before starting again.');
    }
    return () => { mounted.current = false; };
  }, [storageKey]);

  async function checkStatus() {
    const saved = attempt.current;
    if (!saved) return;
    if (saved.epochId) {
      const response = await getGatewayVerificationEpoch(listingId, saved.epochId);
      if (!mounted.current) return;
      setEpoch(response.data);
      nextPollAt.current = Date.now() + response.retryAfter * 1000;
      setDelay(response.retryAfter);
    } else if (saved.probeId) {
      const response = await getGatewayVerificationProbe(listingId, saved.probeId);
      if (!mounted.current) return;
      save({ ...saved, probe: response.data });
      setProbe(response.data);
      nextPollAt.current = Date.now() + response.retryAfter * 1000;
      setDelay(response.retryAfter);
    }
  }
  useEffect(() => {
    if (!ready) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (stopped) return;
      if (!lock.current) {
        try { await checkStatus(); }
        catch (cause) { if (!stopped) { setError(verificationErrorCopy(cause)); return; } }
      }
      if (!stopped) timer = setTimeout(() => void poll(), delay * 1000);
    }
    if (attempt.current?.epochId || attempt.current?.probeId) {
      const pending = epoch ? runningStates.has(epoch.state) : !probe || probe.state === 'queued';
      if (pending) timer = setTimeout(() => void poll(), Math.max(0, nextPollAt.current - Date.now()));
    }
    return () => { stopped = true; clearTimeout(timer); };
    // Status changes reschedule the read-only polling loop.
  }, [ready, probe?.state, epoch?.state, delay, storageKey]);

  function checkData() {
    void run(async () => {
      const saved = attempt.current ?? { probeCommand: { confirm: true as const, preview_requested: preview, idempotency_key: crypto.randomUUID() } };
      save(saved);
      const response = await probeGatewayVerification(listingId, saved.probeCommand);
      if (!mounted.current) return;
      // Even a POST reporting complete needs GET to retrieve its quote/refusal.
      save({ ...saved, probeId: response.data.probe_id });
      setProbe({ probe_id: response.data.probe_id, state: 'queued' });
      nextPollAt.current = Date.now() + response.retryAfter * 1000;
      setDelay(response.retryAfter);
    });
  }
  function paidStart() {
    void run(async () => {
      const stored = window.localStorage.getItem(storageKey);
      const saved: Attempt | null = stored ? JSON.parse(stored) : attempt.current;
      attempt.current = saved;
      if (!saved || !probe?.quote_id || !publicationAck || !corpusAck) return;
      if (saved.epochId) { await checkStatus(); return; }
      const command: GatewayVerificationStartCommand = saved.startCommand ?? {
        quote_id: probe.quote_id, idempotency_key: crypto.randomUUID(),
        d6_description: description as GatewayVerificationDescription,
        preview_requested: saved.probeCommand.preview_requested,
        publication_terms_acknowledged: true, corpus_consent_acknowledged: true,
      };
      save({ ...saved, startCommand: command });
      const readiness = await getDataVerificationPayInReadiness();
      if (!mounted.current) return;
      if (readiness.state === 'setup_required' || readiness.state === 'setup_pending') { setSetup(true); return; }
      if (readiness.state !== 'ready') { setError('Your payment method is not ready. Please try again later.'); return; }
      const response = await startGatewayVerification(listingId, command);
      if (!mounted.current) return;
      save({ ...attempt.current!, epochId: response.data.verification_id });
      await checkStatus();
    });
  }
  function lifecycle(action: GatewayVerificationAction) {
    void run(async () => {
      if (!epoch || epoch.listing_id !== listingId || !epoch.source_handle_id) return;
      const response = await gatewayVerificationLifecycle(listingId, {
        verification_id: epoch.verification_id, listing_id: epoch.listing_id,
        source_handle_id: epoch.source_handle_id, requested_action: action, confirm: true,
      });
      if (!mounted.current) return;
      setEpoch(response.data);
      await checkStatus();
      setConfirmAction(null);
      onChanged?.();
    });
  }
  function newAttempt() {
    window.localStorage.removeItem(storageKey);
    attempt.current = null;
    setProbe(null); setEpoch(null); setPublicationAck(false); setCorpusAck(false); setConfirmAction(null); setError('');
  }
  const completeDescription = Object.keys(choices).every(key => description[key as keyof typeof choices]);
  const fullReview = epoch?.findings?.epoch_id === epoch?.verification_id && epoch?.findings?.listing_id === listingId ? epoch.findings : null;
  const hasBinding = epoch?.listing_id === listingId && !!epoch.source_handle_id;
  const canReview = epoch?.state === 'CAPTURED' && epoch.publication_allowed && fullReview && hasBinding;
  const canNewAttempt = (!attempt.current?.startCommand && !!probe && probe.state !== 'queued') || (epoch && (terminalStates.has(epoch.state) || epoch.state === 'PUBLISHED'));
  return <section className="space-y-5 rounded-xl border border-gray-200 bg-white p-6" aria-labelledby="gateway-verification-heading">
    <h2 id="gateway-verification-heading" className="text-xl font-semibold">{probe?.state === 'complete' && probe.quote_id ? 'Verify this data' : epoch ? 'Data verification' : 'Check verification availability'}</h2>
    <p>Check your data in your own gateway, then review a quote. The check and quote are free and do not need a card. Data values stay in your gateway.</p>
    {error && <p role="alert">{error}</p>}
    {!probe && !epoch && <>
      <label className="block"><input type="checkbox" checked={preview} disabled={busy || !!attempt.current} onChange={e => setPreview(e.target.checked)} /> Include column names and row counts in the findings</label>
      <button className={buttonClass} disabled={!ready || busy} onClick={checkData}>{busy ? 'Checking…' : 'Check data and get quote'}</button>
    </>}
    {probe?.state === 'queued' && <p role="status">Waiting for your gateway to check the data. No charge has been made.</p>}
    {probe?.state === 'refused' && <p role="alert">{verificationRefusalCopy(probe.refusal)}</p>}
    {probe?.state === 'complete' && probe.quote_id && probe.maximum_hold_usd && !epoch && !setup && <>
      <h3 className="font-semibold">Your verification quote</h3>
      <p>A temporary hold of up to ${probe.maximum_hold_usd} will be placed on your card. The final charge is twice the cost of preparing the written findings, between $1 and $25. You pay for completed findings whether you publish or decline them. If verification fails before completion, the hold is released.</p>
      <p>Verification covers the complete supported data for this listing version. It does not assess accuracy, legality, or fitness for a purpose. Your gateway runs ai.market’s open-source scanner in an environment you control.</p>
      <fieldset disabled={busy || !!attempt.current?.startCommand} className="space-y-3">
        <legend className="font-semibold">Describe your data</legend>
        {(Object.keys(choices) as Array<keyof typeof choices>).map(key => <label key={key} className="block">{fieldLabels[key]}<select className="ml-3 rounded border p-2" value={description[key] ?? ''} onChange={e => setDescription(current => ({ ...current, [key]: e.target.value }))}>
          <option value="">Choose one</option>{choices[key].map(value => <option key={value} value={value}>{label(value)}</option>)}
        </select></label>)}
        {(['intended_use_tags', 'known_limitation_tags'] as const).map(key => <fieldset key={key}><legend>{key === 'intended_use_tags' ? 'Intended uses (choose up to five)' : 'Known limitations (choose up to five)'}</legend>
          {(key === 'intended_use_tags' ? useChoices : limitationChoices).map(value => <label key={value} className="mr-4 inline-block"><input type="checkbox" checked={(description[key] as string[]).includes(value)} disabled={(description[key]?.length ?? 0) >= 5 && !(description[key] as string[]).includes(value)} onChange={e => setDescription(current => ({ ...current, [key]: e.target.checked ? [...current[key]!, value].sort() : current[key]!.filter(tag => tag !== value) }))} /> {label(value)}</label>)}
        </fieldset>)}
      </fieldset>
      <label className="block"><input type="checkbox" checked={publicationAck} onChange={e => setPublicationAck(e.target.checked)} /> I understand the charge and that I can publish all findings unedited or decline publication after reviewing them.</label>
      <label className="block"><input type="checkbox" checked={corpusAck} onChange={e => setCorpusAck(e.target.checked)} /> I agree that the verification record and approved aggregate findings will be retained in ai.market’s verification records, including if I decline publication.</label>
      <button className={buttonClass} disabled={busy || !publicationAck || !corpusAck || !completeDescription} onClick={paidStart}>Start paid verification</button>
    </>}
    {setup && <><DataVerificationPaymentMethod returnToListing={{ listingId, sellerId }} /><button className={buttonClass} onClick={() => setSetup(false)}>Back to verification</button><p>After adding your card, return here and choose Start paid verification to continue.</p></>}
    {epoch && <>
      {runningStates.has(epoch.state) && <p role="status">{epoch.reconciliation_required ? 'We are confirming your payment. Please wait before starting again.' : 'Verification is in progress. You can return to this page to check it.'}</p>}
      {epoch.state === 'CAPTURED' && <>
        <h3 className="font-semibold">Review your findings</h3><p>These findings are private. Buyers can see them only if you publish them.</p><p>Charged: ${epoch.captured_usd}</p>
        {fullReview ? <ScanFindingsBadge scanFindings={fullReview} /> : <p>The complete findings are not available to review yet. Please check again before deciding whether to publish.</p>}
        <div className="flex gap-3"><button className={buttonClass} disabled={busy || !canReview} onClick={() => setConfirmAction('publish')}>Publish all findings</button><button className={buttonClass} disabled={busy || !canReview} onClick={() => setConfirmAction('decline')}>Decline publication</button></div>
      </>}
      {epoch.state === 'PUBLISHED' && <><p>These findings are published. Publishing a new verification will replace the previous findings.</p><button className={buttonClass} disabled={busy || !hasBinding} onClick={() => setConfirmAction('withdraw')}>Withdraw findings</button></>}
      {epoch.state === 'SUPERSEDED' && <p>These findings were replaced by a newer published verification.</p>}
      {epoch.state === 'WITHDRAWN' && <p>These findings have been withdrawn.</p>}
      {epoch.state === 'DECLINED' && <p>You declined publication. The completed verification charge is unchanged.</p>}
      {['FAILED_VOIDED', 'CANCELLED_VOIDED'].includes(epoch.state) && <p>Verification ended and the temporary hold was released. No completed verification charge was made.</p>}
      {['AUTH_FAILED', 'CAPTURE_FAILED'].includes(epoch.state) && <p>The payment could not be completed. Please check your payment status before starting again.</p>}
      {['AUTHORIZED', 'SCANNING_LOCAL'].includes(epoch.state) && <button className={buttonClass} disabled={busy || !hasBinding} onClick={() => setConfirmAction('cancel')}>Cancel verification</button>}
    </>}
    {confirmAction && <div role="group" aria-label="Confirm your decision"><p>{confirmAction === 'publish' ? 'Publish the complete findings unedited? This replaces any previous published findings.' : confirmAction === 'decline' ? 'Decline publication? The completed verification charge is unchanged.' : confirmAction === 'withdraw' ? 'Withdraw these findings from the public listing?' : 'Cancel verification and release any unsettled hold?'}</p><button className={buttonClass} disabled={busy} onClick={() => lifecycle(confirmAction)}>Confirm {confirmAction === 'publish' ? 'publication' : confirmAction === 'decline' ? 'decline' : confirmAction === 'withdraw' ? 'withdrawal' : 'cancellation'}</button><button className={buttonClass} disabled={busy} onClick={() => setConfirmAction(null)}>Keep reviewing</button></div>}
    {attempt.current && <button className={buttonClass} disabled={busy} onClick={() => void run(checkStatus)}>Check again</button>}
    {ready && canNewAttempt && <button className={buttonClass} disabled={busy} onClick={newAttempt}>Get a new quote</button>}
  </section>;
}
