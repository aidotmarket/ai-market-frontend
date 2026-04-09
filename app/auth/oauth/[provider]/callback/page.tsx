'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';

export default function OAuthCallbackPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const oauthLogin = useAuthStore((s) => s.oauthLogin);
  const [error] = useState('');
  const calledRef = useRef(false);

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    const provider = params.provider as string;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const nonce = sessionStorage.getItem('oauth_nonce');
    sessionStorage.removeItem('oauth_nonce');

    if (!code || !state || !nonce) {
      router.replace('/login?error=oauth_failed');
      return;
    }

    oauthLogin(provider, code, state, nonce)
      .then(() => {
        router.replace('/listings');
      })
      .catch(() => {
        router.replace('/login?error=oauth_failed');
      });
  }, [params.provider, searchParams, router, oauthLogin]);

  if (error) {
    return (
      <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center px-4">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <a href="/login" className="text-[#3F51B5] hover:underline">Back to login</a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center px-4">
      <div className="text-center">
        <svg className="animate-spin h-8 w-8 text-[#3F51B5] mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <p className="text-sm text-gray-600">Completing sign in...</p>
      </div>
    </div>
  );
}
