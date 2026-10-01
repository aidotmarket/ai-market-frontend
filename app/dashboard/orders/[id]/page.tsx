'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { getOrder, getOrderAccess, getOrderEvents } from '@/api/orders';
import { getTransaction, confirmTransaction, deliverTransaction } from '@/api/transactions';
import { formatPrice, formatDate } from '@/lib/format';
import { useToast } from '@/components/Toast';
import { useAuthStore } from '@/store/auth';
import WorkspaceDownload from '@/components/orders/WorkspaceDownload';
import WorkspacePurchaseRecovery from '@/components/orders/WorkspacePurchaseRecovery';
import OrderVersionAccessSummary from '@/components/orders/OrderVersionAccessSummary';
import { useTermsGate } from '@/components/legal/TermsGate';
import type { BuyerOrderDetail, OrderAccessResponse, OrderEvent, OrderStatus, Transaction, TransactionStatus, TransactionEvent } from '@/types';
import { AxiosError } from 'axios';
import GatewayDeliverySection from '@/components/orders/GatewayDeliverySection';

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

const ORDER_EVENT_LABELS: Record<string, string> = {
  created: 'Order placed',
  paid: 'Payment received',
  payment_received: 'Payment received',
  delivery_completed: 'Delivered',
  delivered: 'Delivered',
  confirmed: 'Confirmed',
  auto_confirmed: 'Confirmed',
  disputed: 'Issue reported',
  refunded: 'Refunded',
};

