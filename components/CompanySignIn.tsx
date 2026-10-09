'use client';

import { useState } from 'react';
import { checkCompanySignIn, COMPANY_SIGN_IN_ERROR, startCompanySignIn } from '@/lib/company-sign-in';

export default function CompanySignIn({ returnPath, onSuccess, allowOidc = true }: { returnPath: string; onSuccess: () => void | Promise<void>; allowOidc?: boolean }) {
  const [slug, setSlug] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <div className="space-y-3">
    {allowOidc && <>
    <label className="block">Company sign-in ID <input autoComplete="off" value={slug} disabled={busy} onChange={event => setSlug(event.target.value)} /></label>
    <p>Use the company ID from your administrator. Sign-in opens in a new window. If it fails, close that window and try again.</p>
    <button disabled={busy || !slug.trim()} onClick={async () => {
      setBusy(true); setError('');
      try { await startCompanySignIn(slug, returnPath); await onSuccess(); }
      catch (cause) { setError(cause instanceof Error ? cause.message : COMPANY_SIGN_IN_ERROR); }
      finally { setBusy(false); }
    }}>{busy ? 'Waiting for company sign-in...' : error ? 'Retry company sign-in' : 'Sign in through your company'}</button>
    </>}
    <p>Sign in through your company within the last 15 minutes, then return here and check this page.</p>
    <button disabled={busy} onClick={async () => {
      setBusy(true); setError('');
      try { await checkCompanySignIn(); await onSuccess(); }
      catch (cause) { setError(cause instanceof Error ? cause.message : COMPANY_SIGN_IN_ERROR); }
      finally { setBusy(false); }
    }}>Check company sign-in</button>
    {error && <p role="alert">{error}</p>}
  </div>;
}
