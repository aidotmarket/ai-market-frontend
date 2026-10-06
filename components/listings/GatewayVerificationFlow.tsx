'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  getGatewayVerificationEpoch, getGatewayVerificationProbe, gatewayVerificationLifecycle, gatewayVerificationError,
  probeGatewayVerification, startGatewayVerification, verificationErrorCopy, verificationRefusalCopy,
  getAwsVerifierStatus, setupAwsVerifier, removeVerificationRunner,
  getCloudflareVerifierStatus, setupCloudflareVerifier,
  type CloudflareVerifierStatus, type CloudflareSetupResponse, type AWSVerifierStatus,
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
// The deployed Worker accepts only a 32-byte base64url secret (43 characters).
// It is generated here, shown once, and never sent to ai.market or stored.
export function generateRunNowSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export const CLOUDFLARE_RUN_NOW_COPY = "Open the verifier’s control page in your own Cloudflare account and press Run now. The scheduled trigger is best-effort; if polling is delayed, press Run now again. ai.market never invokes your verifier.";

export default function GatewayVerificationFlow({ listingId, sellerId, verifier, onChanged }: Props) {
  const aws = verifier?.kind === 'aws';
  const cloudflare = verifier?.kind === 'cloudflare';
  const cloud = aws || cloudflare;
  // Recovery uses this browser’s localStorage only. Clearing it or switching
  // browsers loses the attempt/epoch ID; this contract cannot discover it again.
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
  const [opened, setOpened] = useState(!cloud);
  const [cloudflareSetup, setCloudflareSetup] = useState<CloudflareSetupResponse | null>(null);
  const [runNowSecret, setRunNowSecret] = useState<string | null>(null);
  const [cloudflareStatus, setCloudflareStatus] = useState<CloudflareVerifierStatus | null>(null);
  const [awsStatus, setAwsStatus] = useState<AWSVerifierStatus | null>(null);
  const [statusFresh, setStatusFresh] = useState(false);
  const [verifierDecision, setVerifierDecision] = useState<'setup' | 'replace' | 'remove' | null>(null);
  const statusRead = useRef(0);
  const verifierStatus = cloudflare ? cloudflareStatus : awsStatus;
  const runnerId = cloudflare ? cloudflareStatus?.runner_id : aws ? awsStatus?.runner_id : verifier?.kind === 'gateway' ? verifier.runnerId : undefined;

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
    async function poll() {
      if (document.visibilityState !== 'hidden') {
        try { await readVerifierStatus(); }
        catch (cause) { if (!stopped) setError(verificationErrorCopy(cause)); }
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
        if (cloud) { setCloudflareSetup(null); setStatusFresh(false); await readVerifierStatus(); }
        await checkStatus();
        onChanged?.();
      });
      return;
    }
    if (verifier?.kind === 'cloudflare') {
      if (verifierDecision === 'replace' && !runnerId) return;
      void run(async () => {
        setCloudflareSetup(null);
        try {
          const command = { kind: 'cloudflare' as const, connection_id: verifier.connectionId, jurisdiction: 'default' as const };
          const result = await setupCloudflareVerifier(verifierDecision === 'replace' && runnerId
            ? { ...command, replace_runner_id: runnerId, confirm_replace: true } : command);
          if (!mounted.current) return;
          setCloudflareSetup(result);
          setRunNowSecret(generateRunNowSecret());
          setVerifierDecision(null);
          setStatusFresh(false);
          await readVerifierStatus();
        } catch (cause) {
          if (gatewayVerificationError(cause).code === 'replacement_confirmation_required') {
            await readVerifierStatus();
            if (mounted.current) setVerifierDecision('replace');
          }
          throw cause;
        }
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
      const pending = epoch ? runningStates.has(epoch.state) || epoch.reconciliation_required : !probe || probe.state === 'queued';
      if (pending) timer = setTimeout(() => void poll(), Math.max(0, nextPollAt.current - Date.now()));
    }
    return () => { stopped = true; clearTimeout(timer); };
    // Status changes reschedule the read-only polling loop.
  }, [ready, probe?.state, epoch?.state, epoch?.reconciliation_required, delay, storageKey]);

  function checkData() {
    if (cloud && (!statusFresh || (cloudflare && !verifierStatus?.eligible) || verifierStatus?.state !== 'ready')) return;
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
  if (!opened) return <button className={buttonClass} onClick={() => setOpened(true)}>Verify this data</button>;
  return <section className="space-y-5 rounded-xl border border-gray-200 bg-white p-6" aria-labelledby="gateway-verification-heading">
    <h2 id="gateway-verification-heading" className="text-xl font-semibold">{probe?.state === 'complete' && probe.quote_id ? 'Verify this data' : epoch || attempt.current?.epochId || (probe && probe.state !== 'queued') ? 'Data verification' : 'Check verification availability'}</h2>
    <p>{aws ? 'Check your data in your own AWS account, then review a quote. The check and quote do not need a card. Data values stay in your AWS account.' : cloudflare ? 'Check your data in your own Cloudflare account, then review a quote. The check and quote do not need a card. Data values stay in your Cloudflare account.' : 'Check your data in your own gateway, then review a quote. The check and quote are free and do not need a card. Data values stay in your gateway.'}</p>
    {error && <p role="alert">{error}</p>}
    {aws && (probe?.refusal === 'aws_source_too_large' || error === verificationRefusalCopy('aws_source_too_large')) && <p><Link href="/dashboard/gateways" className="underline">Set up your own AIM Data gateway</Link> with a seller-owned S3 mount using Mountpoint for Amazon S3 or rclone.</p>}
    {aws && <>
      <h3 className="font-semibold">AWS verifier</h3>
      <p role="status">{!statusFresh ? 'Checking verifier status…' : awsStatus?.state === 'ready' ? 'Ready' : awsStatus?.state === 'removed' ? 'Removed' : awsStatus?.state === 'waiting' ? 'Waiting for verifier' : 'Set up the verifier to check this data.'}</p>
      {awsStatus?.region && <p>Region: {awsStatus.region}</p>}
      {awsStatus?.code_sha256 && <p>Registered code hash: <code>{awsStatus.code_sha256}</code></p>}
      {awsStatus?.registered_at && <p>Registered at: <time dateTime={awsStatus.registered_at}>{awsStatus.registered_at}</time></p>}
      {awsStatus?.poll_interval_minutes && <p>Work may wait up to {awsStatus.poll_interval_minutes} minute(s) for the next verifier poll.</p>}
      {awsStatus?.state === 'waiting' && awsStatus.setup_expires_at && <p>Setup expires at {awsStatus.setup_expires_at}. If registration expires or has already been used by an unexpected verifier, check its registered hash and time, then remove it and set up a fresh verifier. An exact registration retry recovers its acknowledgment without creating another verifier.</p>}
      <button className={buttonClass} disabled={busy || !statusFresh} onClick={() => setVerifierDecision(runnerId && awsStatus?.state !== 'removed' ? 'replace' : 'setup')}>Set up the verifier</button>
      <button className={buttonClass} disabled={busy} onClick={() => void run(readVerifierStatus)}>Check verifier status</button>
      <p>{AWS_COST_DISCLOSURE}</p>
      <p>The setup link contains a single-use registration that expires after 30 minutes. It is visible in your AWS console, stack parameters and browser history. Check the registered code hash and time before proceeding. Setup does not authorize a probe.</p>
    </>}
    {cloudflare && <>
      <h3 className="font-semibold">Cloudflare verifier</h3>
      <p role="status">{!statusFresh ? 'Checking verifier status…' : cloudflareStatus?.state === 'ready' ? 'Ready' : cloudflareStatus?.state === 'removed' ? 'Removed' : cloudflareStatus?.state === 'waiting' ? 'Waiting for verifier' : 'Set up the verifier to check this data.'}</p>
      <p>You need a GitHub or GitLab account and Cloudflare Workers Paid.</p>
      {cloudflareStatus?.binary_sha256 && <p>Registered binary SHA-256: <code>{cloudflareStatus.binary_sha256}</code></p>}
      {cloudflareStatus?.worker_identity && <p>Registered Worker identity: {cloudflareStatus.worker_identity.mode} <code>{cloudflareStatus.worker_identity.sha256}</code></p>}
      {cloudflareStatus?.registered_at && <p>Registered at: <time dateTime={cloudflareStatus.registered_at}>{cloudflareStatus.registered_at}</time></p>}
      {cloudflareStatus?.state === 'waiting' && <p>{CLOUDFLARE_RUN_NOW_COPY}</p>}
      {cloudflareStatus?.setup_expires_at && <p>Setup expires at {cloudflareStatus.setup_expires_at}. An exact registration retry recovers its acknowledgment without creating another verifier. If setup expires, request a fresh setup token.</p>}
      <button className={buttonClass} disabled={busy || !statusFresh || !cloudflareStatus?.eligible} onClick={() => setVerifierDecision(runnerId && cloudflareStatus?.state !== 'removed' ? 'replace' : 'setup')}>Set up the verifier</button>
      <button className={buttonClass} disabled={busy} onClick={() => void run(readVerifierStatus)}>Check verifier status</button>
      <p>For a version update, confirm replacement to get the new release’s button and fresh registration. Remove the old deployment and Durable Object state after exporting your audit records privately. ai.market never pushes updates or invokes anything in your account.</p>
      {cloudflareSetup && <div className="space-y-3">
        <a className={buttonClass} href={cloudflareSetup.deploy_button_url} target="_blank" rel="noopener noreferrer">Deploy to Cloudflare</a>
        <p>Release: {cloudflareSetup.release_id}; scanner version: {cloudflareSetup.scanner_version}</p>
        <label className="block">Registration token<input className="block w-full rounded border p-2" readOnly value={cloudflareSetup.registration_token} onFocus={event => event.target.select()} /></label>
        <button className={buttonClass} onClick={() => void run(async () => { await navigator.clipboard.writeText(cloudflareSetup.registration_token); })}>Copy registration token</button>
        <p>Registration token expires at {cloudflareSetup.expires_at_utc}.</p>
        {runNowSecret && <>
          <label className="block">Run-now secret<input className="block w-full rounded border p-2" readOnly value={runNowSecret} onFocus={event => event.target.select()} /></label>
          <button className={buttonClass} onClick={() => void run(async () => { await navigator.clipboard.writeText(runNowSecret); })}>Copy run-now secret</button>
        </>}
        <p>The deployment button prompts for two secrets: REGISTRATION_TOKEN (paste the registration token above) and RUN_NOW_SECRET (paste the run-now secret above). Save the run-now secret somewhere private now: you need it to press Run now on your verifier’s control page, and it is not shown again. It was created in this browser and never reaches ai.market. The setup token is shown to you, as with AWS.</p>
        <p>Binary SHA-256: <code>{cloudflareSetup.binary_sha256}</code></p>
        <p>Worker identity: {cloudflareSetup.worker_identity.mode} <code>{cloudflareSetup.worker_identity.sha256}</code></p>
        <p>{CLOUDFLARE_RUN_NOW_COPY}</p>
      </div>}
      <p>{CLOUDFLARE_COST_DISCLOSURE}</p>
      <p><a href="https://developers.cloudflare.com/workers/platform/pricing/" target="_blank" rel="noopener noreferrer" className="underline">Workers pricing</a>; <a href="https://developers.cloudflare.com/containers/platform/pricing/" target="_blank" rel="noopener noreferrer" className="underline">Containers pricing</a>; <a href="https://developers.cloudflare.com/r2/pricing/" target="_blank" rel="noopener noreferrer" className="underline">R2 pricing</a></p>
      {(probe?.refusal === 'cloudflare_source_too_large' || error === verificationRefusalCopy('cloudflare_source_too_large')) && <Link href="/dashboard/gateways" className="underline">Set up your own AIM Data gateway</Link>}
    </>}
    {runnerId && (!cloud || verifierStatus?.state !== 'removed') && <button className={buttonClass} disabled={busy} onClick={() => setVerifierDecision('remove')}>Remove verifier</button>}
    {verifierDecision && <div role="group" aria-label="Confirm verifier change">
      <p>{verifierDecision === 'remove' ? 'Remove this verifier and stop new verification work?' : verifierDecision === 'replace' ? 'Replace the existing verifier and its receipt key? This stops its verification work.' : cloudflare ? 'Set up a scoped verifier in your own Cloudflare account?' : 'Set up a scoped verifier in your own AWS account?'}</p>
      {cloudflare && verifierDecision === 'replace' && <p>Replace runner {runnerId}. Remove the old deployment after setting up the new release.</p>}
      <p>{cloudflare ? CLOUDFLARE_REMOVE_COPY : aws ? 'Deleting the CloudFormation stack stops its AWS resources and costs. Removing the verifier here does not delete the stack. Marketplace delivery is unchanged.' : 'Marketplace delivery is unchanged.'}</p>
      <button className={buttonClass} disabled={busy || (verifierDecision !== 'setup' && !runnerId)} onClick={confirmVerifierDecision}>Confirm {verifierDecision === 'remove' ? 'removal' : verifierDecision === 'replace' ? 'replacement' : 'setup'}</button>
      <button className={buttonClass} disabled={busy} onClick={() => setVerifierDecision(null)}>Keep current verifier</button>
    </div>}
    {!probe && !epoch && !attempt.current?.epochId && <>
      <label className="block"><input type="checkbox" checked={preview} disabled={busy || (!!attempt.current && !attempt.current.quoteRefused)} onChange={e => setPreview(e.target.checked)} /> Include column names and row counts in the findings</label>
      <button className={buttonClass} disabled={!ready || busy || (cloud && (!statusFresh || (cloudflare && !verifierStatus?.eligible) || verifierStatus?.state !== 'ready'))} onClick={checkData}>{busy ? 'Checking…' : attempt.current?.quoteRefused ? 'Get a new quote' : 'Check data and get quote'}</button>
    </>}
    {attempt.current?.epochId && !epoch && <p role="status">Loading your existing verification. Check again to follow its status.</p>}
    {probe?.state === 'queued' && <p role="status">{aws ? 'Waiting for your AWS verifier to check the data. No ai.market charge has been made; AWS charges apply.' : cloudflare ? 'Waiting for your Cloudflare verifier to check the data. No ai.market charge has been made; Cloudflare charges apply.' : 'Waiting for your gateway to check the data. No charge has been made.'}</p>}
    {cloudflare && (probe?.state === 'queued' || (epoch && runningStates.has(epoch.state))) && <p>{CLOUDFLARE_RUN_NOW_COPY}</p>}
    {probe?.state === 'refused' && <p role="alert">{verificationRefusalCopy(probe.refusal)}</p>}
    {probe?.state === 'complete' && probe.quote_id && probe.maximum_hold_usd && !epoch && !attempt.current?.epochId && !setup && <>
      <h3 className="font-semibold">Your verification quote</h3>
      <p>A temporary hold of up to ${probe.maximum_hold_usd} will be placed on your card. The final charge is twice the cost of preparing the written findings, between $1 and $25. You pay for completed findings whether you publish or decline them. If verification fails before completion, the hold is released.</p>
      <p>Verification covers the complete supported data for this listing version. It does not assess accuracy, legality, or fitness for a purpose. {aws ? 'Your AWS verifier' : cloudflare ? 'Your Cloudflare verifier' : 'Your gateway'} runs ai.market’s open-source scanner in an environment you control.</p>
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
      <label className="block"><input type="checkbox" checked={corpusAck} onChange={e => setCorpusAck(e.target.checked)} /> I agree that the verification record and approved summary statistics will be retained in ai.market’s verification records, including if I decline publication.</label>
      <button className={buttonClass} disabled={busy || !publicationAck || !corpusAck || !completeDescription} onClick={paidStart}>Start paid verification</button>
    </>}
    {setup && <><DataVerificationPaymentMethod returnToListing={{ listingId, sellerId }} /><button className={buttonClass} onClick={() => setSetup(false)}>Back to verification</button><p>After adding your card, return here and choose Start paid verification to continue.</p></>}
    {epoch && <>
      {(runningStates.has(epoch.state) || epoch.reconciliation_required) && <p role="status">{epoch.reconciliation_required ? 'We are confirming your payment. Please wait before starting again.' : 'Verification is in progress. You can return to this page to check it.'}</p>}
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
    {(attempt.current?.probeId || attempt.current?.epochId) && <button className={buttonClass} disabled={busy} onClick={() => void run(checkStatus)}>Check again</button>}
    {ready && canNewAttempt && <button className={buttonClass} disabled={busy} onClick={newAttempt}>Get a new quote</button>}
  </section>;
}
