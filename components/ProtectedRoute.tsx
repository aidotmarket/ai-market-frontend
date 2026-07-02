'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const hydrated = useAuthStore((s) => s.hydrated);
  const router = useRouter();

  useEffect(() => {
    if (isLoading || !hydrated) return;

    if (!isAuthenticated) {
      router.replace('/login');
    }
  }, [hydrated, isAuthenticated, isLoading, router]);

  if (isLoading || !hydrated || !isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
