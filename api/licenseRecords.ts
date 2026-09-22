import { api } from './client';
import type { LicenseRecord } from '@/types';

export async function getLicenseRecord(orderId: string): Promise<LicenseRecord> {
  const response = await api.get<LicenseRecord>(`/orders/${encodeURIComponent(orderId)}/license-record`);
  return response.data;
}

export async function downloadLicenseRecordPdf(orderId: string): Promise<Blob> {
  const response = await api.get<Blob>(`/orders/${encodeURIComponent(orderId)}/license-record`, {
    params: { format: 'pdf' },
    responseType: 'blob',
  });
  return response.data;
}

export async function confirmLicenseRecordDeletion(orderId: string): Promise<LicenseRecord> {
  const response = await api.post<LicenseRecord>(
    `/orders/${encodeURIComponent(orderId)}/license-record/deletion-confirmed`,
  );
  return response.data;
}
