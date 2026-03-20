'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AxiosError } from 'axios';
import { forgotPassword } from '@/api/auth';
import { useToast } from '@/components/Toast';

export default function ForgotPasswordPage() {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await forgotPassword(email);
      setMessage(res.message);
      setSubmitted(true);
      toast(res.message, 'success');
    } catch (err) {
      const fallbackMessage = 'If an account exists for that email, a reset link has been sent.';
      if (err instanceof AxiosError) {
        setMessage(err.response?.data?.message || fallbackMessage);
      } else {
        setMessage(fallbackMessage);
      }
      setSubmitted(true);
      toast(fallbackMessage, 'success');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center px-4">
      <div className="w-full max-w-md">
        <h1 className="mb-8 text-center text-2xl font-bold text-gray-900">Reset your password</h1>

        {submitted ? (
          <div className="space-y-4 rounded-lg border border-green-200 bg-green-50 px-4 py-5 text-sm text-green-800">
            <p>{message || 'If an account exists for that email, a reset link has been sent.'}</p>
            <Link href="/login" className="inline-block text-blue-600 hover:underline">
              Back to login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="you@company.com"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Sending reset link...' : 'Send reset link'}
            </button>

            <p className="text-center text-sm text-gray-500">
              Remembered your password?{' '}
              <Link href="/login" className="text-blue-600 hover:underline">
                Back to login
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
