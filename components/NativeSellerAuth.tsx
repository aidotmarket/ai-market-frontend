'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth';
import { pendingActionError } from '@/api/pending-actions';
import ReauthModal from '@/app/dashboard/settings/ReauthModal';
import CompanySignIn from '@/components/CompanySignIn';
import { companySignInEnabled } from '@/lib/company-sign-in';
import { startProviderOAuth } from '@/components/OAuthButtons';

export default function NativeSellerAuth({ error, onToken, onRetry }: { error: unknown; onToken: (token: string) => Promise<void>; onRetry: () => void }) {
  const user = useAuthStore(s => s.user);
  const [open, setOpen] = useState(false);
  const [stale, setStale] = useState(false);
  const [providerFailure, setProviderFailure] = useState(false);
  useEffect(() => { setStale(false); setProviderFailure(false); }, [error]);
  const kind = stale ? 'login' : pendingActionError(error);
  const company = companySignInEnabled() && user?.sso_enforced && !user.two_factor_provider;
  if (!error) return null;
  if (kind === 'enrollment') return <p role="alert">Set up an authenticator in <Link href="/dashboard/settings">Settings</Link>, then return and review again. Company sign-in remains required.</p>;
  if (kind === 'login') return <div role="alert"><p>Sign in again within the last 15 minutes, then review again.</p>{company
    ? <CompanySignIn returnPath="/dashboard/settings" allowOidc={!user?.auth_methods?.includes('saml')} onSuccess={() => { setStale(false); onRetry(); }} />
    : <Link href="/login?redirect=%2Fdashboard%2Fsettings">Sign in again</Link>}</div>;
  if (kind === 'second_factor') return <div role="alert"><p>Verify your binding factor to continue. Company accounts require fresh company sign-in and a native authenticator code.</p>
    {user?.two_factor_provider ? <button onClick={() => { void startProviderOAuth(user.two_factor_provider!, '/dashboard/settings').catch(() => setProviderFailure(true)); }}>Sign in again with your provider</button>
      : user?.totp_enabled ? <button onClick={() => setOpen(true)}>Verify authenticator code</button> : <Link href="/dashboard/settings">Set up an authenticator</Link>}
    {providerFailure && <p>Provider sign-in could not be started. Try again.</p>}
    <ReauthModal isOpen={open} onClose={() => setOpen(false)} onRecentLoginRequired={() => { setOpen(false); setStale(true); }} onSuccess={async token => { setOpen(false); await onToken(token); }} />
  </div>;
  return <p role="alert">The decision could not be verified. Refresh and review again before submitting.</p>;
}
