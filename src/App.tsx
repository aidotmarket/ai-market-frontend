import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { ToastProvider } from '@/components/Toast';
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { BrowseListingsPage } from '@/pages/BrowseListingsPage';
import { ListingDetailPage } from '@/pages/ListingDetailPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { useAuthStore } from '@/store/auth';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
    },
  },
});

function AuthHydrator({ children }: { children: React.ReactNode }) {
  const hydrate = useAuthStore((s) => s.hydrate);
  useEffect(() => {
    hydrate();
  }, [hydrate]);
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <AuthHydrator>
            <Routes>
              <Route element={<Layout />}>
                {/* Public routes */}
                <Route index element={<Navigate to="/listings" replace />} />
                <Route path="login" element={<LoginPage />} />
                <Route path="register" element={<RegisterPage />} />
                <Route path="listings" element={<BrowseListingsPage />} />
                <Route path="listings/:id" element={<ListingDetailPage />} />

                {/* Protected routes (placeholder for future BQs) */}
                <Route
                  path="dashboard"
                  element={
                    <ProtectedRoute>
                      <div className="mx-auto max-w-7xl px-4 py-16 text-center">
                        <h1 className="text-2xl font-bold mb-2">Dashboard</h1>
                        <p className="text-gray-500">Coming soon.</p>
                      </div>
                    </ProtectedRoute>
                  }
                />

                {/* 404 */}
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </AuthHydrator>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
