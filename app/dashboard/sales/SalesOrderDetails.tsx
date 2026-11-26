'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getOrder } from '@/api/orders';
import { customerLoadError } from '@/lib/customerMessages';
import { formatDate } from '@/lib/format';
import type { BuyerOrderDetail, SellerOrder } from '@/types';

export default function SalesOrderDetails({ order }: { order: SellerOrder }) {
  const [expanded, setExpanded] = useState(false);
  const pendingDelivery = order.status === 'pending_delivery';
  if (pendingDelivery && !order.needs_action) return null;

  return (
    <details className="font-sans text-sm" onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary className="cursor-pointer font-medium text-[#3F51B5]">Order details</summary>
      {expanded && (
        <div className="mt-2 min-w-48 space-y-2 text-gray-700">
          {pendingDelivery ? (
            <p>Ask <Link href="/docs/claude" className="font-medium text-[#3F51B5] underline">Claude</Link> to mark this order as delivered.</p>
          ) : (
            <ConfirmationDate key={order.id} orderId={order.id} />
          )}
        </div>
      )}
    </details>
  );
}

function ConfirmationDate({ orderId }: { orderId: string }) {
  const [result, setResult] = useState<{ detail: BuyerOrderDetail } | { failed: true }>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    void getOrder(orderId, { signal }).then((detail) => {
      if (detail.id !== orderId) throw new Error('Order response mismatch');
      if (!signal.aborted) setResult({ detail });
    }).catch(() => {
      if (!signal.aborted) setResult({ failed: true });
    });
    return () => controller.abort();
  }, [orderId, attempt]);

  if (!result) return <p role="status">Loading order details…</p>;
  if ('failed' in result) {
    return (
      <>
        <p>{customerLoadError('order details')}</p>
        <button type="button" className="font-medium text-[#3F51B5] underline" onClick={() => {
          setResult(undefined);
          setAttempt(attempt + 1);
        }}>Try again</button>
      </>
    );
  }

  const { status, auto_confirm_at, confirmed_at } = result.detail;
  const date = confirmed_at || (status === 'delivered' ? auto_confirm_at : null);
  if (!date) return <p>No confirmation date available.</p>;

  return (
    <dl>
      <dt className="font-medium">{confirmed_at ? 'Confirmed' : 'Expected auto-confirmation'}</dt>
      <dd><time dateTime={date}>{formatDate(date)}</time></dd>
    </dl>
  );
}
