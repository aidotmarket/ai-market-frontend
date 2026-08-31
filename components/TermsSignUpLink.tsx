'use client';

import type { MouseEventHandler } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { validateListingRedirect } from '@/lib/redirect';

interface TermsSignUpLinkProps {
  className: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}

export function TermsSignUpLink({ className, onClick }: TermsSignUpLinkProps) {
  const searchParams = useSearchParams();
  const listingRedirect = validateListingRedirect(searchParams.get('redirect'));
  const href = listingRedirect
    ? `/register?redirect=${encodeURIComponent(listingRedirect)}`
    : '/register';

  return (
    <Link href={href} className={className} onClick={onClick}>
      Sign up
    </Link>
  );
}
