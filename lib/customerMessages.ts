// Customer copy only: never pass server messages or internal codes to these helpers.
export function customerLoadError(thing: string): string {
  return `We couldn't load your ${thing} just now. Try again, or contact support if it keeps happening.`;
}

export function customerActionError(action: string): string {
  return `We couldn't ${action} just now. Try again, or contact support if it keeps happening.`;
}

export type CustomerRefusalTable = Readonly<Record<string, string | ((detail: string) => string | undefined)>>;

/** Match only reviewed server codes/strings; never display arbitrary server text. */
export function customerRefusal(error: unknown, table: CustomerRefusalTable, fallback: string): string {
  const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
  const root = record(error);
  const data = record(record(root.response).data);
  const detail = data.detail ?? root.detail;
  const value = record(detail);
  const candidates = [value.code, value.error, data.code, root.code, detail, value.message, root.message];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    if (Object.hasOwn(table, candidate) && typeof table[candidate] === 'string') return table[candidate] as string;
    for (const mapping of Object.values(table)) {
      if (typeof mapping === 'function') {
        const result = mapping(candidate);
        if (result) return result;
      }
    }
  }
  return fallback;
}

export const TWO_FACTOR_REFUSALS: CustomerRefusalTable = {
  'Invalid verification code': "That code didn't match. Enter the newest code from your authenticator app.",
  'Too many verification attempts. Wait up to 10 minutes, then restart 2FA setup.': 'Too many attempts. Wait up to 10 minutes, then restart two-factor authentication setup.',
  '2FA setup session expired': 'Your setup session expired. Restart two-factor authentication setup.',
};

export const INQUIRY_REFUSALS: CustomerRefusalTable = {
  'Message held for review. Please revise and try again.': 'Please revise your message before sending it again.',
  'Message could not be safely mediated. Please revise and try again.': 'Please revise your message before sending it again.',
  'Inquiry is closed': 'This conversation is closed. New messages cannot be sent.',
  'Already waiting for seller response': 'Your question is already waiting for a reply from the seller.',
};
