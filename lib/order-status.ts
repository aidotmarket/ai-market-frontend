import type { OrderStatus } from '@/types';

const NEUTRAL = 'bg-gray-100 text-gray-600';
const PENDING = 'bg-yellow-100 text-yellow-800';
const SUCCESS = 'bg-green-100 text-green-800';
const ATTENTION = 'bg-red-100 text-red-800';

const PRESENTATION: Record<OrderStatus, { label: string; badge: string }> = {
  created: { label: 'Created', badge: NEUTRAL },
  paid: { label: 'Paid', badge: 'bg-indigo-100 text-indigo-800' },
  in_escrow: { label: 'In escrow', badge: PENDING },
  pending_delivery: { label: 'Pending delivery', badge: PENDING },
  delivered: { label: 'Delivered', badge: SUCCESS },
  completed: { label: 'Completed', badge: SUCCESS },
  disputed: { label: 'Disputed', badge: ATTENTION },
  resolved: { label: 'Resolved', badge: NEUTRAL },
  delivery_failed: { label: 'Delivery failed', badge: ATTENTION },
  partially_refunded: { label: 'Partially refunded', badge: NEUTRAL },
  refunded: { label: 'Refunded', badge: NEUTRAL },
  cancelled: { label: 'Cancelled', badge: NEUTRAL },
  pending_fulfillment: { label: 'Pending Fulfillment', badge: PENDING },
  fulfilled: { label: 'Fulfilled', badge: SUCCESS },
  payment_failed: { label: 'Payment Failed', badge: ATTENTION },
};

export function orderStatusPresentation(status: string): { label: string; badge: string } {
  return Object.hasOwn(PRESENTATION, status)
    ? PRESENTATION[status as OrderStatus]
    : { label: 'Unknown', badge: NEUTRAL };
}

// Navigation only: matches known active backend orders, plus legacy purchases.
// This does not establish payment, download rights, expiry or revocation.
export function isExistingPurchaseStatus(status: string): boolean {
  return [
    'created', 'paid', 'in_escrow', 'pending_delivery', 'delivered', 'completed',
    'disputed', 'resolved', 'delivery_failed', 'partially_refunded',
    'pending_fulfillment', 'fulfilled',
  ].includes(status);
}

// Links lead to the existing order detail, where access is reauthorized.
export function hasDeliveredOrderNavigation(status: string): boolean {
  return ['delivered', 'completed', 'fulfilled'].includes(status);
}
