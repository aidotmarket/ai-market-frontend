import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('./client', () => ({ api }));

const { downloadLicenseRecordPdf, getLicenseRecord } = await import('./licenseRecords');

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
});
