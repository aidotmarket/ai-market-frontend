export const checkoutDomainEnabled = () => process.env.NEXT_PUBLIC_CHECKOUT_DOMAIN_SERVICE_ENABLED === 'true';

export const CHECKOUT_HANDOFF_PATH = /^\/checkout\/h\/[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048](?![\s\S])/;
export const validHandoffToken = (token: string) => /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048](?![\s\S])/.test(token);

/** Accept only the canonical first-party handoff returned by the server. */
export function checkoutContinuation(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('https://ai.market/')) return null;
  const path = value.slice('https://ai.market'.length);
  return CHECKOUT_HANDOFF_PATH.test(path) ? path : null;
}

export function checkoutWebPath(value: unknown): string | undefined {
  return typeof value === 'string' && !value.split('/').some(part => part === '.' || part === '..')
    && /^\/(?:listings|dashboard|legal|settings)(?:\/[A-Za-z0-9._~-]+)*(?![\s\S])/.test(value)
    ? value : undefined;
}

export function paymentUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.startsWith('https://checkout.stripe.com/') || /[\s\\]/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.origin === 'https://checkout.stripe.com' && !url.username && !url.password;
  } catch { return false; }
}

export function checkoutDestination(result: { checkout_url?: string | null; order_id?: string }): string | null {
  if (paymentUrl(result.checkout_url)) return result.checkout_url;
  if (result.checkout_url == null && result.order_id) return `/dashboard/orders/${encodeURIComponent(result.order_id)}`;
  return null;
}

export function checkoutErrorCode(error: unknown): string | undefined {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (detail && typeof detail === 'object' && 'code' in detail && typeof detail.code === 'string') return detail.code;
}

/** Only explicit domain outcomes can release a possibly reserved purchase claim. */
export function checkoutOutcome(error: unknown): 'retry' | 'auth' | 'operator' | 'terminal' | 'rejected' {
  const status = (error as { response?: { status?: number } })?.response?.status;
  const code = checkoutErrorCode(error);
  if (status === 401 || status === 403) return 'auth';
  if (code === 'CHECKOUT_OPERATOR_RECONCILIATION_REQUIRED') return 'operator';
  if (status === 409 && ['CHECKOUT_FAILED', 'CHECKOUT_PAYMENT_CONFLICT', 'CHECKOUT_REFUNDED', 'CHECKOUT_TERMINAL'].includes(code || '')) return 'terminal';
  // These checks run only after the backend has found no existing attempt.
  if (status != null && [400, 409, 422].includes(status) && [
    'HANDOFF_UNAVAILABLE', 'HANDOFF_TERMS_CHANGED', 'CHECKOUT_FACTS_CHANGED',
    'LISTING_UNAVAILABLE', 'OWN_LISTING', 'PRICE_INVALID', 'CURRENCY_UNSUPPORTED',
    'ACTIVE_ORDER', 'LISTING_VERSION_UNAVAILABLE', 'SELLER_TERMS_ACCEPTANCE_PENDING',
    'SELLER_PAYOUT_READINESS_UNKNOWN', 'SELLER_PAYOUT_NOT_READY', 'REFERENCE_DELIVERY_UNREADY',
    'WORKSPACE_DELIVERY_UNREADY', 'DELIVERY_READINESS_UNKNOWN', 'SYNTHETIC_PURCHASE_REQUIRES_E2E_GUARD',
    'TERMS_ACCEPTANCE_REQUIRED', 'LICENSE_ACCEPTANCE_STALE', 'LICENSE_RIDER_ACCEPTANCE_STALE',
    'LICENSE_ACCEPTANCE_INVALID', 'LICENSE_AUTHORITY_REQUIRED', 'BUYER_LEGAL_IDENTITY_REQUIRED',
    'LEGAL_IDENTITY_CONFLICT',
  ].includes(code || '')) return 'rejected';
  return 'retry';
}

export function checkoutBlock(code: unknown, path: unknown): { code: string; message: string; webPath?: string } | null {
  const messages: Record<string, string> = {
    SELLER_PAYOUT_READINESS_UNKNOWN: 'Seller payout readiness could not be verified. Checkout is blocked.',
    SELLER_PAYOUT_NOT_READY: 'The seller is not ready to receive payment. Checkout is blocked.',
    REFERENCE_DELIVERY_UNREADY: 'Reference delivery is not ready. Checkout is blocked.',
  };
  if (typeof code !== 'string' || !Object.hasOwn(messages, code)) return null;
  return { code, message: messages[code], ...(checkoutWebPath(path) ? { webPath: checkoutWebPath(path) } : {}) };
}
