'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';

let deferredClearTimer: number | null = null;

export function getTwoFactorRemainingMs(expiresAt: number, now = Date.now()): number {
  return Math.max(0, expiresAt - now);
}

export function formatTwoFactorRemaining(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

interface TwoFactorChallengeProps {
  onVerified?: () => void;
}

export default function TwoFactorChallenge({ onVerified }: TwoFactorChallengeProps) {
  const router = useRouter();
  const pendingTwoFactor = useAuthStore((s) => s.pendingTwoFactor);
  const verifyTwoFactor = useAuthStore((s) => s.verifyTwoFactor);
  const clearPendingTwoFactor = useAuthStore((s) => s.clearPendingTwoFactor);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const remainingMs = useMemo(
    () => (pendingTwoFactor ? getTwoFactorRemainingMs(pendingTwoFactor.expiresAt, now) : 0),
    [now, pendingTwoFactor]
  );
  const isExpired = remainingMs === 0;

  useEffect(() => {
    if (deferredClearTimer !== null) {
      window.clearTimeout(deferredClearTimer);
      deferredClearTimer = null;
    }

    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    const clearChallenge = () => {
      clearPendingTwoFactor();
    };

    window.addEventListener('popstate', clearChallenge);
    window.addEventListener('pagehide', clearChallenge);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('popstate', clearChallenge);
      window.removeEventListener('pagehide', clearChallenge);
      deferredClearTimer = window.setTimeout(() => {
        clearPendingTwoFactor();
        deferredClearTimer = null;
      }, 0);
    };
  }, [clearPendingTwoFactor]);

  useEffect(() => {
    if (!pendingTwoFactor) {
      return;
    }

    if (isExpired) {
      clearPendingTwoFactor();
      router.replace('/login?error=two_factor_expired');
    }
  }, [clearPendingTwoFactor, isExpired, pendingTwoFactor, router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    const trimmedCode = code.trim();
    if (!trimmedCode || isExpired) {
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await verifyTwoFactor(trimmedCode);

      if (result.ok) {
        onVerified?.();
        return;
      }

      if (result.reason === 'invalid_code') {
        setError('Invalid verification code');
      } else {
        router.replace('/login?error=two_factor_expired');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!pendingTwoFactor) {
    return null;
  }

  return (
    <div className="w-full max-w-md">
      <h1 className="text-2xl font-bold text-center mb-3">Two-factor authentication</h1>
      <p className="text-sm text-gray-600 text-center mb-6">
        Enter the 6-digit code from your authenticator app, or use a backup code.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="twoFactorCode" className="block text-sm font-medium text-gray-700">
              Verification code
            </label>
            <span className="text-xs font-medium text-gray-500" aria-live="polite">
              {formatTwoFactorRemaining(remainingMs)}
            </span>
          </div>
          <input
            id="twoFactorCode"
            type="text"
            inputMode="text"
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
              setError('');
            }}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3F51B5] focus:border-transparent"
            placeholder="123456 or backup code"
            disabled={isSubmitting || isExpired}
          />
          <p className="mt-2 text-xs text-gray-500">
            Backup codes work in this same field.
          </p>
        </div>

        <button
          type="submit"
          disabled={isSubmitting || isExpired || !code.trim()}
          className="w-full rounded-lg bg-[#3F51B5] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#3545a0] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Verifying...' : 'Verify and continue'}
        </button>
      </form>
    </div>
  );
}
