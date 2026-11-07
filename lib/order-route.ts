// Keep route identity identical to the order page's accepted UUID spellings.
export function canonicalOrderId(value: string): string {
  return value.replace(/^([0-9a-f]{8})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{12})$/i, (_, a, b, c, d, e) => [a, b, c, d, e].join('-').toLowerCase());
}

export function isOrderDetailPath(pathname: string, orderId: string): boolean {
  const match = /^\/dashboard\/orders\/([^/]+)\/?$/.exec(pathname);
  return !!match && canonicalOrderId(match[1]) === canonicalOrderId(orderId);
}
