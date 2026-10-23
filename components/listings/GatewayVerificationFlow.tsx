'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  getGatewayVerificationEpoch, getGatewayVerificationProbe, gatewayVerificationLifecycle, gatewayVerificationError,
  probeGatewayVerification, startGatewayVerification, verificationErrorCopy, verificationRefusalCopy,
  getAwsVerifierStatus, setupAwsVerifier, removeVerificationRunner,
  getCloudflareVerifierStatus,
  type CloudflareVerifierStatus, type AWSVerifierStatus,
} from '@/api/dataVerificationGateway';
import { getDataVerificationPayInReadiness } from '@/api/dataVerificationPayin';
import DataVerificationPaymentMethod from '@/components/DataVerificationPaymentMethod';
import ScanFindingsBadge from './ScanFindingsBadge';
import { useCloudflareInstaller } from './CloudflareInstaller';
import { primaryButtonClass, secondaryButtonClass, dangerSecondaryButtonClass, buttonRowClass, buttonSpinnerClass } from '@/components/ui/button-styles';
import type {
  GatewayVerificationAction, GatewayVerificationDescription, GatewayVerificationEpoch,
  GatewayVerificationProbe, GatewayVerificationProbeCommand, GatewayVerificationStartCommand,
} from '@/types';

interface Props {
  listingId: string;
  sellerId: string;
  verifier?: { kind: 'cloudflare'; connectionId: string } | { kind: 'aws'; connectionId: string } | { kind: 'gateway'; runnerId?: string };
  onChanged?: () => void;
}
interface Attempt {
  probeCommand: GatewayVerificationProbeCommand;
  probeId?: string;
  probe?: GatewayVerificationProbe;
  startCommand?: GatewayVerificationStartCommand;
  epochId?: string;
  quoteRefused?: boolean;
}
const runningStates = new Set(['CREATED', 'QUOTED', 'AUTHORIZING', 'AUTHORIZED', 'SCANNING_LOCAL', 'NARRATING_CLOUD', 'CAPTURE_PENDING', 'CAPTURE_RECONCILING']);
const progressSteps = [
  { label: 'Payment hold', states: ['CREATED', 'QUOTED', 'AUTHORIZING'] },
  { label: 'Scanning your data', states: ['AUTHORIZED', 'SCANNING_LOCAL'] },
  { label: 'Writing findings', states: ['NARRATING_CLOUD'] },
  { label: 'Finalising charge', states: ['CAPTURE_PENDING', 'CAPTURE_RECONCILING'] },
  { label: 'Ready to review', states: ['CAPTURED', 'PUBLISHED', 'DECLINED', 'WITHDRAWN', 'SUPERSEDED'] },
];
const terminalStates = new Set(['DECLINED', 'WITHDRAWN', 'SUPERSEDED', 'AUTH_FAILED', 'CANCELLED_VOIDED', 'FAILED_VOIDED', 'CAPTURE_FAILED']);
const choices = {
  domain_class: ['education_learning', 'software_technology', 'business_finance', 'health_life_sciences', 'public_social', 'physical_environment'],
  record_granularity: ['entity', 'event', 'measurement', 'document', 'relationship', 'aggregate'],
  temporal_scope: ['current_snapshot', 'historical_period', 'time_series', 'mixed_periods', 'not_time_based'],
  update_cadence: ['one_time', 'irregular', 'continuous', 'daily', 'weekly', 'monthly', 'quarterly', 'yearly'],
} as const;
const fieldLabels = { domain_class: 'Subject area', record_granularity: 'What each record describes', temporal_scope: 'Time covered', update_cadence: 'How often the data changes' };
const useChoices: GatewayVerificationDescription['intended_use_tags'] = ['analysis_reporting', 'research_education', 'machine_learning', 'benchmarking', 'reference_lookup', 'operations_planning'];
const limitationChoices: GatewayVerificationDescription['known_limitation_tags'] = ['incomplete_coverage', 'missing_values', 'estimated_fields', 'historical_cutoff', 'sampled_source', 'known_duplicates', 'source_defined_categories'];
const displayLabels: Record<string, string> = {
  entity: 'A person, organization, or item', event: 'An event or activity',
  measurement: 'A measurement or observation', document: 'A document or text',
  relationship: 'A relationship between items', aggregate: 'A summary of multiple records',
  source_defined_categories: 'Categories defined by the data source',
};
const label = (value: string) => displayLabels[value] ?? value.replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());

