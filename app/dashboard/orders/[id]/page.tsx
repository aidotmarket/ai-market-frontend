'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { getOrder, getOrderEvents, requestDownload, refreshOrderAccess } from '@/api/orders';
import { formatPrice, formatDate } from '@/lib/format';
import { useToast } from '@/components/Toast';
import { useAuthStore } from '@/store/auth';
import type { BuyerOrderDetail, OrderEvent, OrderStatus } from '@/types';
import { AxiosError } from 'axios';

const STATUS_BADGE: Record<OrderStatus, string> = {
  pending_fulfillment: 'bg-yellow-100 text-yellow-800',
  fulfilled: 'bg-green-100 text-green-800',
  refunded: 'bg-gray-100 text-gray-600',
  disputed: 'bg-red-100 text-red-800',
  payment_failed: 'bg-red-100 text-red-800',
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending_fulfillment: 'Pending Fulfillment',
  fulfilled: 'Fulfilled',
  refunded: 'Refunded',
  disputed: 'Disputed',
  payment_failed: 'Payment Failed',
};

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const orderId = params.id;
  const { toast } = useToast();
  const token = useAuthStore((s) => s.token);

  const [order, setOrder] = useState<BuyerOrderDetail | null>(null);
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      getOrder(orderId),
      getOrderEvents(orderId).catch(() => [] as OrderEvent[]),
    ])
      .then(([orderData, eventsData]) => {
        if (cancelled) return;
        setOrder(orderData);
        setEvents(eventsData);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof AxiosError && err.response?.status === 404) {
          setError('Order not found.');
        } else {
          setError('Failed to load order details.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [orderId]);

  // Download via fetch+blob (MP-G2-M4: no tokens in URLs)
  const handleDownload = useCallback(async () => {
    if (downloading) return;
    setDownloading(true);

    try {
      const { download_url } = await requestDownload(orderId);

      // Fetch with auth header, set referrer policy
      const res = await fetch(download_url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        referrerPolicy: 'no-referrer',
      });

      if (!res.ok) {
        // Auto-refresh on 403/410 (AG-G2-M6)
        if (res.status === 403 || res.status === 410) {
          setRefreshing(true);
          try {
            await refreshOrderAccess(orderId);
            // Retry download after refresh
            const retryData = await requestDownload(orderId);
            const retryRes = await fetch(retryData.download_url, {
              headers: token ? { Authorization: `Bearer ${token}` } : {},
              referrerPolicy: 'no-referrer',
            });
            if (!retryRes.ok) throw new Error('Download failed after refresh');
            const blob = await retryRes.blob();
            triggerBlobDownload(blob, 'data');
            return;
          } catch {
            toast('Access expired. Please try refreshing manually.', 'error');
            return;
          } finally {
            setRefreshing(false);
          }
        }
        throw new Error('Download failed');
      }

      const blob = await res.blob();
      triggerBlobDownload(blob, 'data');
    } catch {
      toast('Failed to download. Please try again.', 'error');
    } finally {
      setDownloading(false);
    }
  }, [orderId, downloading, token, toast]);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refreshOrderAccess(orderId);
      toast('Access refreshed successfully.', 'success');
      // Reload order data
      const updated = await getOrder(orderId);
      setOrder(updated);
    } catch {
      toast('Failed to refresh access.', 'error');
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
        {error || 'Order not found.'}
      </div>
    );
  }

  const statusCss = STATUS_BADGE[order.status as OrderStatus] || 'bg-gray-100 text-gray-600';
  const statusLabel = STATUS_LABEL[order.status as OrderStatus] || order.status;

  return (
    <div>
      <Link href="/dashboard/orders" className="text-sm text-blue-600 hover:underline mb-4 inline-block">
        &larr; Back to Orders
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main info */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-xl font-bold text-gray-900">Order #{order.id.slice(0, 8)}</h1>
              <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${statusCss}`}>
                {statusLabel}
              </span>
            </div>

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-gray-500">Listing</dt>
                <dd className="font-medium text-gray-900">{order.listing_title}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Seller</dt>
                <dd className="font-medium text-gray-900">{order.seller_name || 'N/A'}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Amount Paid</dt>
                <dd className="font-medium text-gray-900">{formatPrice(order.amount)}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Purchase Date</dt>
                <dd className="font-medium text-gray-900">{formatDate(order.created_at)}</dd>
              </div>
            </dl>
          </div>

          {/* Access / Download section */}
          {order.status === 'fulfilled' && (
            <div className="rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Download</h2>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleDownload}
                  disabled={downloading || refreshing}
                  className="rounded-lg bg-green-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {downloading ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      {refreshing ? 'Refreshing access…' : 'Downloading…'}
                    </>
                  ) : (
                    'Download Data'
                  )}
                </button>
                <button
                  onClick={handleRefresh}
                  disabled={refreshing || downloading}
                  className="rounded-lg border border-gray-300 px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {refreshing ? 'Refreshing…' : 'Refresh Access'}
                </button>
              </div>
              {order.access_expires_at && (
                <p className="text-xs text-gray-500 mt-3">
                  Access expires: {formatDate(order.access_expires_at)}
                </p>
              )}
            </div>
          )}

          {/* Event Timeline */}
          {events.length > 0 && (
            <div className="rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Timeline</h2>
              <div className="space-y-4">
                {events.map((event) => (
                  <div key={event.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="h-2 w-2 rounded-full bg-gray-400 mt-2"></div>
                      <div className="w-px flex-1 bg-gray-200"></div>
                    </div>
                    <div className="pb-4">
                      <p className="text-sm text-gray-900">{event.description}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{formatDate(event.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar actions */}
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-3">Actions</h3>
            <a
              href={`mailto:support@ai.market?subject=Issue with Order ${order.id.slice(0, 8)}`}
              className="block w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 text-center hover:bg-gray-50"
            >
              Report Issue
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function triggerBlobDownload(blob: Blob, fallbackName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fallbackName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  // Clean up
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 100);
}
