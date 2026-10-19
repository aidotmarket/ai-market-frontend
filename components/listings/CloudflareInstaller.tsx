'use client';

import { useEffect, useRef, useState } from 'react';
import { startCloudflareInstall, getCloudflareInstall, controlCloudflareInstall, gatewayVerificationError, type CloudflareInstallStatus, type CloudflareVerifierStatus } from '@/api/dataVerificationGateway';
import { listSellerWorkspaceConnections } from '@/api/sellerWorkspace';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const terminal = new Set(['callback_refused', 'expired', 'closed', 'cancelled']);
const visible = () => document.visibilityState !== 'hidden';
const buttonClass = 'rounded-lg border border-indigo-600 px-4 py-2 font-medium text-indigo-700 disabled:opacity-50';
const fixedCopy: Record<string, string> = {
  expired: 'Cloudflare authorization expired. Connect Cloudflare again.',
  memory_lost: 'Installation session closed. Connect Cloudflare again.',
  binder_refused: 'Browser binding missing or changed. Cancel, then connect Cloudflare again.',
  binding_changed: 'Installation details changed. Cancel and connect Cloudflare again.',
  consent_cancelled: 'Cloudflare connection cancelled. Nothing was installed.',
  cleanup_unconfirmed: 'Access cleanup unconfirmed — disconnect the app in Cloudflare. No data check can start yet.',
  oauth_refused: 'Installation failed. Some verifier resources may remain in Cloudflare and incur charges. Open cleanup details.',
};
const unavailable = 'Installation status is unavailable. No data check can start yet.';
// Incomplete increment: installer Ready, phase details and free-check CTA await backend I2c.
export function cloudflareInstallCopy(status: CloudflareInstallStatus): string {
  if (status.error) return Object.hasOwn(fixedCopy, status.error) ? fixedCopy[status.error] : unavailable;
  if (status.phase === 'cancelled') return fixedCopy.consent_cancelled;
  if (status.phase === 'expired') return fixedCopy.expired;
  if (status.phase === 'start') return 'Approve the installation on Cloudflare. Installing does not start a data check.';
  if (status.phase === 'callback_claimed') return 'Installing your verifier in Cloudflare…';
  return unavailable;
}

