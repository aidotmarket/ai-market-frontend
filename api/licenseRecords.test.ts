import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('./client', () => ({ api }));

const { confirmLicenseRecordDeletion, downloadLicenseRecordPdf, getLicenseRecord } = await import('./licenseRecords');

describe('licence record API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads the authorised on-demand record', async () => {
    api.get.mockResolvedValue({ data: { order_id: 'order/1' } });
    await getLicenseRecord('order/1');
    expect(api.get).toHaveBeenCalledWith('/orders/order%2F1/license-record');
  });

  it('requests the deterministic PDF representation from the same record endpoint', async () => {
    api.get.mockResolvedValue({ data: new Blob(['pdf']) });
    await downloadLicenseRecordPdf('order-1');
    expect(api.get).toHaveBeenCalledWith('/orders/order-1/license-record', {
      params: { format: 'pdf' }, responseType: 'blob',
    });
  });

  it('posts deletion confirmation to the backend contract path', async () => {
    api.post.mockResolvedValue({ data: { status: 'confirmed', occurred_at: '2026-09-22T11:00:00Z' } });
    await confirmLicenseRecordDeletion('order-1');
    expect(api.post).toHaveBeenCalledWith('/orders/order-1/license-record/deletion-confirmation');
  });
});
