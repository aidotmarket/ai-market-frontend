import type { SellerOrderStatus } from '@/types';

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

export function isSellerOrderStatus(status: string): status is SellerOrderStatus {
  return Object.prototype.hasOwnProperty.call(SELLER_STATUS, status);
}

export function getSellerStatusPresentation(status: string): SellerStatusPresentation {
  return isSellerOrderStatus(status) ? SELLER_STATUS[status] : UNKNOWN_STATUS;
}
