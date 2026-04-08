'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AxiosError } from 'axios';
import { resetPassword } from '@/api/auth';
import { useToast } from '@/components/Toast';

export default function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token) {
      setError('This reset link is invalid or incomplete. Request a new one.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const res = await resetPassword(token, password);
      setSuccessMessage(res.message);
      toast(res.message, 'success');
    } catch (err) {
      const message =
        err instanceof AxiosError
          ? err.response?.data?.message || err.response?.data?.detail || 'This reset link is invalid or has expired.'
          : 'This reset link is invalid or has expired.';
      setError(message);
      toast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center px-4">
      <div className="w-full max-w-md">
        <h1 className="mb-8 text-center text-2xl font-bold text-gray-900">Choose a new password</h1>

        {successMessage ? (
          <div className="space-y-4 rounded-lg border border-green-200 bg-green-50 px-4 py-5 text-sm text-green-800">
            <p>{successMessage}</p>
            <Link href="/login" className="inline-block text-[#3F51B5] hover:underline">
              Continue to login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}{' '}
                <Link href="/forgot-password" className="text-[#3F51B5] hover:underline">
                  Request a new reset link
                </Link>
              </div>
            )}

            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-700">
                New password
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#3F51B5]"
                placeholder="At least 8 characters"
              />
            </div>

            <div>
              <label htmlFor="confirm-password" className="mb-1 block text-sm font-medium text-gray-700">
                Confirm new password
              </label>
              <input
                id="confirm-password"
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#3F51B5]"
                placeholder="Repeat your new password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-[#3F51B5] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#3545a0] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Resetting password...' : 'Reset password'}
            </button>

            <p className="text-center text-sm text-gray-500">
              Need a different link?{' '}
              <Link href="/forgot-password" className="text-[#3F51B5] hover:underline">
                Request another reset email
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