export const AWS_COST_DISCLOSURE = 'Runs in your AWS account; typical cost about one cent per scan plus a small monthly amount. The strict network option costs more. The free probe also runs a scan in your AWS account; AWS charges are separate from the ai.market verification fee.';

export const CLOUDFLARE_COST_DISCLOSURE = 'Runs in your Cloudflare account. Workers Paid has a $5/month base subscription; container time, Worker/Durable Object usage and R2 read operations may add costs. R2 has no egress fee; Infrequent Access data retrieval can cost extra. The free probe also runs a complete scan. Cloudflare charges are separate from the ai.market verification fee.';
export const CLOUDFLARE_REMOVE_COPY = 'This stops new verification work. Delete the verifier Worker, Container deployment and Durable Object state in your Cloudflare account to stop its resource costs. Your R2 data and marketplace delivery remain unchanged.';
export const CLOUDFLARE_RUN_NOW_COPY = "Waiting for the verifier's first check. This usually completes within a few minutes.";

export default function GatewayVerificationFlow({ listingId, sellerId, verifier, onChanged }: Props) {
  const aws = verifier?.kind === 'aws';
  const cloudflare = verifier?.kind === 'cloudflare';
  const cloud = aws || cloudflare;
  // Recovery uses this browser’s localStorage only. Clearing it or switching
  // browsers loses the attempt/epoch ID; this contract cannot discover it again.
  const storageKey = `gateway-verification:${sellerId}:${listingId}`;
  const attempt = useRef<Attempt | null>(null);
  const lock = useRef(false);
  // Presentation only; the existing busy flag still controls every request.
  const busyPrimary = useRef(false);
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
  const [opened, setOpened] = useState(!cloud);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const findingsRef = useRef<HTMLHeadingElement>(null);
  const previousEpoch = useRef<GatewayVerificationEpoch | null>(null);
  const focusedFindings = useRef(false);
  const [paying, setPaying] = useState(false);
  const [cloudflareStatus, setCloudflareStatus] = useState<CloudflareVerifierStatus | null>(null);
  const [awsStatus, setAwsStatus] = useState<AWSVerifierStatus | null>(null);
  const [statusFresh, setStatusFresh] = useState(false);
  const [verifierDecision, setVerifierDecision] = useState<'setup' | 'replace' | 'remove' | null>(null);
  const statusRead = useRef(0);
  const verifierStatus = cloudflare ? cloudflareStatus : awsStatus;
  const runnerId = cloudflare ? cloudflareStatus?.runner_id : aws ? awsStatus?.runner_id : verifier?.kind === 'gateway' ? verifier.runnerId : undefined;
  const installer = useCloudflareInstaller(listingId, sellerId, verifier?.kind === 'cloudflare' ? verifier.connectionId : undefined, cloudflareStatus, statusFresh, !probe && !epoch && !attempt.current?.epochId);
  useEffect(() => { if (installer.resumed) setOpened(true); }, [installer.resumed]);

  async function readVerifierStatus() {
    const read = ++statusRead.current;
    try {
      if (cloudflare) {
        const status = await getCloudflareVerifierStatus(listingId);
        if (mounted.current && read === statusRead.current) { setCloudflareStatus(status); setStatusFresh(true); }
      } else {
        const status = await getAwsVerifierStatus(listingId);
        if (mounted.current && read === statusRead.current) { setAwsStatus(status); setStatusFresh(true); }
      }
    } catch (cause) {
      if (mounted.current && read === statusRead.current) setStatusFresh(false);
      throw cause;
    }
  }
  useEffect(() => {
    if (!cloud || !opened) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let first = true;
    async function poll() {
      // Always read once on open, even in a background tab, so the status never sticks at "Checking".
      if (first || document.visibilityState !== 'hidden') {
        first = false;
        try { await readVerifierStatus(); }
        catch (cause) { if (!stopped) setError(verificationErrorCopy(cause, verifier?.kind)); }
      }
      // Setup/registration is minute-scale. Avoid background-tab traffic and
      // keep all reads sequential, including after a transient failure.
      if (!stopped) timer = setTimeout(() => void poll(), 30000);
    }
    void poll();
    return () => { stopped = true; statusRead.current++; clearTimeout(timer); };
  }, [cloud, cloudflare, opened, listingId, sellerId]);

  function confirmVerifierDecision() {
    if (verifierDecision === 'remove') {
      void run(async () => {
        if (!runnerId) return;
        statusRead.current++;
        setStatusFresh(false);
        await removeVerificationRunner(runnerId);
        if (!mounted.current) return;
        setVerifierDecision(null);
        if (cloud) { setStatusFresh(false); await readVerifierStatus(); }
        await checkStatus();
        onChanged?.();
      });
      return;
    }
    if (verifier?.kind !== 'aws' || (verifierDecision === 'replace' && !runnerId)) return;
    // Open during the user gesture so the console survives popup blockers.
    const consoleTab = window.open('about:blank', '_blank');
    if (!consoleTab) { setError('Allow a new tab for the AWS console, then try again.'); return; }
    consoleTab.opener = null;
    void run(async () => {
      try {
        const result = await setupAwsVerifier(verifierDecision === 'replace' && runnerId
          ? { connection_id: verifier.connectionId, replace_runner_id: runnerId, confirm_replace: true }
          : { connection_id: verifier.connectionId });
        if (!mounted.current) { consoleTab.close(); return; }
        consoleTab.location.replace(result.quick_create_url);
        setVerifierDecision(null);
        setStatusFresh(false);
        await readVerifierStatus();
      } catch (cause) {
        consoleTab.close();
        if (gatewayVerificationError(cause).code === 'replacement_confirmation_required') {
          await readVerifierStatus();
          if (mounted.current) setVerifierDecision('replace');
        }
        throw cause;
      }
    });
  }

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
    catch (cause) { if (mounted.current) setError(verificationErrorCopy(cause, verifier?.kind)); }
    finally { lock.current = false; busyPrimary.current = false; if (mounted.current) setBusy(false); }
  }
  useEffect(() => {
    mounted.current = true;
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        const parsed: Attempt = JSON.parse(stored);
        if (!parsed.probeCommand || typeof parsed.probeCommand.idempotency_key !== 'string') throw new Error('Invalid saved attempt');
        attempt.current = parsed;
        if (parsed.probeId || parsed.epochId) setOpened(true);
        setPreview(parsed.quoteRefused ? false : parsed.probeCommand.preview_requested);
        setProbe(!parsed.epochId && parsed.probeId ? { probe_id: parsed.probeId, state: 'queued' } : null);
        if (parsed.startCommand) setDescription(parsed.startCommand.d6_description);
      }
      setReady(true);
    } catch {
      setError('We could not restore your verification request. Please contact support before starting again.');
    }
    return () => { mounted.current = false; };
  }, [storageKey]);

  useEffect(() => {
    // The panel is long; bring a new error into view next to where the seller is.
    if (!error) return;
    errorRef.current?.scrollIntoView?.({ block: 'center' });
    errorRef.current?.focus?.();
  }, [error]);

  useEffect(() => {
    const previous = previousEpoch.current;
    previousEpoch.current = epoch;
    if (focusedFindings.current || epoch?.state !== 'CAPTURED' || previous?.verification_id !== epoch.verification_id || !runningStates.has(previous.state)) return;
    focusedFindings.current = true;
    findingsRef.current?.scrollIntoView?.({ block: 'start' });
    findingsRef.current?.focus?.();
  }, [epoch]);

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
        catch (cause) { if (!stopped) { setError(verificationErrorCopy(cause, verifier?.kind)); return; } }
      }
      if (!stopped) timer = setTimeout(() => void poll(), delay * 1000);
    }
    if (attempt.current?.epochId || attempt.current?.probeId) {
      const pending = epoch ? runningStates.has(epoch.state) || epoch.reconciliation_required : !probe || probe.state === 'queued';
      if (pending) timer = setTimeout(() => void poll(), Math.max(0, nextPollAt.current - Date.now()));
    }
    return () => { stopped = true; clearTimeout(timer); };
    // Status changes reschedule the read-only polling loop.
  }, [ready, probe?.state, epoch?.state, epoch?.reconciliation_required, delay, storageKey]);

  function checkData() {
    if (cloud && (!statusFresh || (cloudflare && !verifierStatus?.eligible) || verifierStatus?.state !== 'ready')) return;
    busyPrimary.current = true;
    void run(async () => {
      if (attempt.current?.epochId) { await checkStatus(); return; }
      const saved = (attempt.current?.quoteRefused ? null : attempt.current) ?? { probeCommand: { confirm: true as const, preview_requested: preview, idempotency_key: crypto.randomUUID() } };
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
    if (!completeDescription) return;
    setPaying(true);
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
      let readiness;
      try { readiness = await getDataVerificationPayInReadiness(); }
      catch (cause) {
        if (gatewayVerificationError(cause).status === 404) {
          if (mounted.current) setError('Card setup for this paid service is unavailable for your account. Contact support if you think this is wrong.');
          return;
        }
        throw cause;
      }
      if (!mounted.current) return;
      if (readiness.state === 'setup_required' || readiness.state === 'setup_pending') { setSetup(true); return; }
      if (readiness.state !== 'ready') { setError('Your payment method is not ready. Please try again later.'); return; }
      let response;
      try { response = await startGatewayVerification(listingId, command); }
      catch (cause) {
        const refusal = gatewayVerificationError(cause);
        if (refusal.status === 409 && refusal.code === 'verification_in_progress' && refusal.epochId) {
          // Persist recovery before GET: even a lost status response must not
          // allow this listing to start a second paid command.
          save({ ...attempt.current!, epochId: refusal.epochId });
          setProbe(null); setSetup(false);
          await checkStatus();
          return;
        }
        if (refusal.status === 409 && (refusal.code === 'quote_binding_or_expiry' || refusal.code === 'source_changed')) {
          // Backend guarantees no matching or unresolved epoch. Uncertain outcomes
          // retain the original command and key for an idempotent retry.
          save({ probeCommand: saved.probeCommand, quoteRefused: true });
          resetAttemptFields();
        }
        throw cause;
      }
      if (!mounted.current) return;
      save({ ...attempt.current!, epochId: response.data.verification_id });
      await checkStatus();
    }).finally(() => { if (mounted.current) setPaying(false); });
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
  function resetAttemptFields() {
    setDescription({ intended_use_tags: [], known_limitation_tags: [] });
    setPreview(false); setSetup(false);
    setProbe(null); setEpoch(null); setPublicationAck(false); setCorpusAck(false); setConfirmAction(null); setError('');
  }
  function newAttempt() {
    window.localStorage.removeItem(storageKey);
    attempt.current = null;
    resetAttemptFields();
  }
  const completeDescription = Object.keys(choices).every(key => description[key as keyof typeof choices]);
  const fullReview = epoch?.findings?.epoch_id === epoch?.verification_id && epoch?.findings?.listing_id === listingId ? epoch.findings : null;
  const hasBinding = epoch?.listing_id === listingId && !!epoch.source_handle_id;
  const canReview = epoch?.state === 'CAPTURED' && epoch.publication_allowed && fullReview && hasBinding;
  const canNewAttempt = (!attempt.current?.epochId && !attempt.current?.startCommand && !!probe && probe.state !== 'queued') || (epoch && !epoch.reconciliation_required && (terminalStates.has(epoch.state) || epoch.state === 'PUBLISHED'));
  const checking = busy && (busyPrimary.current || paying) || probe?.state === 'queued' || !!attempt.current?.epochId && !epoch || !!epoch && (runningStates.has(epoch.state) || epoch.reconciliation_required);
  const quoteExpired = !!attempt.current?.quoteRefused && !probe && !epoch && !attempt.current?.probeId && !attempt.current?.epochId;
  const progressStep = progressSteps.findIndex(step => step.states.includes(epoch?.state ?? '')) + 1;
  const statusLabel = checking ? 'Checking' : epoch ? epoch.state === 'CAPTURED' ? 'Ready to review' : epoch.state === 'PUBLISHED' ? 'Published' : ['AUTH_FAILED', 'CAPTURE_FAILED', 'FAILED_VOIDED'].includes(epoch.state) ? 'Unavailable' : 'Completed'
    : quoteExpired ? 'Quote expired' : probe?.state === 'complete' && probe.quote_id ? 'Quote ready' : error || probe?.state === 'refused' ? 'Unavailable'
    : installer.active || installer.hasPrimaryAction ? installer.statusLabel : !ready || (cloud && !statusFresh) ? 'Checking'
    : cloud && verifierStatus?.state === 'waiting' ? 'Installing' : cloud && (verifierStatus?.state !== 'ready' || (cloudflare && !verifierStatus?.eligible)) ? 'Unavailable' : 'Ready';
  const statusClass = statusLabel === 'Unavailable' || statusLabel === 'Needs attention' || statusLabel === 'Quote expired' ? 'bg-amber-50 text-amber-800 ring-amber-200' : statusLabel === 'Ready' || statusLabel === 'Quote ready' || statusLabel === 'Published' || statusLabel === 'Ready to review' ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-indigo-50 text-indigo-800 ring-indigo-200';
  const checkButtonClass = installer.hasPrimaryAction ? secondaryButtonClass : primaryButtonClass;
  if (!opened) return <button className={secondaryButtonClass} onClick={() => setOpened(true)}>Verify this data</button>;
  return <section className="space-y-5 rounded-xl border border-gray-200 bg-white p-5 text-sm leading-6 text-gray-700 shadow-sm sm:p-6" aria-labelledby="gateway-verification-heading">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <h2 id="gateway-verification-heading" className="text-xl font-semibold text-gray-900">{probe?.state === 'complete' && probe.quote_id ? 'Verify this data' : epoch || attempt.current?.epochId || (probe && probe.state !== 'queued') ? 'Data verification' : 'Check verification availability'}</h2>
      <span className={`inline-flex shrink-0 items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${statusClass}`}>Status: {statusLabel}</span>
    </div>
    <p className="max-w-3xl">{aws ? 'Check your data in your own AWS account, then review a quote. The check and quote do not need a card. Data values stay in your AWS account.' : cloudflare ? 'Check your data in your own Cloudflare account, then review a quote. The check and quote do not need a card. Data values stay in your Cloudflare account.' : 'Check your data in your own gateway, then review a quote. The check and quote are free and do not need a card. Data values stay in your gateway.'}</p>
    {error && <p ref={errorRef} role="alert" tabIndex={-1} className="rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}
    {epoch && <>
      {progressStep > 0 && <div className="space-y-3">
        <div role="progressbar" aria-label="Paid verification progress" aria-valuemin={0} aria-valuemax={progressSteps.length} aria-valuenow={progressStep} aria-valuetext={progressSteps[progressStep - 1].label} className="h-2 overflow-hidden rounded-full bg-gray-200">
          <div className="h-full bg-indigo-600 transition-[width] motion-reduce:transition-none" style={{ width: `${progressStep / progressSteps.length * 100}%` }} />
        </div>
        <ol className="grid gap-2 sm:grid-cols-5" aria-label="Verification steps">
          {progressSteps.map((step, index) => <li key={step.label} aria-current={progressStep === index + 1 ? 'step' : undefined} className={progressStep === index + 1 ? 'font-semibold text-indigo-800' : 'text-gray-600'}>{index + 1}. {step.label}{progressStep === index + 1 && ' (Current step)'}</li>)}
        </ol>
      </div>}
      {(runningStates.has(epoch.state) || epoch.reconciliation_required) && <p role="status">{epoch.reconciliation_required ? 'We are confirming your payment. Please wait before starting again.' : 'Verification is in progress. You can return to this page to check it.'}</p>}
      {epoch.state === 'CAPTURED' && <>
        <h3 ref={findingsRef} tabIndex={-1} className="font-semibold">Review your findings</h3><p>These findings are private. Buyers can see them only if you publish them.</p><p>Charged: ${epoch.captured_usd}</p>
        {fullReview ? <ScanFindingsBadge scanFindings={fullReview} /> : <p>The complete findings are not available to review yet. Please check again before deciding whether to publish.</p>}
        <div className={buttonRowClass}><button className={secondaryButtonClass} disabled={busy || !canReview} onClick={() => setConfirmAction('publish')}>Publish all findings</button><button className={secondaryButtonClass} disabled={busy || !canReview} onClick={() => setConfirmAction('decline')}>Decline publication</button></div>
      </>}
      {epoch.state === 'PUBLISHED' && <><p>These findings are published. Publishing a new verification will replace the previous findings.</p><div className={buttonRowClass}><button className={dangerSecondaryButtonClass} disabled={busy || !hasBinding} onClick={() => setConfirmAction('withdraw')}>Withdraw findings</button></div></>}
      {epoch.state === 'SUPERSEDED' && <p>These findings were replaced by a newer published verification.</p>}
      {epoch.state === 'WITHDRAWN' && <p>These findings have been withdrawn.</p>}
      {epoch.state === 'DECLINED' && <p>You declined publication. The completed verification charge is unchanged.</p>}
      {['FAILED_VOIDED', 'CANCELLED_VOIDED'].includes(epoch.state) && <p>Verification ended and the temporary hold was released. No completed verification charge was made.</p>}
      {['AUTH_FAILED', 'CAPTURE_FAILED'].includes(epoch.state) && <p>The payment could not be completed. Please check your payment status before starting again.</p>}
      {['AUTHORIZED', 'SCANNING_LOCAL'].includes(epoch.state) && <div className={buttonRowClass}><button className={dangerSecondaryButtonClass} disabled={busy || !hasBinding} onClick={() => setConfirmAction('cancel')}>Cancel verification</button></div>}
    </>}
    {confirmAction && <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4" role="group" aria-label="Confirm your decision"><p>{confirmAction === 'publish' ? 'Publish the complete findings unedited? This replaces any previous published findings.' : confirmAction === 'decline' ? 'Decline publication? The completed verification charge is unchanged.' : confirmAction === 'withdraw' ? 'Withdraw these findings from the public listing?' : 'Cancel verification and release any unsettled hold?'}</p><div className={buttonRowClass}><button className={confirmAction === 'withdraw' || confirmAction === 'cancel' ? dangerSecondaryButtonClass : secondaryButtonClass} disabled={busy} onClick={() => lifecycle(confirmAction)}>Confirm {confirmAction === 'publish' ? 'publication' : confirmAction === 'decline' ? 'decline' : confirmAction === 'withdraw' ? 'withdrawal' : 'cancellation'}</button><button className={secondaryButtonClass} disabled={busy} onClick={() => setConfirmAction(null)}>Keep reviewing</button></div></div>}
    {aws && (probe?.refusal === 'aws_source_too_large' || error === verificationRefusalCopy('aws_source_too_large')) && <p><Link href="/dashboard/gateways" className="underline">Set up your own AIM Data gateway</Link> with a seller-owned S3 mount using Mountpoint for Amazon S3 or rclone.</p>}
    {aws && <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50/50 p-4 sm:p-5">
      <h3 className="font-semibold">AWS verifier</h3>
      <p role="status">{!statusFresh ? 'Checking verifier status…' : awsStatus?.state === 'ready' ? 'Ready' : awsStatus?.state === 'removed' ? 'Removed' : awsStatus?.state === 'waiting' ? 'Waiting for verifier' : 'Set up the verifier to check this data.'}</p>
      {awsStatus?.region && <p>Region: {awsStatus.region}</p>}
      {awsStatus?.code_sha256 && <p>Registered code hash: <code>{awsStatus.code_sha256}</code></p>}
      {awsStatus?.registered_at && <p>Registered at: <time dateTime={awsStatus.registered_at}>{awsStatus.registered_at}</time></p>}
      {awsStatus?.poll_interval_minutes && <p>Work may wait up to {awsStatus.poll_interval_minutes} minute(s) for the next verifier poll.</p>}
      {awsStatus?.state === 'waiting' && awsStatus.setup_expires_at && <p>Setup expires at {awsStatus.setup_expires_at}. If registration expires or has already been used by an unexpected verifier, check its registered hash and time, then remove it and set up a fresh verifier. An exact registration retry recovers its acknowledgment without creating another verifier.</p>}
      <div className={buttonRowClass}>
        <button className={secondaryButtonClass} disabled={busy || !statusFresh} onClick={() => setVerifierDecision(runnerId && awsStatus?.state !== 'removed' ? 'replace' : 'setup')}>Set up the verifier</button>
        <button className={secondaryButtonClass} disabled={busy} onClick={() => void run(readVerifierStatus)}>Check verifier status</button>
      </div>
      <p>{AWS_COST_DISCLOSURE}</p>
      <p>The setup link contains a single-use registration that expires after 30 minutes. It is visible in your AWS console, stack parameters and browser history. Check the registered code hash and time before proceeding. Setup does not authorize a probe.</p>
    </div>}
    {installer.panel}
    {cloudflare && !installer.active && <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50/50 p-4 sm:p-5">
      <h3 className="font-semibold">Cloudflare verifier</h3>
      <p role="status">{!statusFresh ? 'Checking verifier status…' : cloudflareStatus?.state === 'ready' ? 'Ready' : cloudflareStatus?.state === 'removed' ? 'Removed' : cloudflareStatus?.state === 'waiting' ? 'Waiting for verifier' : 'No verifier is set up for this data yet.'}</p>
      {cloudflareStatus?.binary_sha256 && <p>Registered binary SHA-256: <code>{cloudflareStatus.binary_sha256}</code></p>}
      {cloudflareStatus?.worker_identity && <p>Registered Worker identity: {cloudflareStatus.worker_identity.mode} <code>{cloudflareStatus.worker_identity.sha256}</code></p>}
      {cloudflareStatus?.registered_at && <p>Registered at: <time dateTime={cloudflareStatus.registered_at}>{cloudflareStatus.registered_at}</time></p>}
      {cloudflareStatus?.state === 'waiting' && <p>{CLOUDFLARE_RUN_NOW_COPY}</p>}
      <div className={buttonRowClass}><button className={secondaryButtonClass} disabled={busy} onClick={() => void run(readVerifierStatus)}>Check verifier status</button></div>
      <p>{CLOUDFLARE_COST_DISCLOSURE}</p>
      <p><a href="https://developers.cloudflare.com/workers/platform/pricing/" target="_blank" rel="noopener noreferrer" className="underline">Workers pricing</a>; <a href="https://developers.cloudflare.com/containers/platform/pricing/" target="_blank" rel="noopener noreferrer" className="underline">Containers pricing</a>; <a href="https://developers.cloudflare.com/r2/pricing/" target="_blank" rel="noopener noreferrer" className="underline">R2 pricing</a></p>
      {(probe?.refusal === 'cloudflare_source_too_large' || error === verificationRefusalCopy('cloudflare_source_too_large')) && <Link href="/dashboard/gateways" className="underline">Set up your own AIM Data gateway</Link>}
    </div>}
    {runnerId && (!cloud || verifierStatus?.state !== 'removed') && <div className={buttonRowClass}><button className={dangerSecondaryButtonClass} disabled={busy} onClick={() => setVerifierDecision('remove')}>Remove verifier</button></div>}
    {verifierDecision && <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4" role="group" aria-label="Confirm verifier change">
      <p>{verifierDecision === 'remove' ? 'Remove this verifier and stop new verification work?' : verifierDecision === 'replace' ? 'Replace the existing verifier and its receipt key? This stops its verification work.' : 'Set up a scoped verifier in your own AWS account?'}</p>
      <p>{cloudflare ? CLOUDFLARE_REMOVE_COPY : aws ? 'Deleting the CloudFormation stack stops its AWS resources and costs. Removing the verifier here does not delete the stack. Marketplace delivery is unchanged.' : 'Marketplace delivery is unchanged.'}</p>
      <div className={buttonRowClass}>
        <button className={verifierDecision === 'remove' || verifierDecision === 'replace' ? dangerSecondaryButtonClass : secondaryButtonClass} disabled={busy || (verifierDecision !== 'setup' && !runnerId)} onClick={confirmVerifierDecision}>Confirm {verifierDecision === 'remove' ? 'removal' : verifierDecision === 'replace' ? 'replacement' : 'setup'}</button>
        <button className={secondaryButtonClass} disabled={busy} onClick={() => setVerifierDecision(null)}>Keep current verifier</button>
      </div>
    </div>}
    {(!installer.resumed || installer.ready) && !probe && !epoch && !attempt.current?.epochId && <>
      <label className="flex items-start gap-3"><input className="mt-1 h-4 w-4 shrink-0 accent-[#3F51B5]" type="checkbox" checked={preview} disabled={busy || (!!attempt.current && !attempt.current.quoteRefused)} onChange={e => setPreview(e.target.checked)} /> Include column names and row counts in the findings</label>
      <div className={buttonRowClass}><button className={checkButtonClass} aria-busy={busy && busyPrimary.current} disabled={!ready || busy || (cloud && (!statusFresh || (cloudflare && !verifierStatus?.eligible) || verifierStatus?.state !== 'ready'))} onClick={checkData}>{busy && busyPrimary.current && <span aria-hidden="true" className={buttonSpinnerClass} />}{installer.resumed ? 'Start free check' : busy ? 'Checking…' : attempt.current?.quoteRefused ? 'Get a new quote' : 'Check data and get quote'}</button></div>
      {quoteExpired && <p role="status">No charge was made. Get a new quote to continue.</p>}
    </>}
    {attempt.current?.epochId && !epoch && <p role="status">Loading your existing verification. Check again to follow its status.</p>}
    {probe?.state === 'queued' && <p role="status">{aws ? 'Waiting for your AWS verifier to check the data. No ai.market charge has been made; AWS charges apply.' : cloudflare ? 'Waiting for your Cloudflare verifier to check the data. No ai.market charge has been made; Cloudflare charges apply.' : 'Waiting for your gateway to check the data. No charge has been made.'}</p>}
    {cloudflare && !installer.active && (probe?.state === 'queued' || (epoch && runningStates.has(epoch.state))) && <p>Your Cloudflare verifier checks for work automatically. If work is delayed, check verifier status.</p>}
    {probe?.state === 'refused' && <p role="alert">{verificationRefusalCopy(probe.refusal, verifier?.kind)}</p>}
    {probe?.state === 'complete' && probe.quote_id && probe.maximum_hold_usd && !epoch && !attempt.current?.epochId && !setup && <>
      <div className="space-y-2 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 sm:p-5">
        <h3 className="text-base font-semibold text-gray-900">Your verification quote</h3>
        <p><strong className="block text-lg font-semibold text-gray-900">A temporary hold of up to ${probe.maximum_hold_usd} will be placed on your card.</strong> The final charge is twice the cost of preparing the written findings, between $1 and $25. You pay for completed findings whether you publish or decline them. If verification fails before completion, the hold is released.</p>
      </div>
      <p>Verification covers the complete supported data for this listing version. It does not assess accuracy, legality, or fitness for a purpose. {aws ? 'Your AWS verifier' : cloudflare ? 'Your Cloudflare verifier' : 'Your gateway'} runs ai.market’s open-source scanner in an environment you control.</p>
      <fieldset disabled={busy || !!attempt.current?.startCommand} className="space-y-3">
        <legend className="font-semibold">Describe your data</legend>
        {(Object.keys(choices) as Array<keyof typeof choices>).map(key => <label key={key} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">{fieldLabels[key]}<select className="min-w-0 rounded-lg border border-gray-300 bg-white p-2 sm:w-1/2" value={description[key] ?? ''} onChange={e => setDescription(current => ({ ...current, [key]: e.target.value }))}>
          <option value="">Choose one</option>{choices[key].map(value => <option key={value} value={value}>{label(value)}</option>)}
        </select></label>)}
        {(['intended_use_tags', 'known_limitation_tags'] as const).map(key => <fieldset key={key}><legend>{key === 'intended_use_tags' ? 'Intended uses (choose up to five)' : 'Known limitations (choose up to five)'}</legend>
          {(key === 'intended_use_tags' ? useChoices : limitationChoices).map(value => <label key={value} className="mr-4 inline-block"><input type="checkbox" checked={(description[key] as string[]).includes(value)} disabled={(description[key]?.length ?? 0) >= 5 && !(description[key] as string[]).includes(value)} onChange={e => setDescription(current => ({ ...current, [key]: e.target.checked ? [...current[key]!, value].sort() : current[key]!.filter(tag => tag !== value) }))} /> {label(value)}</label>)}
        </fieldset>)}
      </fieldset>
      <div className="space-y-3 rounded-xl border border-gray-200 p-4">
        <label className="flex items-start gap-3"><input className="mt-1 h-4 w-4 shrink-0 accent-[#3F51B5]" type="checkbox" checked={publicationAck} onChange={e => setPublicationAck(e.target.checked)} /> I understand the charge and that I can publish all findings unedited or decline publication after reviewing them.</label>
        <label className="flex items-start gap-3"><input className="mt-1 h-4 w-4 shrink-0 accent-[#3F51B5]" type="checkbox" checked={corpusAck} onChange={e => setCorpusAck(e.target.checked)} /> I agree that the verification record and approved summary statistics will be retained in ai.market’s verification records, including if I decline publication.</label>
      </div>
      <div className={buttonRowClass}><button className={primaryButtonClass} aria-busy={busy && paying} disabled={busy || !publicationAck || !corpusAck || !completeDescription} onClick={paidStart}>{busy && paying && <span aria-hidden="true" className={buttonSpinnerClass} />}Start paid verification</button></div>
      {busy && paying && <p role="status" className="text-gray-600">Checking your payment method…</p>}
    </>}
    {setup && <><DataVerificationPaymentMethod returnToListing={{ listingId, sellerId }} /><div className={buttonRowClass}><button className={secondaryButtonClass} onClick={() => setSetup(false)}>Back to verification</button></div><p>After adding your card, return here and choose Start paid verification to continue.</p></>}
    {((attempt.current?.probeId || attempt.current?.epochId) || (ready && canNewAttempt)) && <div className={buttonRowClass}>
      {(attempt.current?.probeId || attempt.current?.epochId) && <button className={secondaryButtonClass} disabled={busy} onClick={() => void run(checkStatus)}>Check again</button>}
      {ready && canNewAttempt && <button className={secondaryButtonClass} disabled={busy} onClick={newAttempt}>Get a new quote</button>}
    </div>}
  </section>;
}
