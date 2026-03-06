'use client';

import Link from 'next/link';
import { useInquiryList } from '@/hooks/useInquiryList';
import { formatDate } from '@/lib/format';
import type { ConversationStatus } from '@/types';

const STATUS_BADGE: Record<ConversationStatus, { css: string; label: string }> = {
  auto_answered: { css: 'bg-green-100 text-green-800', label: 'Auto-answered' },
  escalated: { css: 'bg-yellow-100 text-yellow-800', label: 'Escalated' },
  awaiting_seller: { css: 'bg-yellow-100 text-yellow-800', label: 'Awaiting seller' },
  seller_replied: { css: 'bg-blue-100 text-blue-800', label: 'Seller replied' },
  resolved: { css: 'bg-gray-100 text-gray-600', label: 'Resolved' },
};

function statusBadge(status: ConversationStatus) {
  const s = STATUS_BADGE[status] || { css: 'bg-gray-100 text-gray-600', label: status };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${s.css}`}>
      {s.label}
    </span>
  );
}

export default function BuyerInquiriesPage() {
  const { inquiries, loading, error } = useInquiryList('buyer');

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

  if (inquiries.length === 0) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">No inquiries yet</h1>
          <p className="text-gray-500 mb-6">Browse listings and ask questions about data before purchasing.</p>
          <Link
            href="/listings"
            className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Browse the Marketplace
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">My Inquiries</h1>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-700">Listing</th>
              <th className="px-4 py-3 text-left font-medium text-gray-700">Status</th>
              <th className="px-4 py-3 text-left font-medium text-gray-700">Last Message</th>
              <th className="px-4 py-3 text-left font-medium text-gray-700">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {inquiries.map((inq) => (
              <tr key={inq.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link href={`/dashboard/inquiries/${inq.id}`} className="text-blue-600 hover:underline font-medium">
                    {inq.listing_title}
                  </Link>
                  {inq.unread_by_buyer > 0 && (
                    <span className="ml-2 inline-flex items-center rounded-full bg-blue-600 px-2 py-0.5 text-xs font-medium text-white">
                      {inq.unread_by_buyer}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">{statusBadge(inq.status)}</td>
                <td className="px-4 py-3 text-gray-500 max-w-xs truncate">
                  {inq.last_message_preview || '—'}
                </td>
                <td className="px-4 py-3 text-gray-500">{formatDate(inq.last_message_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card view */}
      <div className="md:hidden space-y-3">
        {inquiries.map((inq) => (
          <Link
            key={inq.id}
            href={`/dashboard/inquiries/${inq.id}`}
            className="block rounded-lg border border-gray-200 p-4 hover:bg-gray-50"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-gray-900 truncate mr-2">{inq.listing_title}</span>
              {inq.unread_by_buyer > 0 && (
                <span className="inline-flex items-center rounded-full bg-blue-600 px-2 py-0.5 text-xs font-medium text-white shrink-0">
                  {inq.unread_by_buyer}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between">
              {statusBadge(inq.status)}
              <span className="text-xs text-gray-500">{formatDate(inq.last_message_at)}</span>
            </div>
            {inq.last_message_preview && (
              <p className="text-sm text-gray-500 mt-2 truncate">{inq.last_message_preview}</p>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
