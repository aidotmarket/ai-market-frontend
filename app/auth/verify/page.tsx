'use client';

import { Suspense, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/auth';

function MagicLinkVerifyContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const magicLinkVerify = useAuthStore((s) => s.magicLinkVerify);
  const calledRef = useRef(false);

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    const token = searchParams.get('token');
    const purpose = searchParams.get('purpose');

    void purpose;

    if (!token) {
      router.replace('/login?error=invalid_link');
      return;
    }

    magicLinkVerify(token)
      .then(() => {
        router.replace('/listings');
      })
      .catch(() => {
        router.replace('/login?error=magic_link_failed');
      });
  }, [searchParams, router, magicLinkVerify]);

  return (
    <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center px-4">
      <div className="text-center">
        <svg className="animate-spin h-8 w-8 text-blue-600 mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <p className="text-sm text-gray-600">Completing sign in...</p>
      </div>
    </div>
  );
}

export default function MagicLinkVerifyPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <MagicLinkVerifyContent />
    </Suspense>
  );
}
