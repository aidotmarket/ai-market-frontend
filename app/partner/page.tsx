'use client';

import Link from 'next/link';
import { useAuthStore } from '@/store/auth';

export default function PartnerPage() {
  const { isAuthenticated } = useAuthStore();

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
      <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
        Become a Data Partner
      </h1>
      <p className="mt-4 text-lg text-gray-600">
        List your datasets on ai.market and get discovered by AI agents worldwide.
      </p>

      <div className="mt-10 rounded-xl border border-gray-200 p-8">
        {isAuthenticated ? (
          <div>
            <p className="text-gray-900 font-medium">You&apos;re signed in.</p>
            <p className="mt-2 text-gray-600">
              Contact us at{' '}
              <a href="mailto:support@ai.market" className="text-[#3F51B5] hover:text-[#303F9F] font-medium">
                support@ai.market
              </a>{' '}
              to start listing your data.
            </p>
          </div>
        ) : (
          <div>
            <p className="text-gray-900 font-medium">Create an account to get started</p>
            <div className="mt-4 flex flex-col sm:flex-row gap-4">
              <Link
                href="/register"
                className="inline-flex items-center justify-center rounded-lg bg-[#3F51B5] px-6 py-3 text-sm font-medium text-white hover:bg-[#3545a0] transition-colors"
              >
                Sign Up
              </Link>
            </div>
            <p className="mt-4 text-sm text-gray-500">
              Already have questions? Email{' '}
              <a href="mailto:support@ai.market" className="text-[#3F51B5] hover:text-[#303F9F]">
                support@ai.market
              </a>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
