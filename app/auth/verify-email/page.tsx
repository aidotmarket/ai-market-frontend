'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { verifyEmail } from '@/api/auth';

function VerifyEmailInner() {
  const params = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setState('error');
      setMessage('This verification link is missing its token.');
      return;
    }
    verifyEmail(token)
      .then((r) => {
        setState('success');
        setMessage(r?.message || 'Your email is verified.');
      })
      .catch(() => {
        setState('error');
        setMessage('This link is invalid or has expired. Please request a new one from the sign-in page.');
      });
  }, [token]);

  return (
    <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md text-center">
        <h1 className="text-2xl font-bold mb-6">Email verification</h1>
        {state === 'loading' && <p className="text-gray-600">Verifying your email...</p>}
        {state === 'success' && (
          <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-6 text-sm text-green-700">
            <p className="font-medium mb-2">You&apos;re verified</p>
            <p>{message}</p>
            <Link href="/login" className="mt-4 inline-block font-medium underline">Sign in</Link>
          </div>
        )}
        {state === 'error' && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-6 text-sm text-red-700">
            <p>{message}</p>
            <Link href="/login" className="mt-4 inline-block font-medium underline">Back to sign in</Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailInner />
    </Suspense>
  );
}
