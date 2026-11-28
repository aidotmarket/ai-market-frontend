'use client';

import { useLayoutEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import DefaultGlobalError from 'next/dist/client/components/builtin/global-error';
import { reportSellerWorkspaceCrash } from '@/lib/seller-workspace-crash';
import { getRootSellerCrashAccess } from '@/lib/seller-workspace-crash-access';

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  const pathname = usePathname();
  const handled = useRef(false);

  useLayoutEffect(() => {
    const getCrashProof = getRootSellerCrashAccess(pathname);
    if (handled.current) return;
    handled.current = true;
    if (getCrashProof) {
      void reportSellerWorkspaceCrash('root', error, getCrashProof);
    }
  }, [error, pathname]);

  // Keep the fallback UI owned by the lockfile-pinned Next renderer.
  return <DefaultGlobalError error={error} />;
}
