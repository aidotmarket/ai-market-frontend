'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth';
import { useToast } from '@/components/Toast';
import { getMyDataRequests } from '@/api/data-requests';
import { formatDate } from '@/lib/format';
import { AxiosError } from 'axios';
import type { DataRequestListItem, DataRequestStatus, DataRequestUrgency } from '@/types';

const STATUS_BADGE: Record<DataRequestStatus, { css: string; label: string }> = {
  draft: { css: 'bg-gray-100 text-gray-600', label: 'Draft' },
  open: { css: 'bg-green-100 text-green-800', label: 'Open' },
  responses_received: { css: 'bg-blue-100 text-blue-800', label: 'Responses received' },
  fulfilled: { css: 'bg-purple-100 text-purple-800', label: 'Fulfilled' },
  closed: { css: 'bg-gray-100 text-gray-600', label: 'Closed' },
  expired: { css: 'bg-red-100 text-red-700', label: 'Expired' },
};

const URGENCY_BADGE: Record<DataRequestUrgency, string> = {
  low: 'bg-gray-100 text-gray-700',
  medium: 'bg-blue-100 text-blue-700',
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
  const { isAuthenticated } = useAuthStore();
  const { toast } = useToast();
  const [requests, setRequests] = useState<DataRequestListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;

    getMyDataRequests()
      .then((data) => setRequests(data))
      .catch((err) => {
        if (err instanceof AxiosError) {
          setError(err.response?.data?.detail || 'Failed to load your data requests.');
        } else {
          setError('An unexpected error occurred.');
        }
        toast('Failed to load data requests.', 'error');
      })
      .finally(() => setLoading(false));
  }, [isAuthenticated, toast]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">No data requests yet</h1>
          <p className="text-gray-500 mb-6">Tell the market what data you need.</p>
          <Link
            href="/requests/new"
            className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
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
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
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
                  <Link href={`/requests/${req.slug}`} className="text-blue-600 hover:underline font-medium">
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
    </div>
  );
}
