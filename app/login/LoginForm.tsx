'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { useToast } from '@/components/Toast';
import { aimDataEnabled, resumeAuthContinuation, readContinuation, requestPath, connectorEnabled, readConnectorContinuation, connectorRequestPath, initiateConnectorContinuation } from '@/lib/aim-data-continuation';
import { AxiosError } from 'axios';
import OAuthButtons, { startProviderOAuth } from '@/components/OAuthButtons';
import TwoFactorChallenge from '@/components/TwoFactorChallenge';
import { requestMagicLink, resendVerification } from '@/api/auth';
import { getConnectorStatus } from '@/api/connector-oauth';
import { saveRequestAuthReturn } from '@/lib/request-auth-return';
import { PENDING_ACTION_CONTINUATION } from '@/lib/redirect';

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const login = useAuthStore((s) => s.login);
  const pendingTwoFactor = useAuthStore((s) => s.pendingTwoFactor);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hydrated = useAuthStore((s) => s.hydrated);
  const { toast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loginMode, setLoginMode] = useState<'password' | 'magic-link'>('password');
  const [magicLinkRequestedFor, setMagicLinkRequestedFor] = useState('');
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendNote, setResendNote] = useState('');
  const [connectorStatusLoaded, setConnectorStatusLoaded] = useState(false);

  const autoStarted = useRef(false);
  const providerHint = searchParams.get('provider');
  const awaitingProviderHydration = !hydrated && (providerHint === 'google' || providerHint === 'github');

  useEffect(() => {
    getConnectorStatus().catch(() => false).finally(() => setConnectorStatusLoaded(true));
  }, []);

  useEffect(() => {
    initiateConnectorContinuation(searchParams.get('redirect'));
  }, [connectorStatusLoaded, searchParams]);

  useEffect(() => {
    const provider = searchParams.get('provider');
    const connector = connectorStatusLoaded && connectorEnabled() && readConnectorContinuation();
    const connectorLogin = connector && searchParams.get('redirect') === connectorRequestPath(connector.request);
    if (!(aimDataEnabled() && readContinuation() || connectorLogin) || !hydrated || isAuthenticated || autoStarted.current
      || (provider !== 'google' && provider !== 'github')
      ) return;
    autoStarted.current = true;
    startProviderOAuth(provider, searchParams.get('redirect')).catch(() => {
      setError(`Failed to connect to ${provider === 'google' ? 'Google' : 'GitHub'}. Please try again.`);
    });
  }, [connectorStatusLoaded, hydrated, isAuthenticated, searchParams]);

  useEffect(() => {
    if (!hydrated || !isAuthenticated || (!connectorStatusLoaded && !(aimDataEnabled() && readContinuation()))) return;
    if (searchParams.get('reauth') === 'aim-data' && readContinuation()) return;
    if (searchParams.get('reauth') === 'connector' && readConnectorContinuation()) return;
    if (searchParams.get('reauth') === 'pending-action' && PENDING_ACTION_CONTINUATION.test(searchParams.get('redirect') || '')) return;

    const redirectTo = resumeAuthContinuation(searchParams.get('redirect'), '/dashboard');
    router.replace(redirectTo);
  }, [connectorStatusLoaded, hydrated, isAuthenticated, router, searchParams]);

  useEffect(() => {
    const visible = async () => {
      if (document.visibilityState !== 'visible' || useAuthStore.getState().pendingTwoFactor) return;
      const aimSaved = aimDataEnabled() && readContinuation();
      if (!aimSaved) await getConnectorStatus().catch(() => false);
      const connector = connectorEnabled() && readConnectorContinuation();
      const connectorLogin = connector && searchParams.get('redirect') === connectorRequestPath(connector.request);
      if (!aimSaved && !connectorLogin) return;
      await useAuthStore.getState().hydrate();
      if (aimSaved && useAuthStore.getState().isAuthenticated) router.replace(requestPath(aimSaved.request));
      else if (connectorLogin && useAuthStore.getState().isAuthenticated) router.replace(connectorRequestPath(connector.request));
    };
    document.addEventListener('visibilitychange', visible);
    return () => document.removeEventListener('visibilitychange', visible);
  }, [router, searchParams]);

  const handleResendVerification = async () => {
    setResendNote('');
    try {
      await resendVerification(email);
      setResendNote(`We sent a new verification link to ${email}.`);
    } catch {
      setResendNote('Could not resend right now. Please try again shortly.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (loginMode === 'magic-link') {
        setMagicLinkRequestedFor('');
        saveRequestAuthReturn('email', searchParams.get('redirect'));
        await requestMagicLink(email, 'register');
        setMagicLinkRequestedFor(email);
        toast('Email link requested', 'success');
      } else {
        const result = await login(email, password);
        if (result.requiresTwoFactor) {
          return;
        }
        toast('Logged in successfully', 'success');
        if (!(aimDataEnabled() && readContinuation())) await getConnectorStatus().catch(() => false);
        const redirectTo = resumeAuthContinuation(searchParams.get('redirect'), '/listings');
        router.push(redirectTo);
      }
    } catch (err) {
      if (err instanceof AxiosError) {
        if (loginMode === 'magic-link') {
          setError(err.response?.status === 429 ? 'Too many requests. Try again in a minute.' : 'Could not request an email link. Please try again.');
        } else {
          const detail = err.response?.data?.detail as unknown;
          if (detail && typeof detail === 'object' && (detail as { email_verification_required?: boolean }).email_verification_required) {
            setNeedsVerification(true);
          } else {
            setError(typeof detail === 'string' ? detail : 'Login failed. Please check your credentials.');
          }
        }
      } else {
        setError(loginMode === 'magic-link' ? 'Could not request an email link. Please try again.' : 'An unexpected error occurred.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleTwoFactorVerified = async () => {
    toast('Logged in successfully', 'success');
    if (!(aimDataEnabled() && readContinuation())) await getConnectorStatus().catch(() => false);
    const redirectTo = resumeAuthContinuation(searchParams.get('redirect'), '/listings');
    router.push(redirectTo);
  };

  const switchToMagicLink = () => {
    setLoginMode('magic-link');
    setPassword('');
    setError('');
    setMagicLinkRequestedFor('');
  };

  const switchToPassword = () => {
    setLoginMode('password');
    setError('');
    setMagicLinkRequestedFor('');
  };

  return (
    <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center px-4">
      <div className="w-full max-w-md">
        {pendingTwoFactor ? (
          <TwoFactorChallenge onVerified={handleTwoFactorVerified} />
        ) : (
          <>
        <h1 className="text-2xl font-bold text-center mb-8">Log in to ai.market</h1>

        {searchParams.get('error') === 'oauth_failed' && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-4">
            OAuth sign-in failed. Please try again or use email and password.
          </div>
        )}

        {searchParams.get('error') === 'two_factor_expired' && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-4">
            Your two-factor session expired. Please sign in again.
          </div>
        )}

        {searchParams.get('redirect')?.includes('/requests/new') && (
          <div className="rounded-lg bg-[#E8EAF6] border border-[#C5CAE9] px-4 py-3 text-sm text-[#3F51B5] mb-4">
            We need an account so we can reach out to you with offers that match your requirements. After sign-up, allAI will walk you through submitting a data request to the marketplace.
          </div>
        )}

        {awaitingProviderHydration ? <p role="status">Preparing sign-in…</p> : <OAuthButtons mode="login" redirect={searchParams.get('redirect')} />}

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {needsVerification && (
            <div className="rounded-lg bg-[#E8EAF6] border border-[#C5CAE9] px-4 py-3 text-sm text-[#3F51B5]">
              <p>Please verify your email before signing in. We sent a link to {email}.</p>
              <button type="button" onClick={handleResendVerification} className="mt-2 font-medium underline">
                Resend verification email
              </button>
              {resendNote && <p className="mt-2 text-green-700">{resendNote}</p>}
            </div>
          )}

          {magicLinkRequestedFor && loginMode === 'magic-link' && (
            <div role="status" className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
              Email link requested for {magicLinkRequestedFor}. Check your inbox and spam folder. If it does not arrive, try again or continue with Google.
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3F51B5] focus:border-transparent"
              placeholder="you@company.com"
            />
          </div>

          {loginMode === 'password' ? (
            <>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3F51B5] focus:border-transparent"
                  placeholder="••••••••"
                />
              </div>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={switchToMagicLink}
                  className="text-sm text-[#3F51B5] hover:underline"
                >
                  Sign in or sign up with email
                </button>
                <Link href="/forgot-password" className="text-sm text-[#3F51B5] hover:underline">
                  Forgot your password?
                </Link>
              </div>
            </>
          ) : (
            <div>
              <p className="text-sm text-gray-600 mb-2">Use an email link to sign in or create an account. New accounts are created only after you verify the link.</p>
              <button
                type="button"
                onClick={switchToPassword}
                className="text-sm text-[#3F51B5] hover:underline"
              >
                Use password instead
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[#3F51B5] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#3545a0] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (loginMode === 'magic-link' ? 'Requesting email link...' : 'Logging in...') : (loginMode === 'magic-link' ? 'Send email link' : 'Log in')}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          Don&apos;t have an account?{' '}
          <Link href={searchParams.get('redirect') ? `/register?redirect=${encodeURIComponent(searchParams.get('redirect')!)}` : '/register'} className="text-[#3F51B5] hover:underline">
            Sign up
          </Link>
        </p>
          </>
        )}
      </div>
    </div>
  );
}
