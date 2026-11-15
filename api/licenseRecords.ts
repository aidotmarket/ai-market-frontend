import { api } from './client';
import { isAxiosError } from 'axios';
import { privateReadOptions } from './privateReads';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { LicenseDeletionConfirmation, LicenseRecord } from '@/types';

export async function getLicenseRecord(orderId: string): Promise<LicenseRecord> {
  const response = await api.get<LicenseRecord>(`/orders/${encodeURIComponent(orderId)}/license-record`, privateReadOptions);
  return response.data;
}

export async function downloadLicenseRecordPdf(orderId: string): Promise<Blob> {
  const response = await api.get<Blob>(`/orders/${encodeURIComponent(orderId)}/license-record`, {
    ...privateReadOptions,
    params: { format: 'pdf' },
    responseType: 'blob',
  });
  return response.data;
}

export const NO_RECORDED_LICENSE_DOCUMENT = 'No recorded licence document is available';
export const STANDARD_LICENSE_NO_DOCUMENT = 'STANDARD_LICENSE_NO_DOCUMENT';
export interface AcceptedLicenseDocument {
  blob: Blob;
  text: string | null;
  contentType: 'text/plain' | 'application/pdf';
}

// The order selects the accepted document, including retired documents. Never supply a listing/document ID.
export async function getAcceptedLicenseDocument(orderId: string, download: boolean, signal: AbortSignal): Promise<AcceptedLicenseDocument | typeof STANDARD_LICENSE_NO_DOCUMENT | null> {
  try {
    const response = await api.get<ArrayBuffer>(`/orders/${encodeURIComponent(orderId)}/license-document`, {
      ...privateReadOptions, signal, params: { download: download ? 1 : 0 }, responseType: 'arraybuffer',
    });
    signal.throwIfAborted();
    const policy = String(response.headers['cache-control'] ?? '').toLowerCase().split(',').map(value => value.trim());
    const contentType = String(response.headers['content-type'] ?? '').split(';')[0];
    if (!policy.includes('private') || !policy.includes('no-store') ||
        (contentType !== 'text/plain' && contentType !== 'application/pdf')) throw new Error('Licence document unavailable');
    const bytes = new Uint8Array(response.data);
    if (bytesToHex(sha256(bytes)) !== response.headers['x-license-source-sha256']) throw new Error('Licence document unavailable');
    return { blob: new Blob([response.data], { type: contentType }), contentType,
      text: contentType === 'text/plain' ? new TextDecoder().decode(bytes) : null };
  } catch (error) {
    signal.throwIfAborted();
    if (isAxiosError(error) && error.response?.status === 404) {
      const data = error.response.data;
      let code: unknown;
      let detail: unknown;
      try {
        const body = JSON.parse(new TextDecoder().decode(data));
        code = body?.code;
        detail = body?.detail;
      } catch { /* Non-JSON failures are unavailable, not pre-snapshot records. */ }
      if (code === STANDARD_LICENSE_NO_DOCUMENT) return STANDARD_LICENSE_NO_DOCUMENT;
      if (code === 'NO_RECORDED_DOCUMENT' || (code == null && detail === NO_RECORDED_LICENSE_DOCUMENT)) return null;
    }
    throw error;
  }
}

export async function confirmLicenseRecordDeletion(orderId: string): Promise<LicenseDeletionConfirmation> {
  const response = await api.post<LicenseDeletionConfirmation>(
    `/orders/${encodeURIComponent(orderId)}/license-record/deletion-confirmation`,
  );
  return response.data;
}
