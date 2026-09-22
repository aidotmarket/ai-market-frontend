export function buyerLicenseRecordPath(orderId: string): string {
  return `/dashboard/orders/${encodeURIComponent(orderId)}/license-record`;
}

// This is also the backend seller-notification link contract.
export function sellerLicenseRecordPath(orderId: string): string {
  return `/dashboard/sales/${encodeURIComponent(orderId)}/license-record`;
}
