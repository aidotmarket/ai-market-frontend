'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getMyOrders } from '@/api/orders';
import { formatPrice, formatDate } from '@/lib/format';
import type { BuyerOrder, OrderStatus } from '@/types';

const STATUS_BADGE: Record<OrderStatus, string> = {
  pending_fulfillment: 'bg-yellow-100 text-yellow-800',
  fulfilled: 'bg-green-100 text-green-800',
  refunded: 'bg-gray-100 text-gray-600',
  disputed: 'bg-red-100 text-red-800',
  payment_failed: 'bg-red-100 text-red-800',
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending_fulfillment: 'Pending',
  fulfilled: 'Fulfilled',
  refunded: 'Refunded',
  disputed: 'Disputed',
  payment_failed: 'Failed',
};

function statusBadge(status: string) {
  const css = STATUS_BADGE[status as OrderStatus] || 'bg-gray-100 text-gray-600';
  const label = STATUS_LABEL[status as OrderStatus] || status;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${css}`}>
      {label}
    </span>
  );
}

export default function OrdersListPage() {
  const [orders, setOrders] = useState<BuyerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getMyOrders()
      .then((data) => {
        if (!cancelled) setOrders(data);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load orders.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
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

  if (orders.length === 0) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">No orders yet</h1>
          <p className="text-gray-500 mb-6">You haven&apos;t purchased any datasets yet.</p>
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
      <h1 className="text-2xl font-bold text-gray-900 mb-6">My Orders</h1>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-700">Order</th>
              <th className="px-4 py-3 text-left font-medium text-gray-700">Listing</th>
              <th className="px-4 py-3 text-left font-medium text-gray-700">Amount</th>
              <th className="px-4 py-3 text-left font-medium text-gray-700">Status</th>
              <th className="px-4 py-3 text-left font-medium text-gray-700">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {orders.map((order) => (
              <tr key={order.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link href={`/dashboard/orders/${order.id}`} className="text-blue-600 hover:underline font-mono text-xs">
                    #{order.id.slice(0, 8)}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-900">{order.listing_title}</td>
                <td className="px-4 py-3 font-medium text-gray-900">{formatPrice(order.amount)}</td>
                <td className="px-4 py-3">{statusBadge(order.status)}</td>
                <td className="px-4 py-3 text-gray-500">{formatDate(order.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card view */}
      <div className="md:hidden space-y-3">
        {orders.map((order) => (
          <Link
            key={order.id}
            href={`/dashboard/orders/${order.id}`}
            className="block rounded-lg border border-gray-200 p-4 hover:bg-gray-50"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-xs text-gray-500">#{order.id.slice(0, 8)}</span>
              {statusBadge(order.status)}
            </div>
            <p className="font-medium text-gray-900 mb-1">{order.listing_title}</p>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-gray-900">{formatPrice(order.amount)}</span>
              <span className="text-gray-500">{formatDate(order.created_at)}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
