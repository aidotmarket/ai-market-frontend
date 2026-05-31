'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { getOrder, getOrderEvents, requestDownload, refreshOrderAccess } from '@/api/orders';
import { getTransaction, confirmTransaction, deliverTransaction } from '@/api/transactions';
import { formatPrice, formatDate } from '@/lib/format';
import { useToast } from '@/components/Toast';
import { useAuthStore } from '@/store/auth';
import type { BuyerOrderDetail, OrderDownloadResponse, OrderEvent, OrderStatus, S3DownloadFile, Transaction, TransactionStatus, TransactionEvent } from '@/types';
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
  checkout_pending: 'Checkout Pending',
  paid: 'Paid',
  fulfilling: 'Fulfilling',
  delivered: 'Delivered',
  confirmed: 'Confirmed',
  settled: 'Settled',
};

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const orderId = params.id;
  const txIdParam = searchParams.get('tx');
  const { toast } = useToast();
  const userRole = useAuthStore((s) => s.user?.role);

  const [order, setOrder] = useState<BuyerOrderDetail | null>(null);
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [tx, setTx] = useState<Transaction | null>(null);
  const [downloadPackage, setDownloadPackage] = useState<OrderDownloadResponse | null>(null);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [refreshingFilePath, setRefreshingFilePath] = useState<string | null>(null);
  const [refreshingAccess, setRefreshingAccess] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [confirming, setConfirming] = useState(false);
  const [delivering, setDelivering] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetches: [Promise<BuyerOrderDetail>, Promise<OrderEvent[]>, Promise<Transaction | null>] = [
      getOrder(orderId),
      getOrderEvents(orderId).catch(() => [] as OrderEvent[]),
      txIdParam ? getTransaction(txIdParam).catch(() => null) : Promise.resolve(null),
    ];

    Promise.all(fetches)
      .then(([orderData, eventsData, txData]) => {
        if (cancelled) return;
        setOrder(orderData);
        setEvents(eventsData);
        setTx(txData);
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
  }, [orderId, txIdParam]);

  useEffect(() => {
    if (order?.status !== 'fulfilled') return;

    let cancelled = false;
    setDownloadLoading(true);
    setDownloadError('');

    requestDownload(orderId)
      .then((data) => {
        if (!cancelled) setDownloadPackage(data);
      })
      .catch(() => {
        if (!cancelled) setDownloadError('Failed to load download links.');
      })
      .finally(() => {
        if (!cancelled) setDownloadLoading(false);
      });

    return () => { cancelled = true; };
  }, [order?.status, orderId]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const handleConfirm = async () => {
    if (!tx || confirming) return;
    setConfirming(true);
    try {
      const updated = await confirmTransaction(tx.id);
      setTx(updated);
      toast('Receipt confirmed!', 'success');
    } catch {
      toast('Failed to confirm receipt.', 'error');
    } finally {
      setConfirming(false);
    }
  };

  const handleDeliver = async () => {
    if (!tx || delivering) return;
    setDelivering(true);
    try {
      const updated = await deliverTransaction(tx.id, { proof_type: 'manual', notes: 'Marked delivered by seller' });
      setTx(updated);
      toast('Marked as delivered!', 'success');
    } catch {
      toast('Failed to mark as delivered.', 'error');
    } finally {
      setDelivering(false);
    }
  };

  const getFreshDownloadPackage = useCallback(async (filePath?: string) => {
    if (filePath) setRefreshingFilePath(filePath);
    setDownloadError(filePath ? 'Link expired - refreshing.' : '');
    try {
      await refreshOrderAccess(orderId);
      const updatedPackage = await requestDownload(orderId);
      setDownloadPackage(updatedPackage);
      setDownloadError('');
      return updatedPackage;
    } catch {
      setDownloadError('Failed to refresh download links.');
      throw new Error('refresh_failed');
    } finally {
      if (filePath) setRefreshingFilePath(null);
    }
  }, [orderId]);

  const handleDownloadFile = useCallback(async (file: S3DownloadFile) => {
    if (activeFilePath || refreshingFilePath) return;
    setActiveFilePath(file.path);

    try {
      let fileToOpen = file;
      if (isNearExpiry(file.expires_at, now)) {
        const refreshedPackage = await getFreshDownloadPackage(file.path);
        const refreshedFile = refreshedPackage.s3_download_urls?.find((candidate) => candidate.path === file.path);
        if (!refreshedFile) throw new Error('file_missing_after_refresh');
        fileToOpen = refreshedFile;
      }

      openPresignedUrl(fileToOpen);
    } catch {
      toast('Failed to prepare this download. Please try again.', 'error');
    } finally {
      setActiveFilePath(null);
    }
  }, [activeFilePath, refreshingFilePath, now, getFreshDownloadPackage, toast]);

  const handleRefresh = async () => {
    if (refreshingAccess) return;
    setRefreshingAccess(true);
    try {
      await getFreshDownloadPackage();
      toast('Download links refreshed.', 'success');
    } catch {
      toast('Failed to refresh access.', 'error');
    } finally {
      setRefreshingAccess(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#3F51B5] border-t-transparent"></div>
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
      <Link href="/dashboard/orders" className="text-sm text-[#3F51B5] hover:underline mb-4 inline-block">
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

          {/* Transaction detail */}
          {tx && (
            <div className="rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Transaction</h2>
                <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${TX_STATUS_BADGE[tx.status as TransactionStatus] || 'bg-gray-100 text-gray-600'}`}>
                  {TX_STATUS_LABEL[tx.status as TransactionStatus] || tx.status}
                </span>
              </div>

              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-gray-500">Transaction #</dt>
                  <dd className="font-mono font-medium text-gray-900">{tx.tx_number}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Amount</dt>
                  <dd className="font-medium text-gray-900">{formatPrice(tx.amount_cents / 100)}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Platform Fee</dt>
                  <dd className="font-medium text-gray-900">{formatPrice(tx.platform_fee_cents / 100)}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Seller Receives</dt>
                  <dd className="font-medium text-gray-900">{formatPrice(tx.seller_amount_cents / 100)}</dd>
                </div>
                {tx.paid_at && (
                  <div>
                    <dt className="text-gray-500">Paid At</dt>
                    <dd className="font-medium text-gray-900">{formatDate(tx.paid_at)}</dd>
                  </div>
                )}
                {tx.delivered_at && (
                  <div>
                    <dt className="text-gray-500">Delivered At</dt>
                    <dd className="font-medium text-gray-900">{formatDate(tx.delivered_at)}</dd>
                  </div>
                )}
              </dl>

              {/* Action buttons based on TX status */}
              <div className="mt-4 flex flex-col sm:flex-row gap-3">
                {tx.status === 'delivered' && (
                  <button
                    onClick={handleConfirm}
                    disabled={confirming}
                    className="rounded-lg bg-green-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {confirming ? 'Confirming…' : 'Confirm Receipt'}
                  </button>
                )}
                {tx.status === 'fulfilling' && userRole === 'seller' && (
                  <button
                    onClick={handleDeliver}
                    disabled={delivering}
                    className="rounded-lg bg-[#3F51B5] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#3545a0] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {delivering ? 'Marking…' : 'Mark Delivered'}
                  </button>
                )}
              </div>

              {/* Transaction events timeline */}
              {tx.events && tx.events.length > 0 && (
                <div className="mt-6 border-t border-gray-100 pt-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Transaction Timeline</h3>
                  <div className="space-y-3">
                    {tx.events.map((evt: TransactionEvent) => (
                      <div key={evt.id} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className="h-2 w-2 rounded-full bg-blue-400 mt-2"></div>
                          <div className="w-px flex-1 bg-gray-200"></div>
                        </div>
                        <div className="pb-2">
                          <p className="text-sm text-gray-900">
                            {evt.event_type.replace(/_/g, ' ')}
                            {evt.from_status && evt.to_status && (
                              <span className="text-gray-500"> - {evt.from_status} → {evt.to_status}</span>
                            )}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {evt.actor_type} · {formatDate(evt.created_at)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Access / Download section */}
          {order.status === 'fulfilled' && (
            <div className="rounded-lg border border-gray-200 p-6">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Downloads</h2>
                  {downloadPackage?.downloads_remaining !== undefined && (
                    <p className="mt-1 text-xs text-gray-500">
                      {downloadPackage.downloads_remaining} downloads remaining after this link issue.
                    </p>
                  )}
                </div>
                <button
                  onClick={handleRefresh}
                  disabled={refreshingAccess || downloadLoading || !!activeFilePath}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {refreshingAccess ? 'Refreshing...' : 'Refresh Links'}
                </button>
              </div>

              {downloadLoading && (
                <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600">
                  Loading download links...
                </div>
              )}

              {downloadError && (
                <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {downloadError}
                </div>
              )}

              {!downloadLoading && !downloadError && (!downloadPackage?.s3_download_urls || downloadPackage.s3_download_urls.length === 0) && (
                <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600">
                  No S3 files are available yet. The seller may still be completing fulfillment.
                </div>
              )}

              {downloadPackage?.s3_download_urls && downloadPackage.s3_download_urls.length > 0 && (
                <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                  {downloadPackage.s3_download_urls.map((file) => {
                    const secondsLeft = secondsUntil(file.expires_at, now);
                    const expired = secondsLeft <= 0;
                    const refreshing = refreshingFilePath === file.path;
                    const active = activeFilePath === file.path;
                    return (
                      <div key={file.path} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-900" title={file.path}>
                            {fileNameFromPath(file.path)}
                          </p>
                          <p className="mt-1 truncate text-xs text-gray-500" title={file.path}>
                            {file.path}
                          </p>
                          <p className={`mt-1 text-xs ${expired ? 'text-red-700' : 'text-gray-500'}`}>
                            {refreshing ? 'Link expired - refreshing.' : formatValidity(secondsLeft)}
                          </p>
                        </div>
                        <button
                          onClick={() => handleDownloadFile(file)}
                          disabled={!!activeFilePath || !!refreshingFilePath}
                          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {active || refreshing ? 'Preparing...' : 'Download'}
                        </button>
                      </div>
                    );
                  })}
                </div>
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

function openPresignedUrl(file: S3DownloadFile) {
  const a = document.createElement('a');
  a.href = file.presigned_url;
  a.download = fileNameFromPath(file.path);
  a.rel = 'noopener noreferrer';
  a.referrerPolicy = 'no-referrer';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function fileNameFromPath(path: string) {
  const cleanPath = path.split('?')[0] || path;
  return cleanPath.split('/').filter(Boolean).pop() || 'data';
}

function secondsUntil(expiresAt: string, now: number) {
  const expiry = new Date(expiresAt).getTime();
  if (Number.isNaN(expiry)) return 0;
  return Math.max(0, Math.floor((expiry - now) / 1000));
}

function isNearExpiry(expiresAt: string, now: number) {
  return secondsUntil(expiresAt, now) <= 60;
}

function formatValidity(secondsLeft: number) {
  if (secondsLeft <= 0) return 'Link expired.';
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  if (minutes === 0) return `Valid for ${seconds}s.`;
  return `Valid for ${minutes}m ${seconds.toString().padStart(2, '0')}s.`;
}