function orderEventLabel(event: OrderEvent): string {
  if (event.description?.trim()) return event.description;
  const type = event.event_type?.trim() ?? '';
  const readableType = type.replace(/_/g, ' ').trim();
  return ORDER_EVENT_LABELS[type] ?? (readableType ? readableType[0].toUpperCase() + readableType.slice(1) : 'Order updated');
}

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
  const userId = useAuthStore((s) => s.user?.id);
  const { ensureTermsAccepted, TermsGatePrompt, checkingTerms } = useTermsGate('buyer');

  const [order, setOrder] = useState<BuyerOrderDetail | null>(null);
  const isBuyerOfRecord = order !== null && userId === order.buyer_id;
  const isSellerOfRecord = order !== null && userId === order.seller_id;
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [tx, setTx] = useState<Transaction | null>(null);
  const [orderAccess, setOrderAccess] = useState<OrderAccessResponse | null>(null);
  const [gatewayOrderId, setGatewayOrderId] = useState<string | null>(null);
  const handleGatewayPresence = useCallback((present: boolean) => {
    setGatewayOrderId(present ? orderId : null);
  }, [orderId]);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [workspaceDownloadReady, setWorkspaceDownloadReady] = useState(false);
  useEffect(() => {setWorkspaceDownloadReady(false);}, [orderId]);
  const [downloadError, setDownloadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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
        setTx(txData?.order_id === orderId ? txData : null);
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
  }, [orderId, txIdParam, userId]);

  useEffect(() => {
    setOrderAccess(null);
    setDownloadError('');
    setDownloadLoading(false);
    if (!isBuyerOfRecord || order?.workspace_delivery || !['fulfilled', 'delivered', 'completed'].includes(String(order?.status)) || order?.access_expired) return;

    let cancelled = false;
    setDownloadLoading(true);
    getOrderAccess(orderId)
      .then((data) => { if (!cancelled) setOrderAccess(data); })
      .catch(() => { if (!cancelled) setDownloadError('Download access is unavailable.'); })
      .finally(() => { if (!cancelled) setDownloadLoading(false); });
    return () => { cancelled = true; };
  }, [isBuyerOfRecord, order?.workspace_delivery, order?.access_expired, order?.status, orderId]);

  const handleConfirm = async () => {
    await ensureTermsAccepted(confirmReceipt);
  };

  const confirmReceipt = async () => {
    if (!isBuyerOfRecord || !tx || confirming) return;
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
    await ensureTermsAccepted(markDelivered);
  };

  const markDelivered = async () => {
    if (!isSellerOfRecord || !tx || delivering) return;
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
      <TermsGatePrompt />
      <Link href="/dashboard/orders" className="text-sm text-[#3F51B5] hover:underline mb-4 inline-block">
        &larr; Back to Purchases
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main info */}
        <div className="lg:col-span-2 space-y-6">
          {isBuyerOfRecord && <GatewayDeliverySection key={order.id} orderId={order.id} onPresenceChange={handleGatewayPresence} />}
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
                <dd className="font-medium text-gray-900">Identified to ai.market for this order</dd>
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
            <div className="mt-4">
              <OrderVersionAccessSummary order={order} />
            </div>
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
                {tx.status === 'delivered' && isBuyerOfRecord && (
                  <button
                    onClick={handleConfirm}
                    disabled={confirming || checkingTerms}
                    className="rounded-lg bg-green-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {confirming || checkingTerms ? 'Confirming…' : 'Confirm Receipt'}
                  </button>
                )}
                {tx.status === 'fulfilling' && isSellerOfRecord && (
                  <button
                    onClick={handleDeliver}
                    disabled={delivering || checkingTerms}
                    className="rounded-lg bg-[#3F51B5] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#3545a0] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {delivering || checkingTerms ? 'Marking…' : 'Mark Delivered'}
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
          {order.status === 'fulfilled' && isSellerOfRecord && !isBuyerOfRecord && (
            <p>Downloads are available to the buyer of this order.</p>
          )}

          {(['fulfilled', 'delivered', 'completed'].includes(String(order.status)) || order.workspace_delivery) && isBuyerOfRecord && order.access_expired && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-6">
              <h2 className="text-lg font-semibold text-red-900">Download window expired</h2>
              <p className="mt-2 text-sm text-red-700">
                This order&apos;s download window has ended. No download access is available for this purchase.
              </p>
            </div>
          )}

          {order.workspace_delivery && isBuyerOfRecord && !order.access_expired && String(order.status)==='pending_delivery' && <WorkspacePurchaseRecovery key={order.id} orderId={order.id} onReady={setOrder} />}
          {order.workspace_delivery && isBuyerOfRecord && !order.access_expired && ['delivered','completed','fulfilled'].includes(String(order.status)) && (workspaceDownloadReady ? <WorkspaceDownload key={order.id} orderId={order.id} /> : <button type="button" disabled={checkingTerms} onClick={() => ensureTermsAccepted(() => setWorkspaceDownloadReady(true))} className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Continue to download</button>)}

          {['fulfilled', 'delivered', 'completed'].includes(String(order.status)) && !order.workspace_delivery && gatewayOrderId !== order.id && isBuyerOfRecord && !order.access_expired && (
            <div className="rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900">Downloads</h2>
              {downloadLoading ? (
                <p className="mt-2 text-sm text-gray-600">Preparing download access...</p>
              ) : orderAccess?.delivery_type === 'reference' && orderAccess.can_download && orderAccess.download_urls?.some((file) => /^https?:\/\//i.test(file.url)) ? (
                <ul className="mt-4 space-y-3">
                  {orderAccess.download_urls.filter((file) => /^https?:\/\//i.test(file.url)).map((file) => (
                    <li key={file.url}>
                      <ReferenceDownload url={file.url} filename={file.filename} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-gray-600">{downloadError || 'Download access is unavailable.'}</p>
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
                      <p className="text-sm text-gray-900">{orderEventLabel(event)}</p>
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

function ReferenceDownload({ url, filename }: { url: string; filename?: string | null }) {
  const { ensureTermsAccepted, TermsGatePrompt, checkingTerms, termsAccepted } = useTermsGate('buyer', {
    preloadAcceptance: true,
    requireAcceptance: true,
  });
  const [ready, setReady] = useState(false);

  return (
    <>
      {ready && termsAccepted ? (
        <a href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"
          className="text-sm text-[#3F51B5] hover:underline">
          {filename ? `Open download ${filename}` : 'Open download'}
        </a>
      ) : (
        <button type="button" disabled={checkingTerms}
          onClick={() => {
            if (termsAccepted) {
              window.open(url, '_blank', 'noopener,noreferrer');
            } else {
              void ensureTermsAccepted(() => setReady(true));
            }
          }}
          className="text-sm text-[#3F51B5] hover:underline">
          {filename ? `Download ${filename}` : 'Download'}
        </button>
      )}
      <TermsGatePrompt />
    </>
  );
}
