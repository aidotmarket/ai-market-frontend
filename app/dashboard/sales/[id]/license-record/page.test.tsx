// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import backendRecord from '@/tests/fixtures/s1735_license_record_seller.json';
import type { LicenseRecord } from '@/types';

const records = vi.hoisted(() => ({
  getLicenseRecord: vi.fn(), downloadLicenseRecordPdf: vi.fn(), confirmLicenseRecordDeletion: vi.fn(),
}));
vi.mock('@/api/licenseRecords', () => records);
vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'order-1' }) }));

const { default: SellerLicenseRecordPage } = await import('./page');

describe('SellerLicenseRecordPage', () => {
  beforeEach(() => records.getLicenseRecord.mockResolvedValue(backendRecord as LicenseRecord));
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('uses the backend record contract with seller navigation and no buyer deletion action', async () => {
    render(<SellerLicenseRecordPage />);

    expect(await screen.findByRole('heading', { name: 'Licence record' })).not.toBeNull();
    expect(screen.getByRole('link', { name: '← Back to sales' }).getAttribute('href')).toBe('/dashboard/sales');
    expect(screen.getByText('identified to ai.market under order ORDER-1')).not.toBeNull();
    expect(screen.getByText(backendRecord.identity_notice)).not.toBeNull();
    expect(screen.queryByText(/Buyer Ltd|Buyer Signer|Director/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Confirm deletion' })).toBeNull();
  });

  it('does not display counterparty details even if a response unexpectedly includes them', async () => {
    records.getLicenseRecord.mockResolvedValue({
      ...backendRecord,
      buyer: { legal_name: 'Private Buyer Ltd', jurisdiction: 'GB', user_id: 'private-user' },
      signature: { ...backendRecord.signature, typed_name: 'Private Signer', signer_title: 'Director' },
    });

    render(<SellerLicenseRecordPage />);

    expect(await screen.findByText('Identified to ai.market for this order')).not.toBeNull();
    expect(screen.queryByText(/Private Buyer|Private Signer|Director|private-user/)).toBeNull();
  });
});
