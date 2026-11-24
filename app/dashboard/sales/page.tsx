'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getCapabilities } from '@/api/capabilities';
import { getSellerOrders, SELLER_ORDERS_PAGE_SIZE, type SellerOrderListParams } from '@/api/seller';
import { formatDate, formatPrice } from '@/lib/format';
import type { SellerOrder } from '@/types';
import Link from 'next/link';
import { sellerLicenseRecordPath } from '@/lib/licenseRecordRoutes';
import { getSellerStatusPresentation, isSellerOrderStatus } from '@/lib/sellerOrderStatus';
import { parseSalesFilter, SALES_FILTERS, type SalesFilter } from './filters';

type SalesRequest = { filter: SalesFilter; offset: number; retryKey: number };
const SELLER_AMOUNT_LABEL = 'You receive before card fees (USD)';

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
  const initialFilter = parseSalesFilter(searchParams.get('status')) ?? 'pending_delivery';
  const [request, setRequest] = useState<SalesRequest>({ filter: initialFilter, offset: 0, retryKey: 0 });
  const currentRequest = useRef(request);
  const { filter, offset } = request;
  const [rows, setRows] = useState<SellerOrder[]>([]);
  const [pageState, setPageState] = useState<
    'loading' | 'active' | 'provisioning' | 'blocked' | 'error'
  >('loading');
  const reportedUnknownStatuses = useRef(new Set<string>());

  function changeRequest(next: SalesRequest) {
    if (currentRequest.current !== request) return;
    // Retire callbacks immediately, including before the effect cleanup runs.
    currentRequest.current = next;
    setRows([]);
    setPageState('loading');
    setRequest(next);
  }

  useEffect(() => {
    let cancelled = false;
    const isCurrent = () => !cancelled && currentRequest.current === request;
    setPageState('loading');
    setRows([]);

    async function fetchSales() {
      try {
        const capabilities = await getCapabilities();
        if (!isCurrent()) return;

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
          request.filter === 'all'
            ? { limit: SELLER_ORDERS_PAGE_SIZE, offset: request.offset }
            : { status_filter: request.filter, limit: SELLER_ORDERS_PAGE_SIZE, offset: request.offset };
        const response = await getSellerOrders(params);
        if (!isCurrent()) return;

        setRows(sortSellerOrders(response.data, request.filter));
        setPageState('active');
      } catch {
        if (isCurrent()) {
          setRows([]);
          setPageState('error');
        }
      }
    }

    fetchSales();
    return () => {
      cancelled = true;
    };
  }, [request]);

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
          <div className="mt-1 text-xs text-gray-500">Delivered {formatDate(order.delivered_at)}</div>
        )}
        {order.status === 'completed' && order.completed_at && (
          <div className="mt-1 text-xs text-gray-500">Completed {formatDate(order.completed_at)}</div>
        )}
      </>
    );
  };

  const renderPaid = (order: SellerOrder) =>
    order.amount_cents !== 0 && order.paid_at ? (
      <>
        {formatDate(order.paid_at)} ({formatRelativeAge(order.paid_at, new Date())})
      </>
    ) : (
      <>
        <div>{order.amount_cents === 0 ? 'No payment due' : 'Not paid'}</div>
        {order.created_at && (
          <div className="mt-1 text-xs text-gray-500">Created {formatDate(order.created_at)}</div>
        )}
      </>
    );

  const recordHref = (order: SellerOrder) => `${sellerLicenseRecordPath(order.id)}?status=${filter}`;

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
          {SALES_FILTERS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => {
                if (value !== filter) changeRequest({ filter: value, offset: 0, retryKey: 0 });
              }}
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
            onClick={() => changeRequest({ ...request, retryKey: request.retryKey + 1 })}
            className="mt-4 inline-flex items-center rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Try again
          </button>
        </div>
      )}

      {pageState === 'active' && rows.length === 0 && offset > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
          <h2 className="text-lg font-medium text-gray-900">End of sales results</h2>
          <p className="mt-2 text-sm text-gray-500">No sales on this page. Use Previous to return to earlier results.</p>
        </div>
      )}

      {pageState === 'active' && rows.length === 0 && offset === 0 && filter === 'pending_delivery' && (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
          <h2 className="text-lg font-medium text-gray-900">No sales awaiting delivery</h2>
          <p className="mt-2 text-sm text-gray-500">Paid sales awaiting delivery will appear here.</p>
        </div>
      )}

      {pageState === 'active' && rows.length === 0 && offset === 0 && filter === 'all' && (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
          <h2 className="text-lg font-medium text-gray-900">No sales yet</h2>
          <p className="mt-2 text-sm text-gray-500">Sales will appear here after a buyer completes payment.</p>
        </div>
      )}

      {pageState === 'active' && rows.length === 0 && offset === 0 && (filter === 'delivered' || filter === 'completed') && (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
          <h2 className="text-lg font-medium text-gray-900">No sales match this filter</h2>
          <p className="mt-2 text-sm text-gray-500">Choose another status to view your sales.</p>
        </div>
      )}

      {pageState === 'active' && rows.length > 0 && (
        <>
          <p className="text-sm text-gray-600">
            The amount you receive before card fees is the gross amount less ai.market’s 5% commission. If a card processing fee applies, it’s deducted from your payout. The amounts shown here exclude that fee.
          </p>
          <div className="hidden md:block overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Sale', 'Listing', 'Gross (USD)', SELLER_AMOUNT_LABEL, 'Status', 'Paid'].map((label) => (
                    <th key={label} className="px-4 py-3 text-left font-medium text-gray-700">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">
                      {order.order_number}
                      {order.license_record_available && <Link href={recordHref(order)} className="mt-2 block font-sans text-sm font-medium text-[#3F51B5] underline">License record</Link>}
                    </td>
                    <td className="px-4 py-3 text-gray-900">{order.listing_title}</td>
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
                  <div><dt className="font-medium text-gray-500">Gross (USD)</dt><dd className="text-gray-900">{formatPrice(order.amount_cents / 100)}</dd></div>
                  <div><dt className="font-medium text-gray-500">{SELLER_AMOUNT_LABEL}</dt><dd className="text-gray-900">{formatPrice(order.seller_amount_cents / 100)}</dd></div>
                  <div><dt className="font-medium text-gray-500">Status</dt><dd>{renderStatus(order)}</dd></div>
                  <div><dt className="font-medium text-gray-500">Paid</dt><dd className="text-gray-900">{renderPaid(order)}</dd></div>
                </dl>
                {order.license_record_available && <Link href={recordHref(order)} className="mt-4 inline-block text-sm font-medium text-[#3F51B5] underline">License record</Link>}
              </article>
            ))}
          </div>
        </>
      )}
      {(pageState === 'active' || pageState === 'loading' || pageState === 'error') && (
        <nav aria-label="Sales pagination" className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            disabled={offset === 0 || pageState === 'loading'}
            onClick={() => changeRequest({ ...request, offset: Math.max(0, offset - SELLER_ORDERS_PAGE_SIZE) })}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          <span aria-live="polite" className="text-sm text-gray-600">Page {offset / SELLER_ORDERS_PAGE_SIZE + 1}</span>
          <button
            type="button"
            disabled={pageState !== 'active' || rows.length < SELLER_ORDERS_PAGE_SIZE}
            onClick={() => changeRequest({ ...request, offset: offset + SELLER_ORDERS_PAGE_SIZE })}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </nav>
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
