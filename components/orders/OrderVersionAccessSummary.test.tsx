import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import OrderVersionAccessSummary, { formatTimeRemaining } from './OrderVersionAccessSummary';
import type { BuyerOrder } from '@/types';

const baseOrder: BuyerOrder = {
  id: 'order-1',
  listing_id: 'listing-1',
  listing_title: 'Dataset',
  seller_name: 'Seller',
  amount: 10,
  status: 'fulfilled',
  created_at: '2026-06-01T00:00:00Z',
  updated_at: null,
};

describe('OrderVersionAccessSummary', () => {
  it('shows active purchased version and newer-version affordance without superseded label', () => {
    const html = renderToStaticMarkup(
      <OrderVersionAccessSummary
        order={{
          ...baseOrder,
          purchased_version: { version_id: 'v1-id', version_label: 'v1', status: 'active' },
          newer_version_available: true,
        }}
      />,
    );

    expect(html).toContain('Purchased version:');
    expect(html).toContain('v1');
    expect(html).not.toContain('(superseded)');
    expect(html).toContain('Newer version available');
    expect(html).toContain('/listings/listing-1');
    expect(html).not.toContain('?version=');
  });

  it('surfaces an already-superseded purchased version honestly', () => {
    const html = renderToStaticMarkup(
      <OrderVersionAccessSummary
        order={{
          ...baseOrder,
          purchased_version: { version_id: 'v1-id', version_label: 'v1', status: 'superseded' },
          newer_version_available: false,
        }}
      />,
    );

    expect(html).toContain('v1');
    expect(html).toContain('(superseded)');
    expect(html).not.toContain('Newer version available');
  });

  it('shows time remaining before expiry', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T00:00:00Z'));

    expect(formatTimeRemaining('2026-07-04T00:00:00Z')).toBe('3 days');

    vi.useRealTimers();
  });

  it('shows expired state without a download affordance', () => {
    const html = renderToStaticMarkup(
      <OrderVersionAccessSummary
        order={{
          ...baseOrder,
          access_expires_at: '2026-06-02T00:00:00Z',
          access_expired: true,
        }}
      />,
    );

    expect(html).toContain('Download window ended');
    expect(html).not.toContain('View downloads');
    expect(html).not.toContain('Download</');
    expect(html).not.toContain('Refresh');
  });
});