export function useCloudflareInstaller(listingId: string, sellerId: string, connectionId: string | undefined, verifier: CloudflareVerifierStatus | null, fresh: boolean, pasted: boolean) {
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
  const revision = useRef(0);
  const finished = unreadable || (!!status && terminal.has(status.phase));
  const allowed = !!connectionId && fresh && verifier?.connection_id === connectionId && verifier.installer_enabled === true && verifier.eligible &&
    (verifier.state === 'none' || verifier.state === 'removed') && (!verifier.runner_id || verifier.state === 'removed') && !verifier.setup_expires_at && !pasted;
  useEffect(() => {
    setIntent(null); setStatus(null); setUnreadable(false); setError(''); setRestored(false); setAttest(false); setAccount(null);
    if (!connectionId) return;
    try {
      const saved = window.localStorage.getItem(key);
      if (saved && !uuid.test(saved)) throw new Error();
      setIntent(saved); setRestored(true);
    } catch { setError('Could not restore installation. Contact support before starting again.'); }
    return () => { revision.current++; };
  }, [key, connectionId]);
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
        if (!stopped && read === revision.current) { failures = 0; setStatus(next); setError(''); ended = terminal.has(next.phase); }
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
    lock.current = true; setBusy(true); setError('');
    const read = ++revision.current;
    try {
      if (action === 'dismiss') {
        window.localStorage.removeItem(key); window.localStorage.removeItem(`${key}:request`); setIntent(null); setStatus(null); setUnreadable(false);
      } else if (action === 'start' && allowed && restored) {
        const request = window.localStorage.getItem(`${key}:request`) ?? crypto.randomUUID();
        if (!uuid.test(request)) throw new Error();
        window.localStorage.setItem(`${key}:request`, request);
        const next = await startCloudflareInstall(listingId, connectionId!, request);
        if (read !== revision.current) return;
        if (!uuid.test(next.intent_id)) throw new Error();
        const url = new URL(next.authorize_url);
        if (url.origin !== 'https://dash.cloudflare.com' || url.pathname !== '/oauth2/auth' || url.username || url.password || url.hash) throw new Error();
        window.localStorage.setItem(key, next.intent_id); setIntent(next.intent_id);
        window.location.assign(url.href);
      } else if (intent && (action === 'cancel' || (action === 'cleanup-attestation' && attest))) {
        const next = await controlCloudflareInstall(intent, action);
        if (read === revision.current) { setStatus(next); setAttest(false); }
      }
    } catch { if (read === revision.current) setError('Could not complete the installation request. Try again or contact support.'); }
    finally { lock.current = false; if (read === revision.current) setBusy(false); }
  }
  const cleanup = status?.error === 'cleanup_unconfirmed' || status?.error === 'oauth_refused';
  const needsAttestation = (status?.cleanup === 'unconfirmed' || status?.error === 'cleanup_unconfirmed') && !status?.access_removal_confirmed_by_seller;
  // Retain cleanup history; backend admission requires attestation only for unconfirmed cleanup.
  const active = !!connectionId && !!intent && (!finished || !cleanup || needsAttestation);
  const dismiss = unreadable || (finished && !cleanup);
  const panel = !!connectionId && (!!intent || allowed || !!error) && <section className="space-y-3" aria-label="Cloudflare installation">
    {!intent ? allowed && <>
      <h3 className="font-semibold">Install your verifier</h3>
      <p>The check runs in your Cloudflare account. Your files stay there; ai.market receives only signed summary findings.</p>
      <p>You need a Cloudflare account and Workers Paid ($5/month plus usage). Cloudflare charges are separate from the verification fee.</p>
      <p>Give us temporary permission to install it. During setup this access can manage Workers and Containers in this Cloudflare account.</p>
      <p>We use it only for this installation; we disconnect our access automatically when done and keep no copy afterward.</p>
      <p>Installing does not start a data check.</p>
      <p>Choose the Cloudflare account for this listing. Approve Workers Admin and Workers Containers Write.</p>
      <details onToggle={event => { if (event.currentTarget.open) void readAccount(); }}><summary>Cloudflare account</summary><p>{account ? `Account ID: ${account}` : 'Account details unavailable.'}</p></details>
      <button className={buttonClass} disabled={busy || !allowed || !restored} onClick={() => void act('start')}>Connect Cloudflare</button>
    </> : <>
      {error !== unavailable && <p role="status">{status ? cloudflareInstallCopy(status) : 'Checking installation status…'}</p>}
      {status && !finished && <button className={buttonClass} disabled={busy || !!status.cancel_requested} onClick={() => void act('cancel')}>{status.cancel_requested ? 'Cancellation requested' : 'Cancel installation'}</button>}
      {dismiss && <button className={buttonClass} disabled={busy} onClick={() => void act('dismiss')}>Dismiss</button>}
      {cleanup && <>
        <details><summary>Cleanup details</summary><p>Disconnect the app in Cloudflare. Check your account for verifier resources and remove them to stop their charges. Resource identifiers are not available from installation status.</p></details>
        {status?.access_removal_confirmed_by_seller ? <p>Access removal recorded as your statement, not provider proof.</p> : <>
          <label><input type="checkbox" checked={attest} onChange={event => setAttest(event.target.checked)} /> I have removed the app’s access in Cloudflare.</label>
          <button className={buttonClass} disabled={busy || !attest} onClick={() => void act('cleanup-attestation')}>Record access removal</button>
        </>}
      </>}
      <details><summary>Verification details</summary>
        {(['claimed_at', 'updated_at'] as const).map(field => typeof status?.[field] === 'number' && Number.isFinite(status[field]) && <p key={field}>{field === 'claimed_at' ? 'Authorization received' : 'Last updated'} (UTC epoch seconds): {status[field]}</p>)}
      </details>
    </>}
    {error && <p role="alert">{error}</p>}
  </section>;
  return { active, resumed: !!intent, panel };
}
