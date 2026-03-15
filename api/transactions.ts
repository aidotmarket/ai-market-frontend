import { api } from './client';
import type { Transaction, DeliverRequest } from '@/types';

export async function getMyTransactions(): Promise<Transaction[]> {
  const res = await api.get<Transaction[]>('/transactions');
  return res.data;
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

export async function getDownloadLink(txId: string): Promise<{ download_url: string }> {
  const res = await api.get<{ download_url: string }>(`/transactions/${encodeURIComponent(txId)}/download`);
  return res.data;
}
