import { api } from './client';
import { privateReadOptions } from './privateReads';
import type { Transaction, DeliverRequest } from '@/types';

export async function getMyTransactions(): Promise<Transaction[]> {
  const res = await api.get<Transaction[]>('/transactions');
  return res.data;
}

export async function findSellerDeliveryTransaction(orderId: string, signal: AbortSignal): Promise<Transaction | null> {
  const limit = 100;
  for (let offset = 0; !signal.aborted; offset += limit) {
    const { data } = await api.get<Transaction[]>('/transactions', {
      ...privateReadOptions, signal, params: { status: 'fulfilling', limit, offset },
    });
    const transaction = data.find((item) => item.order_id === orderId && item.status === 'fulfilling');
    if (transaction) return transaction;
    if (data.length < limit) break;
  }
  return null;
}

export async function getTransaction(txId: string): Promise<Transaction> {
  const res = await api.get<Transaction>(`/transactions/${encodeURIComponent(txId)}`);
  return res.data;
}

export async function deliverTransaction(txId: string, body: DeliverRequest): Promise<Transaction> {
  const res = await api.post<Transaction>(`/transactions/${encodeURIComponent(txId)}/deliver`, body);
  return res.data;
}

export async function confirmTransaction(txId: string): Promise<Transaction> {
  const res = await api.post<Transaction>(`/transactions/${encodeURIComponent(txId)}/confirm`);
  return res.data;
}
