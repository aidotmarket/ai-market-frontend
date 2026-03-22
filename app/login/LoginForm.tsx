'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { useToast } from '@/components/Toast';
import { validateRedirect } from '@/lib/redirect';
import { AxiosError } from 'axios';
import OAuthButtons from '@/components/OAuthButtons';
import { requestMagicLink } from '@/api/auth';

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const login = useAuthStore((s) => s.login);
  const { toast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loginMode, setLoginMode] = useState<'password' | 'magic-link'>('password');
  const [magicLinkSentTo, setMagicLinkSentTo] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (loginMode === 'magic-link') {
        await requestMagicLink(email);
        setMagicLinkSentTo(email);
        toast('Magic link sent', 'success');
      } else {
        await login(email, password);
        toast('Logged in successfully', 'success');
        const redirectTo = validateRedirect(searchParams.get('redirect'), '/listings');
        router.push(redirectTo);
      }
    } catch (err) {
      if (err instanceof AxiosError) {
        if (loginMode === 'magic-link') {
          setError(err.response?.status === 429 ? 'Too many requests. Try again in a minute.' : 'Failed to send magic link. Please try again.');
        } else {
          setError(err.response?.data?.detail || 'Login failed. Please check your credentials.');
        }
      } else {
        setError(loginMode === 'magic-link' ? 'Failed to send magic link. Please try again.' : 'An unexpected error occurred.');
      }
    } finally {
      setLoading(false);
    }
  };

  const switchToMagicLink = () => {
    setLoginMode('magic-link');
    setPassword('');
    setError('');
    setMagicLinkSentTo('');
  };

  const switchToPassword = () => {
    setLoginMode('password');
    setError('');
    setMagicLinkSentTo('');
  };

  return (
    <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center px-4">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-center mb-8">Log in to ai.market</h1>

        {searchParams.get('error') === 'oauth_failed' && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-4">
            OAuth sign-in failed. Please try again or use email and password.
          </div>
        )}

        {searchParams.get('redirect')?.includes('/requests/new') && (
          <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700 mb-4">
            We need an account so we can reach out to you with offers that match your requirements. After sign-up, allAI will walk you through submitting a data request to the marketplace.
          </div>
        )}

        <OAuthButtons mode="login" />

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {magicLinkSentTo && loginMode === 'magic-link' && (
            <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
              Check your email — we sent a sign-in link to {magicLinkSentTo}
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
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="••••••••"
                />
              </div>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={switchToMagicLink}
                  className="text-sm text-blue-600 hover:underline"
                >
                  Sign in with a magic link instead
                </button>
                <Link href="/forgot-password" className="text-sm text-blue-600 hover:underline">
                  Forgot your password?
                </Link>
              </div>
            </>
          ) : (
            <div className="text-right">
              <button
                type="button"
                onClick={switchToPassword}
                className="text-sm text-blue-600 hover:underline"
              >
                Use password instead
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (loginMode === 'magic-link' ? 'Sending magic link...' : 'Logging in...') : (loginMode === 'magic-link' ? 'Send magic link' : 'Log in')}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          Don&apos;t have an account?{' '}
          <Link href={searchParams.get('redirect') ? `/register?redirect=${encodeURIComponent(searchParams.get('redirect')!)}` : '/register'} className="text-blue-600 hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
