'use client';

import { useEffect, useRef, useState } from 'react';
import { startCloudflareInstall, getCloudflareInstall, controlCloudflareInstall, gatewayVerificationError, type CloudflareInstallStatus, type CloudflareVerifierStatus } from '@/api/dataVerificationGateway';
import { listSellerWorkspaceConnections } from '@/api/sellerWorkspace';
import { primaryButtonClass, secondaryButtonClass, dangerSecondaryButtonClass, buttonRowClass, buttonSpinnerClass, disclosureSummaryClass } from '@/components/ui/button-styles';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const terminal = new Set(['callback_refused', 'expired', 'closed', 'cancelled']);
const visible = () => document.visibilityState !== 'hidden';
const unavailable = 'Installation status is unavailable. No data check can start yet.';
const polling = (status: CloudflareInstallStatus) => !terminal.has(status.phase) || status.runtime.state === 'waiting_registration';
const observations = { claimed_observed_at: 'Authorization received', closed_observed_at: 'Installation closed', token_consumed_observed_at: 'Registration', first_empty_poll_observed_at: 'First empty poll', last_poll_observed_at: 'Last poll' } as const;

export function useCloudflareInstaller(listingId: string, sellerId: string, connectionId: string | undefined, verifier: CloudflareVerifierStatus | null, fresh: boolean, primary = true) {
  const key = `cloudflare-install:${sellerId}:${listingId}:${connectionId}`;
  const [intent, setIntent] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [status, setStatus] = useState<CloudflareInstallStatus | null>(null);
  const [unreadable, setUnreadable] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [attest, setAttest] = useState(false);
  const [account, setAccount] = useState<string | null>(null);
  const lock = useRef(false);
  // Presentation only: another pending action must not spin the install button.
  const busyAction = useRef<string | null>(null);
  const revision = useRef(0);
  const savedIntent = useRef<string | null>(null);
  const finished = unreadable || (!!status && !polling(status));
  const allowed = !!connectionId && fresh && verifier?.connection_id === connectionId && verifier.installer_enabled === true && verifier.eligible &&
    (verifier.state === 'none' || verifier.state === 'removed') && (!verifier.runner_id || verifier.state === 'removed') && !verifier.setup_expires_at;
  useEffect(() => {
    setIntent(null); setStatus(null); setUnreadable(false); setError(''); setRestored(false); setAttest(false); setAccount(null);
    if (!connectionId) return;
    try {
      const saved = window.localStorage.getItem(key);
      if (saved && !uuid.test(saved)) throw new Error();
      savedIntent.current = saved; setIntent(saved); setRestored(true);
    } catch { setError('Could not restore installation. Contact support before starting again.'); }
    return () => { revision.current++; };
  }, [key, connectionId]);
  useEffect(() => {
    const latest = verifier?.connection_id === connectionId && fresh ? verifier?.latest_intent_id : null;
    if (lock.current || !restored || !latest || latest === intent || !uuid.test(latest)) return;
    if (intent && (intent !== savedIntent.current || status?.intent_id !== intent || !terminal.has(status.phase))) return;
    try {
      if (window.localStorage.getItem(`${key}:dismissed`) === latest) return;
      window.localStorage.setItem(key, latest); revision.current++; setIntent(latest); setStatus(null); setUnreadable(false); setAttest(false);
    } catch { setError('Could not restore installation. Contact support before starting again.'); }
  }, [restored, intent, status, fresh, verifier?.latest_intent_id, verifier?.connection_id, connectionId, key]);
  useEffect(() => {
    if (!intent || finished) return;
    let stopped = false, inFlight = false, ended = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      clearTimeout(timer);
      if (stopped || ended || inFlight || !visible()) return;
      inFlight = true;
      const read = revision.current;
      try {
        const next = await getCloudflareInstall(intent!);
        if (!stopped && read === revision.current) {
          if (terminal.has(next.phase)) window.localStorage.removeItem(`${key}:request`);
          failures = 0; setStatus(next); setError(''); ended = !polling(next);
        }
      } catch (cause) {
        if (!stopped && read === revision.current) {
          ended = gatewayVerificationError(cause).status === 404 || ++failures >= 3;
          setUnreadable(ended); setError(unavailable);
        }
      }
      finally { inFlight = false; }
      if (!stopped && !ended && visible()) timer = setTimeout(() => void poll(), 3000);
    }
    void poll();
    document.addEventListener('visibilitychange', poll);
    return () => { stopped = true; clearTimeout(timer); document.removeEventListener('visibilitychange', poll); };
  }, [intent, finished]);
  async function readAccount() {
    const read = revision.current;
    try {
      const connections = await listSellerWorkspaceConnections();
      const match = connections.find(item => item.id === connectionId && item.provider === 'r2' && item.status === 'verified');
      if (read === revision.current) setAccount(match?.provider_account_id ?? null);
    } catch { /* Optional account details must never display raw failures. */ }
  }
  async function act(action: 'start' | 'cancel' | 'cleanup-attestation' | 'dismiss') {
    if (lock.current) return;
    busyAction.current = action;
    lock.current = true; setBusy(true); setError('');
    const read = ++revision.current;
    try {
      if (action === 'dismiss') {
        if (intent) window.localStorage.setItem(`${key}:dismissed`, intent);
        window.localStorage.removeItem(key); window.localStorage.removeItem(`${key}:request`); setIntent(null); setStatus(null); setUnreadable(false);
      } else if (action === 'start' && allowed && restored) {
        savedIntent.current = null;
        const request = window.localStorage.getItem(`${key}:request`) ?? crypto.randomUUID();
        if (!uuid.test(request)) throw new Error();
        window.localStorage.setItem(`${key}:request`, request);
        const next = await startCloudflareInstall(listingId, connectionId!, request);
        if (read !== revision.current) return;
        if (!uuid.test(next.intent_id)) throw new Error();
        const url = new URL(next.authorize_url);
        if (url.origin !== 'https://dash.cloudflare.com' || url.pathname !== '/oauth2/auth' || url.username || url.password || url.hash) throw new Error();
        window.localStorage.setItem(key, next.intent_id); setIntent(next.intent_id); setStatus(null); setUnreadable(false);
        window.location.assign(url.href);
      } else if (intent && (action === 'cancel' || (action === 'cleanup-attestation' && attest))) {
        const next = await controlCloudflareInstall(intent, action);
        if (read === revision.current) {
          if (terminal.has(next.phase)) window.localStorage.removeItem(`${key}:request`);
          setStatus(next); setAttest(false);
        }
      }
    } catch (cause) {
      const refusal = gatewayVerificationError(cause);
      if (read === revision.current) setError(action === 'start' && refusal.status === 409 && refusal.code === 'install_residue_unresolved'
        ? 'Confirm you removed the verifier resources and app access in Cloudflare before trying again.'
        : 'Could not complete the installation request. Try again or contact support.');
    }
    finally { lock.current = false; if (read === revision.current) setBusy(false); }
  }
  const state = status?.runtime.state;
  const resources = status?.resource_cleanup_pending ?? (state === 'boot_timed_out' || state === 'failed_residue' || (state === 'failed' && !!status?.residual_resources?.length));
  const cleanup = state === 'cleanup_unconfirmed' || resources;
  const needsAttestation = resources || (cleanup && !status?.access_removal_confirmed_by_seller);
  const active = !!connectionId && !!intent;
  const dismiss = unreadable || (finished && !cleanup);
  const hasPrimaryAction = primary && !!connectionId && (!intent || (finished && !unreadable)) && allowed;
  const statusLabel = error || unreadable ? 'Unavailable' : busy && busyAction.current === 'start' ? 'Installing' : !intent ? 'Ready to install'
    : state === 'ready' || state === 'ready_attested' ? 'Ready' : cleanup ? 'Needs attention' : finished ? 'Unavailable' : 'Installing';
  const panel = !!connectionId && (!!intent || allowed || !!error) && <section className="space-y-4 rounded-xl border border-gray-200 bg-gray-50/50 p-4 text-sm leading-6 sm:p-5" aria-label="Cloudflare installation">
    {(!intent || (finished && !unreadable)) && allowed && <>
      <h3 className="text-base font-semibold text-gray-900">Install your verifier</h3>
      <p>The check runs in your Cloudflare account. Your files stay there; ai.market receives only signed summary findings.</p>
      <ul className="list-disc space-y-2 pl-5 text-gray-600">
        <li>You need a Cloudflare account and Workers Paid ($5/month plus usage). Cloudflare charges are separate from the verification fee.</li>
        <li>Give us temporary permission to install it. During setup this access can manage Workers and Containers in this Cloudflare account.</li>
        <li>We use it only for this installation; we disconnect our access automatically when done and keep no copy afterward.</li>
        <li>Installing does not start a data check.</li>
        <li>Choose the Cloudflare account for this listing. Approve Workers Admin and Workers Containers Write.</li>
      </ul>
      <details className="group rounded-lg border border-gray-200 bg-white" onToggle={event => { if (event.currentTarget.open) void readAccount(); }}><summary className={disclosureSummaryClass}>Cloudflare account</summary><p className="px-3 pb-3">{account ? `Account ID: ${account}` : 'Account details unavailable.'}</p></details>
      <div className={buttonRowClass}>
        <button className={primary ? primaryButtonClass : secondaryButtonClass} aria-busy={busy && busyAction.current === 'start'} disabled={busy || !allowed || !restored} onClick={() => void act('start')}>{busy && busyAction.current === 'start' && <span aria-hidden="true" className={buttonSpinnerClass} />}Connect Cloudflare</button>
      </div>
    </>}
    {intent && <>
      {error !== unavailable && <p role="status">{status ? status.message : 'Checking installation status…'}</p>}
      {((status && !terminal.has(status.phase)) || dismiss) && <div className={buttonRowClass}>
        {status && !terminal.has(status.phase) && <button className={dangerSecondaryButtonClass} disabled={busy || !!status.cancel_requested} onClick={() => void act('cancel')}>{status.cancel_requested ? 'Cancellation requested' : 'Cancel installation'}</button>}
        {dismiss && <button className={secondaryButtonClass} disabled={busy} onClick={() => void act('dismiss')}>Dismiss</button>}
      </div>}
      {cleanup && <>
        <details className="group rounded-lg border border-gray-200 bg-white"><summary className={disclosureSummaryClass}>Cleanup details</summary><p className="px-3 pb-3">{resources ? 'Disconnect the app in Cloudflare. Check your account for verifier resources and remove them to stop their charges. Confirm you removed the verifier resources and app access in Cloudflare before trying again.' : 'Disconnect the app in Cloudflare and confirm you removed its access.'}</p>{status?.residual_resources?.map(resource => <p className="break-words px-3 pb-3" key={resource}>{resource}</p>)}</details>
        {status?.access_removal_confirmed_by_seller && <p>Access removal recorded as your statement, not provider proof.</p>}
        {needsAttestation && <>
          <label className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-3"><input className="mt-1 h-4 w-4 shrink-0 accent-[#3F51B5]" type="checkbox" checked={attest} onChange={event => setAttest(event.target.checked)} /> {resources ? (status?.access_removal_confirmed_by_seller ? 'I have removed the listed verifier resources in Cloudflare.' : 'I have removed the listed verifier resources and app access in Cloudflare.') : 'I have removed the app’s access in Cloudflare.'}</label>
          <div className={buttonRowClass}><button className={secondaryButtonClass} disabled={busy || !attest} onClick={() => void act('cleanup-attestation')}>Record access removal</button></div>
        </>}
      </>}
      <details className="group rounded-lg border border-gray-200 bg-white"><summary className={disclosureSummaryClass}>Verification details</summary>
        {(Object.keys(observations) as Array<keyof typeof observations>).map(field => typeof status?.runtime[field] === 'number' && Number.isFinite(status.runtime[field]) && <p className="px-3 pb-3" key={field}>{observations[field]} observed (UTC epoch seconds): {status.runtime[field]}</p>)}
      </details>
    </>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}
  </section>;
  return { active, resumed: !!intent, ready: state === 'ready' || state === 'ready_attested', hasPrimaryAction, statusLabel, panel };
}
