// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import backendRecord from '@/tests/fixtures/s1735_license_record_terminated.json';
import type { LicenseRecord } from '@/types';

const records = vi.hoisted(() => ({
  getLicenseRecord: vi.fn(), downloadLicenseRecordPdf: vi.fn(), confirmLicenseRecordDeletion: vi.fn(),
}));
vi.mock('@/api/licenseRecords', () => records);
vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'order-1' }) }));

const { default: LicenseRecordPage } = await import('./page');

const record: LicenseRecord = backendRecord as LicenseRecord;

describe('LicenseRecordPage', () => {
  beforeEach(() => {
    records.getLicenseRecord.mockResolvedValue(record);
    records.downloadLicenseRecordPdf.mockResolvedValue(new Blob(['pdf']));
    records.confirmLicenseRecordDeletion.mockResolvedValue({ status: 'confirmed', occurred_at: '2026-09-22T11:00:00Z' });
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:record'), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });

  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('renders the database-backed record, downloads PDF and exposes deletion confirmation', async () => {
    render(<LicenseRecordPage />);

    expect(await screen.findByRole('heading', { name: 'Licence record' })).not.toBeNull();
    expect(screen.getByText('Buyer Ltd (GB)')).not.toBeNull();
    expect(screen.getByText('identified to ai.market under order ORDER-1')).not.toBeNull();
    expect(screen.getByText(record.identity_notice)).not.toBeNull();
    expect(screen.queryByText(/Seller LLC/)).toBeNull();
    expect(screen.getByText('Terminated')).not.toBeNull();
    expect(screen.getByText(/Delete the dataset and all copies/)).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
    await waitFor(() => expect(records.downloadLicenseRecordPdf).toHaveBeenCalledWith('order-1'));

    fireEvent.click(screen.getByRole('button', { name: 'Confirm deletion' }));
    await waitFor(() => expect(records.confirmLicenseRecordDeletion).toHaveBeenCalledWith('order-1'));
    expect(await screen.findByText(/Deletion confirmed/)).not.toBeNull();
  });
});
