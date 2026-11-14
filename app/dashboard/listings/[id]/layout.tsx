import type { ReactNode } from 'react';

export const dynamic = 'force-dynamic';

export default function PrivateOwnerLayout({ children }: { children: ReactNode }) {
  return children;
}
