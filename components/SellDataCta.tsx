'use client';

import Link from 'next/link';
import { useAuthStore } from '@/store/auth';

type SellDataCtaProps = {
  variant: 'hero' | 'inline' | 'final';
  className?: string;
};

const greenPrimaryClassName =
  'inline-flex items-center justify-center rounded-lg bg-[#0F6E56] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0c5a47] focus:outline-none focus:ring-2 focus:ring-[#0F6E56] focus:ring-offset-2';
const greenSecondaryClassName =
  'inline-flex items-center justify-center rounded-lg border border-[#0F6E56] px-5 py-3 text-sm font-semibold text-[#0F6E56] transition-colors hover:bg-[#E1F5EE] focus:outline-none focus:ring-2 focus:ring-[#0F6E56] focus:ring-offset-2';
const inlineLinkClassName =
  'inline-flex items-center justify-center rounded-lg border border-[#3F51B5] px-5 py-3 text-sm font-semibold text-[#3F51B5] transition-colors hover:bg-[#E8EAF6] focus:outline-none focus:ring-2 focus:ring-[#3F51B5] focus:ring-offset-2';
const signedOutInlineClassName = `mt-6 ${inlineLinkClassName}`;

function withClassName(baseClassName: string, className?: string) {
  return className ? `${baseClassName} ${className}` : baseClassName;
}

function AuthenticatedCtas({
  primaryClassName,
  secondaryClassName = greenSecondaryClassName,
}: {
  primaryClassName: string;
  secondaryClassName?: string;
}) {
  return (
    <>
      <Link href="/aim-data" className={primaryClassName}>
        Set up AIM Data
      </Link>
      <Link href="/dashboard/listings" className={secondaryClassName}>
        Your listings
      </Link>
    </>
  );
}

export default function SellDataCta({ variant, className }: SellDataCtaProps) {
  const { isAuthenticated } = useAuthStore();

  if (variant === 'hero') {
    return (
      <div className={withClassName('mt-8 flex flex-col gap-4 sm:flex-row sm:items-center', className)}>
        {isAuthenticated ? (
          <AuthenticatedCtas primaryClassName={greenPrimaryClassName} />
        ) : (
          <Link href="/register" className={greenPrimaryClassName}>
            Create Your Account
          </Link>
        )}
        <Link href="#how-it-works" className={greenSecondaryClassName}>
          How it works
        </Link>
      </div>
    );
  }

  if (variant === 'final') {
    return (
      <div className={withClassName('rounded-2xl border border-[#D8EEE6] bg-white p-6 shadow-sm sm:p-8', className)}>
        <h2 id="final-cta-heading" className="text-2xl font-bold tracking-tight text-gray-900">
          {isAuthenticated ? 'List your data' : 'Create Your Account'}
        </h2>
        <p className="mt-4 max-w-3xl text-base leading-7 text-gray-600">
          {isAuthenticated
            ? 'Install AIM Data on your infrastructure, review what it writes, and publish.'
            : 'Start as a seller. List free and pay nothing until a sale clears.'}
        </p>
        {isAuthenticated ? (
          <div className="mt-6 flex flex-wrap gap-3">
            <AuthenticatedCtas primaryClassName={greenPrimaryClassName} />
          </div>
        ) : (
          <Link href="/register" className="mt-6 inline-flex items-center justify-center rounded-lg bg-[#0F6E56] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0c5a47] focus:outline-none focus:ring-2 focus:ring-[#0F6E56] focus:ring-offset-2">
            Create Your Account
          </Link>
        )}
      </div>
    );
  }

  if (isAuthenticated) {
    return (
      <div className={withClassName('mt-6 flex flex-wrap gap-3', className)}>
        <AuthenticatedCtas
          primaryClassName={inlineLinkClassName}
          secondaryClassName={inlineLinkClassName}
        />
      </div>
    );
  }

  return (
    <Link href="/register" className={withClassName(signedOutInlineClassName, className)}>
      Create Your Account
    </Link>
  );
}
