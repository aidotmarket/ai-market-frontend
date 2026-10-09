'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { setupCompanyAuthenticator, verifyCompanyAuthenticator, recoverCompanyAuthenticator, companyAuthenticatorError } from '@/api/company-authenticator';
import { PENDING_ACTION_CONTINUATION } from '@/lib/redirect';
import CompanySignIn from './CompanySignIn';
import { companySignInEnabled } from '@/lib/company-sign-in';
import TotpQrCode from './TotpQrCode';
import { notifyCapabilitiesChanged } from './onboarding/SellerSetupProgressBar';

export function companyEnrollmentOffered(user: ReturnType<typeof useAuthStore.getState>['user']): boolean {
  // The new passwordless eligibility is server-owned. Readiness alone is also
  // returned with the backend flag off and cannot grant setup eligibility.
  return !!user?.sso_enforced && !user.totp_enabled && !user.auth_methods.includes('password')
    && user.two_factor_setup_eligible === true && !user.two_factor_provider
    && user.seller_binding_factor_readiness?.code === 'SECOND_FACTOR_ENROLLMENT_REQUIRED'
    && user.seller_binding_factor_readiness.path === '/dashboard/settings';
}

export default function CompanyAuthenticator({ recovery = false }: { recovery?: boolean }) {
  const router = useRouter();
  const freshFlow = companySignInEnabled();
  // Recovery may use the retained session; the mutation enforces freshness.
  const [signInRequired, setSignInRequired] = useState(!recovery);
  const [stage, setStage] = useState<'start' | 'qr' | 'backups' | 'disabled'>('start');
  const [setup, setSetup] = useState<{ secret: string; qr_uri: string; expires: number } | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const identity = `${useAuthStore.getState().user?.id}:${useAuthStore.getState().token}`;
  const run = async (action: () => Promise<void>) => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError('');
    try { await action(); }
    catch (cause) {
      setError(companyAuthenticatorError(cause));
      const detail = (cause as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      if (!freshFlow || detail === 'RECENT_LOGIN_REQUIRED' || (cause instanceof Error && cause.message === 'SETUP_INELIGIBLE')) setSignInRequired(true);
      if (detail !== 'Invalid verification code') {
        setSetup(null); setCode(''); setStage('start');
      }
    } finally { locked.current = false; setBusy(false); }
  };
  const sameSession = () => identity === `${useAuthStore.getState().user?.id}:${useAuthStore.getState().token}`;
  const start = () => run(async () => {
    const session = freshFlow ? `${useAuthStore.getState().user?.id}:${useAuthStore.getState().token}` : identity;
    if (freshFlow && useAuthStore.getState().user?.two_factor_setup_eligible !== true) throw new Error('SETUP_INELIGIBLE');
    const result = await setupCompanyAuthenticator();
    if (session !== `${useAuthStore.getState().user?.id}:${useAuthStore.getState().token}`) return;
    setSetup({ ...result, expires: Date.now() + result.expires_in * 1000 }); setStage('qr');
  });
  const verify = () => run(async () => {
    if (!setup || Date.now() >= setup.expires) throw new Error('SETUP_EXPIRED');
    const result = await verifyCompanyAuthenticator(code);
    if (!sameSession()) return;
    setSetup(null); setCode(''); setCodes(result.backup_codes); setStage('backups');
    notifyCapabilitiesChanged();
  });
  const recover = () => run(async () => {
    await recoverCompanyAuthenticator(code.trim());
    setCode(''); setStage('disabled'); notifyCapabilitiesChanged();
    // Disable retires the access-token generation. Refresh before re-enrollment.
    await useAuthStore.getState().refreshAuth();
  });
  const done = () => run(async () => {
    setCodes([]);
    await useAuthStore.getState().refreshAuth();
    const redirect = new URLSearchParams(window.location.search).get('redirect') || '';
    if (PENDING_ACTION_CONTINUATION.test(redirect)) router.push(redirect);
    else setStage('start');
  });

  return <section aria-label={recovery ? 'Lost authenticator' : 'Company authenticator'} className="space-y-3 rounded-lg border p-4">
    <h3 className="font-semibold">{recovery ? 'Lost your authenticator?' : 'Set up your authenticator'}</h3>
    {!freshFlow && <p>Your company sign-in is still required. Sign in through your company within the last 15 minutes, then return here.</p>}
    {freshFlow && signInRequired && stage === 'start' && <CompanySignIn allowOidc={!useAuthStore.getState().user?.auth_methods.includes('saml')} returnPath="/dashboard/settings" onSuccess={async () => { setSignInRequired(false); if (!recovery) await start(); }} />}
    {!freshFlow && stage === 'start' && <button disabled={busy} onClick={() => run(() => useAuthStore.getState().refreshAuth())}>Check company sign-in</button>}
    {error && <p role="alert">{error}</p>}
    {stage === 'start' && (!freshFlow || !signInRequired) && <>
      {recovery ? <>
        <p>Use one backup code to disable your lost authenticator. Then set up a new one.</p>
        <label className="block">Backup code <input autoComplete="off" value={code} onChange={e => setCode(e.target.value)} /></label>
        <button disabled={busy || !code.trim()} onClick={recover}>Disable lost authenticator</button>
      </> : <button disabled={busy} onClick={start}>Set up company authenticator</button>}
    </>}
    {stage === 'qr' && setup && <>
      <TotpQrCode uri={setup.qr_uri} className="h-40 w-40" />
      <p>Scan the QR code, or enter this secret in your authenticator app.</p><code>{setup.secret}</code>
      <label className="block">Authenticator code <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} /></label>
      <button disabled={busy || code.length !== 6} onClick={verify}>Verify and enable</button>
      <button disabled={busy} onClick={() => { setSetup(null); setCode(''); setStage('start'); }}>Cancel</button>
    </>}
    {stage === 'backups' && <>
      <h4>Backup codes</h4><p>Save these codes now. Each code works once.</p>
      <ul>{codes.map(value => <li key={value}>{value}</li>)}</ul>
      <button disabled={busy} onClick={done}>I saved my backup codes</button>
    </>}
    {stage === 'disabled' && <><p>Authenticator disabled. Set up a new authenticator before confirming requests.</p><Link href="/dashboard/settings#security">Set up a new authenticator</Link></>}
    {busy && <p role="status">Working…</p>}
  </section>;
}
