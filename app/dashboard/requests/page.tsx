'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth';
import { getMyDataRequestsPage, type MyDataRequestsPage as RequestsPage } from '@/api/data-requests';
import { formatDate } from '@/lib/format';
import { AxiosError } from 'axios';
import type { DataRequestStatus, DataRequestUrgency } from '@/types';

const STATUS_BADGE: Record<DataRequestStatus, { css: string; label: string }> = {
  draft: { css: 'bg-gray-100 text-gray-600', label: 'Draft' },
  open: { css: 'bg-green-100 text-green-800', label: 'Open' },
  matched: { css: 'bg-emerald-100 text-emerald-700', label: 'Matched' },
  responses_received: { css: 'bg-[#E8EAF6] text-[#303F9F]', label: 'Responses received' },
  fulfilled: { css: 'bg-purple-100 text-purple-800', label: 'Fulfilled' },
  closed: { css: 'bg-gray-100 text-gray-600', label: 'Closed' },
  expired: { css: 'bg-red-100 text-red-700', label: 'Expired' },
};

const URGENCY_BADGE: Record<DataRequestUrgency, string> = {
  low: 'bg-gray-100 text-gray-700',
  normal: 'bg-[#E8EAF6] text-[#3F51B5]',
  high: 'bg-amber-100 text-amber-800',
  urgent: 'bg-red-100 text-red-800',
};

function statusBadge(status: DataRequestStatus) {
  const s = STATUS_BADGE[status] || { css: 'bg-gray-100 text-gray-600', label: status };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${s.css}`}>
      {s.label}
    </span>
  );
}

export default function MyDataRequestsPage() {
  const { isAuthenticated, user } = useAuthStore();
  // Remount the controller on identity changes, clearing records and returning to page 1.
  if (!isAuthenticated || !user?.id) return null;
  return <OwnedRequests key={user.id} />;
}

function OwnedRequests() {
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<RequestsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let obsolete = false;
    getMyDataRequestsPage(page)
      .then((data) => {
        if (!obsolete) setResult(data);
      })
      .catch((err) => {
        if (obsolete) return;
        const detail = err instanceof AxiosError ? err.response?.data?.detail : undefined;
        setError(typeof detail === 'string' && detail.trim() ? detail : 'Failed to load your data requests.');
      })
      .finally(() => {
        if (!obsolete) setLoading(false);
      });
    return () => { obsolete = true; };
  }, [page, attempt]);

  function loadPage(nextPage: number) {
    if (loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setPage(nextPage);
    setAttempt((value) => value + 1);
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] flex-wrap items-center justify-center gap-4 text-sm">
        <button className="rounded-lg border px-4 py-2 opacity-50" disabled>Previous</button>
        <p role="status">Loading data requests…</p>
        <button className="rounded-lg border px-4 py-2 opacity-50" disabled>Next</button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
        <p role="alert">Could not load page {page}. {error}</p>
        <button className="mt-3 underline" onClick={() => loadPage(page)}>Retry</button>
        {page > 1 && <button className="ml-4 underline" onClick={() => loadPage(page - 1)}>Previous</button>}
      </div>
    );
  }

  const requests = result?.items ?? [];
  if (requests.length === 0 && page === 1) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">No data requests yet</h1>
          <p className="text-gray-500 mb-6">Tell the market what data you need.</p>
          <Link
            href="/requests/new"
            className="rounded-lg bg-[#3F51B5] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#3545a0]"
          >
            Post a Data Request
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Data Requests</h1>
        <Link
          href="/requests/new"
          className="rounded-lg bg-[#3F51B5] px-4 py-2 text-sm font-medium text-white hover:bg-[#3545a0]"
        >
          New Request
        </Link>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-700">Title</th>
              <th className="px-4 py-3 text-left font-medium text-gray-700">Status</th>
              <th className="px-4 py-3 text-left font-medium text-gray-700">Urgency</th>
              <th className="px-4 py-3 text-left font-medium text-gray-700">Responses</th>
              <th className="px-4 py-3 text-left font-medium text-gray-700">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {requests.map((req) => (
              <tr key={req.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link href={`/requests/${req.slug}`} className="text-[#3F51B5] hover:underline font-medium">
                    {req.title}
                  </Link>
                </td>
                <td className="px-4 py-3">{statusBadge(req.status)}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${URGENCY_BADGE[req.urgency] || ''}`}>
                    {req.urgency}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">{req.response_count}</td>
                <td className="px-4 py-3 text-gray-500">{formatDate(req.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card view */}
      <div className="md:hidden space-y-3">
        {requests.map((req) => (
          <Link
            key={req.id}
            href={`/requests/${req.slug}`}
            className="block rounded-lg border border-gray-200 p-4 hover:bg-gray-50"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-gray-900 truncate mr-2">{req.title}</span>
              {statusBadge(req.status)}
            </div>
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${URGENCY_BADGE[req.urgency] || ''}`}>
                {req.urgency}
              </span>
              <span>{req.response_count} responses &middot; {formatDate(req.created_at)}</span>
            </div>
          </Link>
        ))}
      </div>

      {result && (
        <nav aria-label="Data request pages" className="mt-6 flex flex-wrap items-center justify-center gap-4 text-sm">
          <button className="rounded-lg border px-4 py-2 disabled:opacity-50" disabled={result.page <= 1} onClick={() => loadPage(result.page - 1)}>
            Previous
          </button>
          <p role="status">Page {result.page} of {Math.max(1, Math.ceil(result.total / result.per_page))} · {result.total} requests</p>
          <button className="rounded-lg border px-4 py-2 disabled:opacity-50" disabled={result.page * result.per_page >= result.total} onClick={() => loadPage(result.page + 1)}>
            Next
          </button>
        </nav>
      )}
    </div>
  );
}
