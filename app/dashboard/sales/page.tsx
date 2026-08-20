'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getCapabilities } from '@/api/capabilities';
import { getSellerOrders, type SellerOrderListParams } from '@/api/seller';
import { formatDate, formatPrice } from '@/lib/format';
import type { SellerOrder, SellerOrderStatus } from '@/types';

type SalesFilter = 'pending_delivery' | 'all' | 'delivered' | 'completed';

const FILTERS: { value: SalesFilter; label: string }[] = [
  { value: 'pending_delivery', label: 'Awaiting delivery' },
  { value: 'all', label: 'All' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'completed', label: 'Completed' },
];

type SellerStatusPresentation = { label: string; css: string };

const SELLER_STATUS: Record<SellerOrderStatus, SellerStatusPresentation> = {
  created: { label: 'Order created', css: 'bg-gray-100 text-gray-600' },
  paid: { label: 'Paid', css: 'bg-[#E8EAF6] text-[#303F9F]' },
  in_escrow: { label: 'Payment held', css: 'bg-[#E8EAF6] text-[#303F9F]' },
  pending_delivery: { label: 'Awaiting delivery', css: 'bg-gray-100 text-gray-700' },
  delivered: { label: 'Delivered', css: 'bg-indigo-100 text-indigo-800' },
  completed: { label: 'Completed', css: 'bg-green-100 text-green-800' },
  disputed: { label: 'Disputed', css: 'bg-red-100 text-red-800' },
  resolved: { label: 'Dispute resolved', css: 'bg-gray-100 text-gray-600' },
  delivery_failed: { label: 'Delivery failed', css: 'bg-red-100 text-red-800' },
  refunded: { label: 'Refunded', css: 'bg-gray-100 text-gray-600' },
  cancelled: { label: 'Cancelled', css: 'bg-gray-100 text-gray-600' },
};

const UNKNOWN_STATUS: SellerStatusPresentation = {
  label: 'Status unavailable',
  css: 'bg-gray-100 text-gray-600',
};

function isSellerOrderStatus(status: string): status is SellerOrderStatus {
  return Object.prototype.hasOwnProperty.call(SELLER_STATUS, status);
}

function getSellerStatusPresentation(status: string): SellerStatusPresentation {
  return isSellerOrderStatus(status) ? SELLER_STATUS[status] : UNKNOWN_STATUS;
}

function compareNullableDates(
  first: string | null,
  second: string | null,
  direction: 'ascending' | 'descending'
): number {
  if (first === null && second === null) return 0;
  if (first === null) return 1;
  if (second === null) return -1;

  const firstTime = new Date(first).getTime();
  const secondTime = new Date(second).getTime();
  return direction === 'ascending' ? firstTime - secondTime : secondTime - firstTime;
}

function sortSellerOrders(orders: SellerOrder[], filter: SalesFilter): SellerOrder[] {
  const direction = filter === 'pending_delivery' ? 'ascending' : 'descending';

  return [...orders].sort((first, second) => {
    const paidComparison = compareNullableDates(first.paid_at, second.paid_at, direction);
    if (paidComparison !== 0) return paidComparison;

    const createdComparison = compareNullableDates(first.created_at, second.created_at, direction);
    if (createdComparison !== 0) return createdComparison;

    return first.order_number.localeCompare(second.order_number);
  });
}

function formatRelativeAge(date: string, now: Date): string {
  const difference = new Date(date).getTime() - now.getTime();
  const units: { unit: Intl.RelativeTimeFormatUnit; milliseconds: number }[] = [
    { unit: 'year', milliseconds: 31_536_000_000 },
    { unit: 'month', milliseconds: 2_592_000_000 },
    { unit: 'week', milliseconds: 604_800_000 },
    { unit: 'day', milliseconds: 86_400_000 },
    { unit: 'hour', milliseconds: 3_600_000 },
    { unit: 'minute', milliseconds: 60_000 },
    { unit: 'second', milliseconds: 1_000 },
  ];
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'always' });

  for (const { unit, milliseconds } of units) {
    const value = Math.trunc(difference / milliseconds);
    if (value !== 0 || unit === 'second') {
      return formatter.format(value, unit);
    }
  }

  return formatter.format(0, 'second');
}

