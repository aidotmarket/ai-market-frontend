// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import backendRecord from '@/tests/fixtures/s1735_license_record.json';

const records = vi.hoisted(() => ({
  getLicenseRecord: vi.fn(), downloadLicenseRecordPdf: vi.fn(), confirmLicenseRecordDeletion: vi.fn(),
}));
vi.mock('@/api/licenseRecords', () => records);
vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'order-1' }) }));

const { default: SellerLicenseRecordPage } = await import('./page');

describe('SellerLicenseRecordPage', () => {
  beforeEach(() => records.getLicenseRecord.mockResolvedValue(backendRecord));
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('uses the backend record contract with seller navigation and no buyer deletion action', async () => {
    render(<SellerLicenseRecordPage />);

    expect(await screen.findByRole('heading', { name: 'Licence record' })).not.toBeNull();
    expect(screen.getByRole('link', { name: '← Back to sales' }).getAttribute('href')).toBe('/dashboard/sales');
    expect(screen.getByText('Buyer Ltd (GB)')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Confirm deletion' })).toBeNull();
  });
});
