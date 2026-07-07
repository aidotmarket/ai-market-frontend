'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import TermsAcceptanceForm from '@/components/legal/TermsAcceptanceForm';
import { getTermsPartyContext } from '@/components/legal/termsContext';
import { useAuthStore } from '@/store/auth';
import { validateRedirect } from '@/lib/redirect';

export default function TermsAcceptClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAuthenticated, isLoading, hydrated } = useAuthStore();
  const context = getTermsPartyContext(user);
  const redirectTo = validateRedirect(searchParams.get('redirect'), '/dashboard');

  if (isLoading || !hydrated) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#3F51B5] border-t-transparent"></div>
      </div>
    );
  }

  if (!isAuthenticated || !context) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-bold text-gray-900">Sign in to accept terms</h1>
        <p className="mt-3 text-sm leading-6 text-gray-600">
          You need an ai.market account before we can record your electronic signature.
        </p>
        <Link
          href={`/login?redirect=${encodeURIComponent('/legal/terms/accept')}`}
          className="mt-6 inline-flex rounded-lg bg-[#3F51B5] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#3545a0]"
        >
          Log in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-12 lg:py-16">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Accept Terms and Conditions</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-600">
          Complete the required acknowledgements and electronic signature before trading on ai.market.
        </p>
      </div>
      <TermsAcceptanceForm context={context} onAccepted={() => router.push(redirectTo)} />
    </div>
  );
}
