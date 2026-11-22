// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import { privateReadOptions } from '@/api/privateReads';
import backendRecord from '@/tests/fixtures/s1735_license_record_seller.json';
import type { LicenseRecord } from '@/types';

const records = vi.hoisted(() => ({
  getLicenseRecord: vi.fn(), downloadLicenseRecordPdf: vi.fn(), confirmLicenseRecordDeletion: vi.fn(),
}));
vi.mock('@/api/licenseRecords', () => records);
vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'order-1' }) }));

const { default: SellerLicenseRecordPage } = await import('./page');
const orderPath = `/orders/${backendRecord.order.id}`;

describe('SellerLicenseRecordPage', () => {
  beforeEach(() => records.getLicenseRecord.mockResolvedValue(backendRecord as LicenseRecord));
  afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks(); });

  it.each([
    ['pending_delivery', 'Awaiting delivery'],
    ['delivered', 'Delivered'],
  ])('shows %s alongside the active licence when the seller lacks Sales access', async (status, label) => {
    const get = vi.spyOn(api, 'get').mockImplementation(async (url) => {
      if (url === orderPath) return { data: { id: backendRecord.order.id, status } };
      throw new Error('Seller capability is inactive');
    });
    render(<SellerLicenseRecordPage />);

    expect(await screen.findByRole('heading', { name: 'Licence record' })).not.toBeNull();
    expect(await screen.findByText(label)).toBe(screen.getByText('Delivery status').nextElementSibling);
    expect(screen.getByText('Licence status').nextElementSibling?.textContent).toBe('Active');
    expect(get).toHaveBeenCalledExactlyOnceWith(orderPath, {
      ...privateReadOptions, signal: expect.any(AbortSignal),
    });
    expect(screen.getByRole('link', { name: '← Back to sales' }).getAttribute('href')).toBe('/dashboard/sales');
    expect(screen.getByText('identified to ai.market under order ORDER-1')).not.toBeNull();
    expect(screen.getByText(backendRecord.identity_notice)).not.toBeNull();
    expect(screen.queryByText(/Buyer Ltd|Buyer Signer|Director/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Confirm deletion' })).toBeNull();
  });

  it('keeps the licence visible if the order request fails', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(new Error('Order unavailable'));
    render(<SellerLicenseRecordPage />);

    expect(await screen.findByText('Status unavailable')).toBe(screen.getByText('Delivery status').nextElementSibling);
    expect(screen.getByText('Licence status').nextElementSibling?.textContent).toBe('Active');
  });

  it('does not display counterparty details even if a response unexpectedly includes them', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { id: backendRecord.order.id, status: 'delivered' } });
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
