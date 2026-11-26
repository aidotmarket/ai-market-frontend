'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getOrder, getSellerOrderMoneyStatement } from '@/api/orders';
import { findSellerDeliveryTransaction } from '@/api/transactions';
import { customerLoadError } from '@/lib/customerMessages';
import { formatDate, formatPrice } from '@/lib/format';
import type { BuyerOrderDetail, SellerOrder, SellerOrderMoneyStatement } from '@/types';

const cardFeeLabels = {
  A: 'Actual card processing fee (A)',
  S: 'Seller policy share (S)',
  G: 'Seller gap (G)',
  R: 'Seller recovery (R)',
} as const;
const cardFeeFields = ['A', 'S', 'G', 'R'] as const;

export default function SalesOrderDetails({ order }: { order: SellerOrder }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <details className="font-sans text-sm" onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary className="cursor-pointer font-medium text-[#3F51B5]">Order details</summary>
      {expanded && <OrderDetailsContent order={order} />}
    </details>
  );
}

function OrderDetailsContent({ order }: { order: SellerOrder }) {
  const [statement, setStatement] = useState<SellerOrderMoneyStatement | null>();
  const [detail, setDetail] = useState<BuyerOrderDetail>();
  const [statementError, setStatementError] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [transactionId, setTransactionId] = useState<string | null>();
  const awaitingDelivery = order.status === 'pending_delivery' && order.needs_action;

  useEffect(() => {
    const { id } = order;
    const controller = new AbortController();
    const { signal } = controller;

    void getSellerOrderMoneyStatement(id, signal).then((data) => {
      if (!signal.aborted) setStatement(data);
    }).catch(() => {
      if (!signal.aborted) setStatementError(true);
    });
    void getOrder(id, { signal }).then((data) => {
      if (data.id !== id) throw new Error('Order response mismatch');
      if (!signal.aborted) setDetail(data);
    }).catch(() => {
      if (!signal.aborted) setDetailError(true);
    });
    if (awaitingDelivery) {
      void findSellerDeliveryTransaction(id, signal).then((transaction) => {
        if (!signal.aborted) setTransactionId(transaction?.id ?? null);
      }).catch(() => {
        if (!signal.aborted) setTransactionId(null);
      });
    }
    return () => controller.abort();
  }, [order, awaitingDelivery]);

  return (
    <div className="mt-2 min-w-48 space-y-2 text-gray-700">
      <dl className="space-y-2">
        <div>
          <dt className="font-medium">Final payout</dt>
          <dd>
            {statementError ? customerLoadError('money statement')
              : statement === undefined ? 'Loading…'
              : statement?.net_transfer_cents ? formatPrice(statement.net_transfer_cents / 100)
              : 'Final payout not yet posted'}
          </dd>
        </div>
        {statement && cardFeeFields.map((field) => (
          <div key={field}>
            <dt className="font-medium">{cardFeeLabels[field]}</dt>
            <dd>{statement[field] == null ? '—' : formatPrice(statement[field] / 100)}</dd>
          </div>
        ))}
        {detail?.auto_confirm_at && (
          <div>
            <dt className="font-medium">Expected auto-confirmation</dt>
            <dd><time dateTime={detail.auto_confirm_at}>{formatDate(detail.auto_confirm_at)}</time></dd>
          </div>
        )}
        {detail?.confirmed_at && (
          <div>
            <dt className="font-medium">Confirmed</dt>
            <dd><time dateTime={detail.confirmed_at}>{formatDate(detail.confirmed_at)}</time></dd>
          </div>
        )}
      </dl>
      {detailError && <p>{customerLoadError('order details')}</p>}
      {awaitingDelivery && transactionId && (
        <Link href={`/dashboard/orders/${encodeURIComponent(order.id)}?tx=${encodeURIComponent(transactionId)}`} className="font-medium text-[#3F51B5] underline">
          Mark Delivered
        </Link>
      )}
      {awaitingDelivery && transactionId === null && (
        <p>Ask Claude to mark this order as delivered.</p>
      )}
    </div>
  );
}
