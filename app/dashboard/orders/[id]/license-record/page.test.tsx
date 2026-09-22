// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const records = vi.hoisted(() => ({
  getLicenseRecord: vi.fn(), downloadLicenseRecordPdf: vi.fn(), confirmLicenseRecordDeletion: vi.fn(),
}));
vi.mock('@/api/licenseRecords', () => records);
vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'order-1' }) }));

const { default: LicenseRecordPage } = await import('./page');

const record = {
  order_id: 'order-1', listing_id: 'listing-1', listing_title: 'Licensed dataset',
  accepted_at: '2026-09-22T10:00:00Z', status: 'terminated' as const, channel: 'web',
  typed_name: 'Ada Buyer', signer_title: 'Director',
  buyer: { legal_name: 'Buyer Data Ltd', jurisdiction: 'GB' },
  seller: { legal_name: 'Seller Data Inc', jurisdiction: 'US' },
  license: { title: 'Standard licence', text: 'Exact licence text', sha256: 'a'.repeat(64) },
  covenant: { title: 'Marketplace covenant', text: 'Exact covenant text', sha256: 'b'.repeat(64) },
  rider: null, deletion_due_at: '2026-10-22T10:00:00Z', deletion_confirmation_available: true,
};

describe('LicenseRecordPage', () => {
  beforeEach(() => {
    records.getLicenseRecord.mockResolvedValue(record);
    records.downloadLicenseRecordPdf.mockResolvedValue(new Blob(['pdf']));
    records.confirmLicenseRecordDeletion.mockResolvedValue({ ...record, deletion_confirmation_available: false, deletion_confirmed_at: '2026-09-22T11:00:00Z' });
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:record'), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });

  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('renders the database-backed record, downloads PDF and exposes deletion confirmation', async () => {
    render(<LicenseRecordPage />);

    expect(await screen.findByRole('heading', { name: 'Licence record' })).not.toBeNull();
    expect(screen.getByText('Buyer Data Ltd (GB)')).not.toBeNull();
    expect(screen.getByText('Seller Data Inc (US)')).not.toBeNull();
    expect(screen.getByText('Terminated')).not.toBeNull();
    expect(screen.getByText(/Delete the dataset and all copies/)).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
    await waitFor(() => expect(records.downloadLicenseRecordPdf).toHaveBeenCalledWith('order-1'));

    fireEvent.click(screen.getByRole('button', { name: 'Confirm deletion' }));
    await waitFor(() => expect(records.confirmLicenseRecordDeletion).toHaveBeenCalledWith('order-1'));
    expect(await screen.findByText(/Deletion confirmed/)).not.toBeNull();
  });
});
