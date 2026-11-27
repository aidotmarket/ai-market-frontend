// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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

async function renderRecord(status?: string | string[]) {
  return render(await SellerLicenseRecordPage({ searchParams: Promise.resolve({ status }) }));
}

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
    await renderRecord();

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
    await renderRecord();

    expect(await screen.findByText('Status unavailable')).toBe(screen.getByText('Delivery status').nextElementSibling);
    expect(screen.getByText('Licence status').nextElementSibling?.textContent).toBe('Active');
    expect(screen.queryByText('Payment status')).toBeNull();
  });

  it('does not display counterparty details even if a response unexpectedly includes them', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { id: backendRecord.order.id, status: 'delivered' } });
    records.getLicenseRecord.mockResolvedValue({
      ...backendRecord,
      buyer: { legal_name: 'Private Buyer Ltd', jurisdiction: 'GB', user_id: 'private-user' },
      signature: { ...backendRecord.signature, typed_name: 'Private Signer', signer_title: 'Director' },
    });

    await renderRecord();

    expect(await screen.findByText('Identified to ai.market for this order')).not.toBeNull();
    expect(screen.queryByText(/Private Buyer|Private Signer|Director|private-user/)).toBeNull();
  });

  it.each([
    ['completed', '/dashboard/sales?status=completed'],
    ['/register', '/dashboard/sales'],
    [['all', 'completed'], '/dashboard/sales'],
  ])('validates the return filter %j', async (filter, href) => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { status: 'completed' } });
    await renderRecord(filter);

    expect((await screen.findByRole('link', { name: '← Back to sales' })).getAttribute('href')).toBe(href);
  });

  it.each([
    [{ status: 'completed', amount_cents: 1000, paid_at: '2026-11-23T12:00:00Z' }, 'Paid on Nov 23, 2026'],
    [{ status: 'created', amount_cents: 1000, paid_at: null }, 'Payment pending'],
    [{ status: 'completed', amount_cents: 0, paid_at: '2026-11-23T12:00:00Z' }, 'No payment due'],
  ])('shows the payment state from the existing order response', async (data, label) => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data });
    await renderRecord();

    expect((await screen.findByText(label)).closest('dd')).toBe(screen.getByText('Payment status').nextElementSibling);
    expect(get).toHaveBeenCalledExactlyOnceWith(orderPath, {
      ...privateReadOptions, signal: expect.any(AbortSignal),
    });
  });

  it.each([
    ['refunded', 'Refunded'],
    ['partially_refunded', 'Partially refunded'],
  ])('shows the %s payment state with the original paid date', async (status, label) => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({
      data: { status, amount_cents: 1000, paid_at: '2026-11-23T12:00:00Z' },
    });
    await renderRecord();

    const paymentStatus = within((await screen.findByText('Payment status')).parentElement!);
    expect(paymentStatus.getByText(label)).toBeTruthy();
    expect(paymentStatus.getByText('Paid on Nov 23, 2026')).toBeTruthy();
    expect(get).toHaveBeenCalledExactlyOnceWith(orderPath, {
      ...privateReadOptions, signal: expect.any(AbortSignal),
    });
  });

  it('shows PDF progress and restores the download button on failure', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { status: 'completed' } });
    let rejectDownload!: (error: Error) => void;
    records.downloadLicenseRecordPdf.mockReturnValueOnce(new Promise((_, reject) => {
      rejectDownload = reject;
    }));
    await renderRecord();

    fireEvent.click(await screen.findByRole('button', { name: 'Download PDF' }));
    expect((screen.getByRole('button', { name: 'Preparing PDF…' }) as HTMLButtonElement).disabled).toBe(true);
    rejectDownload(new Error('Download unavailable'));

    expect((await screen.findByRole('alert')).textContent).toMatch(/PDF could not be downloaded/);
    expect((screen.getByRole('button', { name: 'Download PDF' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
