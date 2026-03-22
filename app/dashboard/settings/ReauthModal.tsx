'use client';

import { useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { generateReauthToken, submitReauth } from '@/api/auth';

interface ReauthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (reauthToken: string) => void | Promise<void>;
}

function getReauthErrorMessage(error: unknown): string {
  if (!(error instanceof AxiosError)) {
    return 'Failed to verify the re-authentication code.';
  }

  if (error.response?.status === 429) {
    return 'Too many attempts. Wait a moment before trying again.';
  }

  const detail = error.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim().length > 0) {
    return detail;
  }

  return 'Failed to verify the re-authentication code.';
}

export default function ReauthModal({ isOpen, onClose, onSuccess }: ReauthModalProps) {
  const [code, setCode] = useState('');
  const [loadingChallenge, setLoadingChallenge] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [challengeSent, setChallengeSent] = useState(false);
  const [error, setError] = useState('');

  const requestChallenge = async () => {
    setLoadingChallenge(true);
    setError('');

    try {
      await generateReauthToken();
      setChallengeSent(true);
    } catch (error) {
      setChallengeSent(false);
      setError(getReauthErrorMessage(error));
    } finally {
      setLoadingChallenge(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      setCode('');
      setError('');
      setChallengeSent(false);
      setLoadingChallenge(false);
      setSubmitting(false);
      return;
    }

    void requestChallenge();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');

    try {
      const result = await submitReauth(code.trim());
      await onSuccess(result.reauth_token);
      setCode('');
    } catch (error) {
      setError(getReauthErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Re-authenticate</h2>
            <p className="mt-1 text-sm text-gray-500">
              Enter the verification code from your email or authenticator app to continue.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loadingChallenge || submitting}
            className="rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 disabled:opacity-50"
            aria-label="Close re-authentication dialog"
          >
            Close
          </button>
        </div>

        <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          {loadingChallenge
            ? 'Sending verification challenge...'
            : challengeSent
              ? 'Verification challenge sent. Use the latest code to continue.'
              : 'Unable to start the verification challenge.'}
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-4">
          <label htmlFor="reauthCode" className="block text-sm font-medium text-gray-700 mb-1">
            Verification code
          </label>
          <input
            id="reauthCode"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={8}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\s/g, ''))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter code"
          />
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <button
            type="button"
            onClick={requestChallenge}
            disabled={loadingChallenge || submitting}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {loadingChallenge ? 'Sending...' : challengeSent ? 'Resend code' : 'Try again'}
          </button>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loadingChallenge || submitting}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loadingChallenge || submitting || code.trim().length === 0}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Verifying...' : 'Continue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
