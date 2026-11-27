"use client";
import { useLayoutEffect } from 'react';
import {useHandoffBoundary} from '@/lib/vectoraizHandoff';
import { discardRootSellerCrashAccessOutside } from '@/lib/seller-workspace-crash-access';
import { usePathname } from 'next/navigation';
import { PendingProfileChanges } from '@/components/PendingProfileChanges';
import { Providers } from '@/components/Providers';
import { Layout } from '@/components/Layout';
import { AllAIProvider } from '@/components/allai/AllAIContext';
import AllAIFab from '@/components/allai/AllAIFab';
import AllAIPanel from '@/components/allai/AllAIPanel';

// Mailbox consumption has no allAI/history/analytics widgets. The normal tree
// is preserved for every other route; auth uses its existing store directly.
export function SupportPrivateBoundary({ children }: { children: React.ReactNode }) {
  useHandoffBoundary();
  const path = usePathname();
  useLayoutEffect(() => { discardRootSellerCrashAccessOutside(path); }, [path]);
  const route = path?.replace(/\/$/, '');
  if (path === null || route === '/support/mailbox-account') return <>{children}</>;
  const dockOnDesktop = route === '/support' || route === '/pricing' || route === '/sell-data';
  return (
    <Providers>
      <AllAIProvider>
        <Layout><PendingProfileChanges />{children}</Layout>
        <AllAIFab />
        <AllAIPanel dockOnDesktop={dockOnDesktop} />
      </AllAIProvider>
    </Providers>
  );
}
