"use client";
import { usePathname } from 'next/navigation';
import { Providers } from '@/components/Providers';
import { Layout } from '@/components/Layout';
import { AllAIProvider } from '@/components/allai/AllAIContext';
import AllAIFab from '@/components/allai/AllAIFab';
import AllAIPanel from '@/components/allai/AllAIPanel';

// Mailbox consumption has no allAI/history/analytics widgets. The normal tree
// is preserved for every other route; auth uses its existing store directly.
export function SupportPrivateBoundary({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  if (path === null || path.replace(/\/$/, '') === '/support/mailbox-account') return <>{children}</>;
  return <Providers><AllAIProvider><Layout>{children}</Layout><AllAIFab /><AllAIPanel /></AllAIProvider></Providers>;
}
