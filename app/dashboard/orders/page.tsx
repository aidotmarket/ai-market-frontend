'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { buyerLicenseRecordPath } from '@/lib/licenseRecordRoutes';
import { getMyOrders } from '@/api/orders';
import { getMyTransactions } from '@/api/transactions';
import { formatPrice, formatDate } from '@/lib/format';
import OrderVersionAccessSummary from '@/components/orders/OrderVersionAccessSummary';
import type { BuyerOrder, OrderStatus, Transaction, TransactionStatus } from '@/types';

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

const TX_STATUS_BADGE: Record<TransactionStatus, string> = {
  initiated: 'bg-gray-100 text-gray-600',
  quoted: 'bg-gray-100 text-gray-600',
  accepted: 'bg-[#E8EAF6] text-[#303F9F]',
  checkout_pending: 'bg-yellow-100 text-yellow-800',
  paid: 'bg-[#E8EAF6] text-[#303F9F]',
  fulfilling: 'bg-yellow-100 text-yellow-800',
  delivered: 'bg-indigo-100 text-indigo-800',
  confirmed: 'bg-green-100 text-green-800',
  settled: 'bg-green-100 text-green-800',
};

const TX_STATUS_LABEL: Record<TransactionStatus, string> = {
  initiated: 'Initiated',
  quoted: 'Quoted',
  accepted: 'Accepted',
  checkout_pending: 'Checkout',
  paid: 'Paid',
  fulfilling: 'Fulfilling',
  delivered: 'Delivered',
  confirmed: 'Confirmed',
  settled: 'Settled',
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

function txStatusBadge(status: string) {
  const css = TX_STATUS_BADGE[status as TransactionStatus] || 'bg-gray-100 text-gray-600';
  const label = TX_STATUS_LABEL[status as TransactionStatus] || status;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${css}`}>
      {label}
    </span>
  );
}

const PAGE_SIZE = 50;

export default function OrdersListPage() {
  const [orders, setOrders] = useState<BuyerOrder[]>([]);
  const [txMap, setTxMap] = useState<Record<string, Transaction>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);

  function loadPage(nextPage: number) {
    // Retire work immediately, including the window before effect cleanup.
    generation.current += 1;
    setLoading(true);
    setError('');
    setOrders([]);
    setTxMap({});
    setPage(nextPage);
    setAttempt((value) => value + 1);
  }

  useEffect(() => {
    const request = ++generation.current;
    const current = () => generation.current === request;

    Promise.all([
      getMyOrders({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
      getMyTransactions().catch(() => [] as Transaction[]),
    ])
      .then(([orderData, txData]) => {
        if (!current()) return;
        setOrders(orderData);
        // Keep transaction iteration order for the first exact order-ID match.
        const map: Record<string, Transaction> = {};
        for (const tx of txData) {
          map[tx.id] = tx;
        }
        setTxMap(map);
      })
      .catch(() => {
        if (current()) setError('Failed to load orders.');
      })
      .finally(() => {
        if (current()) setLoading(false);
      });
    return () => { generation.current += 1; };
  }, [page, attempt]);

  const paging = (
    <nav aria-label="Purchase pages" className="mt-6 flex items-center gap-4">
      <button type="button" onClick={() => loadPage(page - 1)} disabled={page === 1}
        className="rounded border px-3 py-2 disabled:opacity-50">Previous</button>
      <span>Page {page}</span>
      <button type="button" onClick={() => loadPage(page + 1)}
        disabled={loading || !!error || orders.length !== PAGE_SIZE}
        className="rounded border px-3 py-2 disabled:opacity-50">Next</button>
    </nav>
  );

  if (loading) {
    return (
      <div>
        <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-label="Loading purchases">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#3F51B5] border-t-transparent"></div>
        </div>
        {page > 1 && paging}
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <div role="alert" className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
          <button type="button" onClick={() => loadPage(page)} className="ml-4 underline">Retry</button>
        </div>
        {paging}
      </div>
    );
  }

  if (orders.length === 0 && page > 1) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Purchases</h1>
        <p>No more purchases. You have reached the end of the available orders.</p>
        {paging}
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Purchases</h1>
          <h2 className="text-lg font-medium text-gray-900 mb-2">No orders yet</h2>
          <p className="text-gray-500 mb-6">You haven&apos;t purchased any datasets yet.</p>
          <Link
            href="/find-data"
            className="rounded-lg bg-[#3F51B5] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#3545a0]"
          >
            Browse data
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Purchases</h1>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-700">Order</th>
              <th className="px-4 py-3 text-left font-medium text-gray-700">Listing</th>
              <th className="px-4 py-3 text-left font-medium text-gray-700">Amount</th>
              <th className="px-4 py-3 text-left font-medium text-gray-700">Status</th>
              <th className="px-4 py-3 text-left font-medium text-gray-700">Transaction</th>
              <th className="px-4 py-3 text-left font-medium text-gray-700">Date</th>
              <th className="px-4 py-3 text-left font-medium text-gray-700">Files</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {orders.map((order) => {
              const tx = Object.values(txMap).find((t) => t.order_id === order.id);
              return (
                <tr key={order.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/orders/${order.id}`} className="text-[#3F51B5] hover:underline font-mono text-xs">
                      #{order.id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-900">
                    <div>{order.listing_title}</div>
                    <OrderVersionAccessSummary order={order} compact />
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">{formatPrice(order.amount)}</td>
                  <td className="px-4 py-3">{statusBadge(order.status)}</td>
                  <td className="px-4 py-3">
                    {tx ? (
                      <Link href={`/dashboard/orders/${order.id}?tx=${tx.id}`} className="inline-flex items-center gap-1.5">
                        {txStatusBadge(tx.status)}
                        <span className="text-xs text-gray-500 font-mono">{tx.tx_number}</span>
                      </Link>
                    ) : (
                      <span className="text-xs text-gray-400"> - </span>
                    )}
                    {order.license_record_available && (
                      <Link href={buyerLicenseRecordPath(order.id)} className="mt-2 block text-sm font-medium text-[#3F51B5] hover:underline">
                        Licence record
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(order.created_at)}</td>
                  <td className="px-4 py-3">
                    {order.status === 'fulfilled' && !order.access_expired ? (
                      <Link
                        href={`/dashboard/orders/${order.id}`}
                        className="text-sm font-medium text-[#3F51B5] hover:underline"
                      >
                        View downloads
                      </Link>
                    ) : order.access_expired ? (
                      <span className="text-xs font-medium text-red-700">Expired</span>
                    ) : (
                      <span className="text-xs text-gray-400"> - </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile card view */}
      <div className="md:hidden space-y-3">
        {orders.map((order) => {
          const tx = Object.values(txMap).find((t) => t.order_id === order.id);
          return (
            <div key={order.id}>
            <div className="block rounded-lg border border-gray-200 p-4 hover:bg-gray-50">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-xs text-gray-500">#{order.id.slice(0, 8)}</span>
                <div className="flex items-center gap-2">
                  {statusBadge(order.status)}
                  {tx && txStatusBadge(tx.status)}
                </div>
              </div>
              <p className="font-medium text-gray-900 mb-1">
                <Link href={`/dashboard/orders/${order.id}`} className="hover:underline">{order.listing_title}</Link>
              </p>
              <OrderVersionAccessSummary order={order} compact />
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-gray-900">{formatPrice(order.amount)}</span>
                <div className="flex items-center gap-2">
                  {tx && <span className="text-xs text-gray-500 font-mono">{tx.tx_number}</span>}
                  <span className="text-gray-500">{formatDate(order.created_at)}</span>
                </div>
              </div>
              {order.status === 'fulfilled' && !order.access_expired && (
                <Link href={`/dashboard/orders/${order.id}`} className="mt-3 block text-sm font-medium text-[#3F51B5] hover:underline">
                  View downloads
                </Link>
              )}
              {order.access_expired && (
                <p className="mt-3 text-sm font-medium text-red-700">Download window expired</p>
              )}
            </div>
            {order.license_record_available && (
              <Link href={buyerLicenseRecordPath(order.id)} className="mt-1 block px-4 py-2 text-sm font-medium text-[#3F51B5] underline">
                Licence record
              </Link>
            )}
            </div>
          );
        })}
      </div>
      {paging}
    </div>
  );
}
