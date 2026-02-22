'use client';

import { ProtectedRoute } from '@/components/ProtectedRoute';

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <div className="mx-auto max-w-7xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold mb-2">Dashboard</h1>
        <p className="text-gray-500">Coming soon.</p>
      </div>
    </ProtectedRoute>
  );
}
