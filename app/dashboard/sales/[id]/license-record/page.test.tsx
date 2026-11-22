// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
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
  afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks(); });

  it.each([
    ['pending_delivery', 'Awaiting delivery'],
    ['delivered', 'Delivered'],
  ])('shows %s alongside the active licence with seller navigation', async (status, label) => {
    const getSales = vi.spyOn(api, 'get').mockResolvedValue({ data: [{ id: 'order-1', status }] });
    render(<SellerLicenseRecordPage />);

    expect(await screen.findByRole('heading', { name: 'Licence record' })).not.toBeNull();
    expect(await screen.findByText(label)).toBe(screen.getByText('Delivery status').nextElementSibling);
    expect(screen.getByText('Licence status').nextElementSibling?.textContent).toBe('Active');
    expect(getSales).toHaveBeenCalledWith('/seller/orders', {
      params: { limit: 100, offset: 0 }, signal: expect.any(AbortSignal),
    });
    expect(screen.getByRole('link', { name: '← Back to sales' }).getAttribute('href')).toBe('/dashboard/sales');
    expect(screen.getByText('identified to ai.market under order ORDER-1')).not.toBeNull();
    expect(screen.getByText(backendRecord.identity_notice)).not.toBeNull();
    expect(screen.queryByText(/Buyer Ltd|Buyer Signer|Director/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Confirm deletion' })).toBeNull();
  });

  it('finds older orders on later unfiltered Sales pages', async () => {
    const getSales = vi.spyOn(api, 'get')
      .mockResolvedValueOnce({ data: Array.from({ length: 100 }, (_, index) => ({ id: `other-${index}`, status: 'pending_delivery' })) })
      .mockResolvedValueOnce({ data: [{ id: 'order-1', status: 'delivered' }] });
    render(<SellerLicenseRecordPage />);

    expect(await screen.findByText('Delivered')).toBe(screen.getByText('Delivery status').nextElementSibling);
    expect(getSales).toHaveBeenCalledTimes(2);
    expect(getSales).toHaveBeenLastCalledWith('/seller/orders', {
      params: { limit: 100, offset: 100 }, signal: expect.any(AbortSignal),
    });
  });

  it('keeps the licence visible if the Sales request fails', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(new Error('Sales unavailable'));
    render(<SellerLicenseRecordPage />);

    expect(await screen.findByText('Status unavailable')).toBe(screen.getByText('Delivery status').nextElementSibling);
    expect(screen.getByText('Licence status').nextElementSibling?.textContent).toBe('Active');
  });

  it('does not display counterparty details even if a response unexpectedly includes them', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: [] });
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
