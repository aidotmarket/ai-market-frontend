'use client';

import { useContext, useLayoutEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import DefaultGlobalError from 'next/dist/client/components/builtin/global-error';
import { isSellerWorkspacePath, reportSellerWorkspaceCrash, SellerWorkspaceCrashAccess } from '@/lib/seller-workspace-crash';

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  const pathname = usePathname();
  const workspace = isSellerWorkspacePath(pathname);
  const getCrashToken = useContext(SellerWorkspaceCrashAccess);
  const handled = useRef(false);

  useLayoutEffect(() => {
    if (handled.current) return;
    handled.current = true;
    if (getCrashToken && workspace && isSellerWorkspacePath(pathname)) {
      void reportSellerWorkspaceCrash('root', error, getCrashToken);
    }
  }, [error, getCrashToken, pathname, workspace]);

  if (!workspace) return <DefaultGlobalError error={error} />;

  return (
    <html lang="en">
      <body>
        <main style={{ padding: '2rem', textAlign: 'center' }}>
          <h1>Something went wrong in Seller Workspace</h1>
          <p>Reload the page to continue from your last saved changes.</p>
          <button type="button" onClick={() => window.location.reload()}>Reload page</button>
        </main>
      </body>
    </html>
  );
}