function SalesPageContent() {
  const searchParams = useSearchParams();
  const requestedFilter = searchParams.get('status');
  const initialFilter = FILTERS.some(({ value }) => value === requestedFilter)
    ? (requestedFilter as SalesFilter)
    : 'pending_delivery';
  const [filter, setFilter] = useState<SalesFilter>(initialFilter);
  const [rows, setRows] = useState<SellerOrder[]>([]);
  const [pageState, setPageState] = useState<
    'loading' | 'active' | 'provisioning' | 'blocked' | 'error'
  >('loading');
  const [retryKey, setRetryKey] = useState(0);
  const reportedUnknownStatuses = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;
    setPageState('loading');
    setRows([]);

    async function fetchSales() {
      try {
        const capabilities = await getCapabilities();
        if (cancelled) return;

        const sellerStatus = capabilities.seller.effective_status;
        if (sellerStatus === 'provisioning') {
          setPageState('provisioning');
          return;
        }
        if (sellerStatus !== 'active') {
          setPageState('blocked');
          return;
        }

        const params: SellerOrderListParams =
          filter === 'all'
            ? { limit: 100, offset: 0 }
            : { status_filter: filter, limit: 100, offset: 0 };
        const response = await getSellerOrders(params);
        if (cancelled) return;

        setRows(sortSellerOrders(response.data, filter));
        setPageState('active');
      } catch {
        if (!cancelled) {
          setRows([]);
          setPageState('error');
        }
      }
    }

    fetchSales();
    return () => {
      cancelled = true;
    };
  }, [filter, retryKey]);

  useEffect(() => {
    for (const { status } of rows) {
      if (!isSellerOrderStatus(status) && !reportedUnknownStatuses.current.has(status)) {
        reportedUnknownStatuses.current.add(status);
        console.error('Unknown seller order status:', status);
      }
    }
  }, [rows]);

  const renderStatus = (order: SellerOrder) => {
    const presentation = getSellerStatusPresentation(order.status);
    return (
      <>
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${presentation.css}`}>
          {presentation.label}
        </span>
        {order.status === 'delivered' && order.delivered_at && (
          <div className="mt-1 text-xs text-gray-500">{formatDate(order.delivered_at)}</div>
        )}
        {order.status === 'completed' && order.completed_at && (
          <div className="mt-1 text-xs text-gray-500">{formatDate(order.completed_at)}</div>
        )}
      </>
    );
  };

  const renderPaid = (order: SellerOrder) =>
    order.paid_at ? (
      <>
        {formatDate(order.paid_at)} ({formatRelativeAge(order.paid_at, new Date())})
      </>
    ) : (
      <>
        <div>Not paid</div>
        {order.created_at && (
          <div className="mt-1 text-xs text-gray-500">Created {formatDate(order.created_at)}</div>
        )}
      </>
    );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Sales</h1>

      {pageState === 'provisioning' && (
        <p className="text-gray-600">Sales unlock after seller setup is complete.</p>
      )}

      {pageState === 'blocked' && (
        <p className="text-gray-600">Sales are unavailable for this account.</p>
      )}

      {(pageState === 'active' || pageState === 'loading' || pageState === 'error') && (
        <div className="flex flex-wrap gap-2" aria-label="Sales status filter">
          {FILTERS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={`rounded-lg border px-4 py-2 text-sm font-medium ${
                filter === value
                  ? 'border-[#3F51B5] bg-[#3F51B5] text-white'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {pageState === 'loading' && (
        <div className="flex items-center gap-3 py-12 text-sm text-gray-600">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#3F51B5] border-t-transparent" />
          <span>Loading sales...</span>
        </div>
      )}

      {pageState === 'error' && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <h2 className="text-lg font-medium text-red-800">Sales are unavailable</h2>
          <p className="mt-2 text-sm text-red-700">We couldn&apos;t load your sales. Try again.</p>
          <button
            type="button"
            onClick={() => setRetryKey((value) => value + 1)}
            className="mt-4 inline-flex items-center rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Try again
          </button>
        </div>
      )}

      {pageState === 'active' && rows.length === 0 && filter === 'pending_delivery' && (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
          <h2 className="text-lg font-medium text-gray-900">No sales awaiting delivery</h2>
          <p className="mt-2 text-sm text-gray-500">Paid sales awaiting delivery will appear here.</p>
        </div>
      )}

      {pageState === 'active' && rows.length === 0 && filter === 'all' && (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
          <h2 className="text-lg font-medium text-gray-900">No sales yet</h2>
          <p className="mt-2 text-sm text-gray-500">Sales will appear here after a buyer completes payment.</p>
        </div>
      )}

      {pageState === 'active' && rows.length === 0 && (filter === 'delivered' || filter === 'completed') && (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
          <h2 className="text-lg font-medium text-gray-900">No sales match this filter</h2>
          <p className="mt-2 text-sm text-gray-500">Choose another status to view your sales.</p>
        </div>
      )}

      {pageState === 'active' && rows.length > 0 && (
        <>
          <div className="hidden md:block overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Sale', 'Listing', 'Buyer', 'Gross (USD)', 'You receive (USD)', 'Status', 'Paid'].map((label) => (
                    <th key={label} className="px-4 py-3 text-left font-medium text-gray-700">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{order.order_number}</td>
                    <td className="px-4 py-3 text-gray-900">{order.listing_title}</td>
                    <td className="px-4 py-3 text-gray-700">{order.buyer_email}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{formatPrice(order.amount_cents / 100)}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{formatPrice(order.seller_amount_cents / 100)}</td>
                    <td className="px-4 py-3">{renderStatus(order)}</td>
                    <td className="px-4 py-3 text-gray-500">{renderPaid(order)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-3">
            {rows.map((order) => (
              <article key={order.id} className="rounded-lg border border-gray-200 bg-white p-4">
                <dl className="space-y-3 text-sm">
                  <div><dt className="font-medium text-gray-500">Sale</dt><dd className="font-mono text-xs text-gray-900">{order.order_number}</dd></div>
                  <div><dt className="font-medium text-gray-500">Listing</dt><dd className="text-gray-900">{order.listing_title}</dd></div>
                  <div><dt className="font-medium text-gray-500">Buyer</dt><dd className="text-gray-900">{order.buyer_email}</dd></div>
                  <div><dt className="font-medium text-gray-500">Gross (USD)</dt><dd className="text-gray-900">{formatPrice(order.amount_cents / 100)}</dd></div>
                  <div><dt className="font-medium text-gray-500">You receive (USD)</dt><dd className="text-gray-900">{formatPrice(order.seller_amount_cents / 100)}</dd></div>
                  <div><dt className="font-medium text-gray-500">Status</dt><dd>{renderStatus(order)}</dd></div>
                  <div><dt className="font-medium text-gray-500">Paid</dt><dd className="text-gray-900">{renderPaid(order)}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function SalesPage() {
  return (
    <Suspense
      fallback={(
        <div className="space-y-6">
          <h1 className="text-2xl font-bold text-gray-900">Sales</h1>
          <p className="text-sm text-gray-600">Loading sales...</p>
        </div>
      )}
    >
      <SalesPageContent />
    </Suspense>
  );
}
