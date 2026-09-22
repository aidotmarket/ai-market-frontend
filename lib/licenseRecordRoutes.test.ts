import { describe, expect, it } from 'vitest';
import { buyerLicenseRecordPath, sellerLicenseRecordPath } from './licenseRecordRoutes';

describe('licence record route contract', () => {
  it('matches the buyer history and backend seller-notification paths', () => {
    expect(buyerLicenseRecordPath('order/1')).toBe('/dashboard/orders/order%2F1/license-record');
    expect(sellerLicenseRecordPath('order/1')).toBe('/dashboard/sales/order%2F1/license-record');
  });
});
