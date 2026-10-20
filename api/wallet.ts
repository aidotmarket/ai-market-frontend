import axios from 'axios';
import { paymentUrl } from '@/lib/checkout-domain';

// Deliberately interceptor-free: every operation receives its captured credential.
const wallet = axios.create({
  baseURL: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
});
const headers = (token: string) => ({ Authorization: `Bearer ${token}` });
export const walletStatus = (error: unknown) =>
  (error as { response?: { status?: number } } | null)?.response?.status;

export function parseWalletAmount(text: string): number | null {
  const value = text.trim();
  if (!/^[0-9]+(?:\.[0-9]{1,2})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const digits = `${whole}${fraction.padEnd(2, '0')}`.replace(/^0+/, '') || '0';
  if (digits.length > 9) return null;
  const cents = Number(digits);
  return Number.isSafeInteger(cents) && cents >= 500 && cents <= 100000000 ? cents : null;
}

export interface WalletBalance { user_id: string; balance_cents: number; currency: 'USD' }
export interface WalletTransaction {
  id: string;
  wallet_id: string;
  transaction_type: string;
  amount_cents: number;
  balance_after_cents: number;
  description: string;
  reference_id: string | null;
  created_at: string;
}
export interface WalletHistory { transactions: WalletTransaction[]; total: number; has_more: boolean }
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object';
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const cents = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value);

export async function resolveWalletOwner(token: string, signal: AbortSignal): Promise<string> {
  const { data } = await wallet.get<unknown>('/auth/me', { headers: headers(token), signal });
  if (!record(data) || !nonempty(data.id) || data.status !== 'active') throw new Error('INVALID_OWNER');
  return data.id;
}

export async function getWalletBalance(token: string, owner: string, signal: AbortSignal): Promise<WalletBalance> {
  const { data } = await wallet.get<unknown>('/wallet/balance', { headers: headers(token), signal });
  if (!record(data) || data.user_id !== owner || data.currency !== 'USD' || !cents(data.balance_cents)) {
    throw new Error('INVALID_BALANCE');
  }
  return { user_id: owner, currency: 'USD', balance_cents: data.balance_cents };
}

export async function getWalletHistory(token: string, offset: number, signal: AbortSignal): Promise<WalletHistory> {
  const { data } = await wallet.get<unknown>('/wallet/transactions', {
    headers: headers(token), signal, params: { limit: 20, offset },
  });
  if (!record(data) || !Array.isArray(data.transactions) || data.transactions.length > 20
    || !cents(data.total) || data.total < data.transactions.length || typeof data.has_more !== 'boolean') throw new Error('INVALID_HISTORY');
  const ids = new Set<string>();
  for (const row of data.transactions) {
    if (!record(row) || !nonempty(row.id) || ids.has(row.id) || !nonempty(row.wallet_id)
      || typeof row.transaction_type !== 'string' || !['top_up', 'purchase', 'refund', 'withdrawal', 'adjustment'].includes(row.transaction_type)
      || !cents(row.amount_cents) || !cents(row.balance_after_cents) || typeof row.description !== 'string'
      || !(row.reference_id === null || typeof row.reference_id === 'string')
      || typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at))) throw new Error('INVALID_HISTORY');
    ids.add(row.id);
  }
  return data as unknown as WalletHistory;
}

export async function createWalletTopup(token: string, amount: number, origin: string, signal: AbortSignal): Promise<string> {
  const { data } = await wallet.post<unknown>('/wallet/topup', {
    amount_cents: amount,
    success_url: `${origin}/dashboard/settings/wallet?topup=return`,
    cancel_url: `${origin}/dashboard/settings/wallet?topup=cancelled`,
  }, { headers: headers(token), signal });
  if (!record(data) || !nonempty(data.session_id) || !cents(data.amount_cents)
    || data.amount_cents !== amount || !paymentUrl(data.checkout_url)) throw new Error('INVALID_TOPUP');
  return data.checkout_url;
}
