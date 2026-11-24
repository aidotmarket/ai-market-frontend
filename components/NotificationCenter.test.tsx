// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getNotificationClickAction, NotificationList } from './NotificationCenter';
import type { NotificationItem } from '@/api/notifications';

const baseNotification: NotificationItem = {
  id: 'n-1',
  user_id: 'u-1',
  type: 'support_ticket_status_changed',
  title: 'Ticket T-123 updated',
  body: 'Status changed to waiting customer',
  metadata: { public_ref: 'T-123' },
  link_url: '/support/tickets/T-123',
  read_at: null,
  archived_at: null,
  created_at: '2026-06-12T10:15:00Z',
  updated_at: '2026-06-12T10:15:00Z',
};

afterEach(cleanup);

describe('NotificationList', () => {
  it('renders support ticket notification types and read/unread states', () => {
    const notifications: NotificationItem[] = [
      baseNotification,
      {
        ...baseNotification,
        id: 'n-2',
        type: 'support_ticket_message',
        title: 'New support ticket message',
        body: 'Support replied on T-124',
        metadata: { public_ref: 'T-124' },
        link_url: '/support/tickets/T-124',
        read_at: '2026-06-12T10:20:00Z',
      },
    ];

    const html = renderToStaticMarkup(
      <NotificationList notifications={notifications} onNotificationClick={vi.fn()} />
    );

    expect(html).toContain('>Support ticket status changed</span>');
    expect(html).toContain('>Support ticket message</span>');
    expect(html).toContain('Unread notification');
    expect(html).toContain('Read notification');
    expect(html).toContain('Ticket T-123 updated');
    expect(html).toContain('New support ticket message');
  });

  it.each([
    ['data_request_matched', 'Data request match'],
    ['future_event_type', 'Future event type'],
  ])('uses a readable visible and accessible label for %s', (type, label) => {
    const notification = { ...baseNotification, type, title: 'A new update', body: null };
    render(<NotificationList notifications={[notification]} onNotificationClick={vi.fn()} />);

    const item = screen.getByRole('button', { name: new RegExp(`${label}$`) });
    expect(within(item).getByText(label)).toBeTruthy();
    expect(item.textContent).not.toContain(type);
  });

  it('routes support ticket notification clicks to allAI instead of the portal URL', () => {
    const action = getNotificationClickAction(baseNotification);

    expect(action).toEqual({ kind: 'allai', prompt: 'status of ticket T-123' });
    expect(action).not.toEqual({ kind: 'route', href: '/support/tickets/T-123' });
  });

  it('keeps generic notification links routable', () => {
    const action = getNotificationClickAction({
      ...baseNotification,
      type: 'order_fulfilled',
      title: 'Order ready',
      metadata: {},
      link_url: '/dashboard/orders/o-1',
    });

    expect(action).toEqual({ kind: 'route', href: '/dashboard/orders/o-1' });
  });

  it('shows a readable caption for an inquiry reply', () => {
    const notification: NotificationItem = {
      ...baseNotification,
      type: 'inquiry_replied',
      title: 'A seller replied to your inquiry',
      body: null,
      metadata: {},
      link_url: null,
    };

    const html = renderToStaticMarkup(
      <NotificationList notifications={[notification]} onNotificationClick={vi.fn()} />
    );

    expect(html).toContain('>Inquiry reply</span>');
    expect(html).not.toContain('inquiry_replied');
  });

  it('labels a terminated licence and keeps its record link routable', () => {
    const notification: NotificationItem = {
      ...baseNotification,
      type: 'license_terminated',
      title: 'Licence ended',
      body: 'Access has ended for this order',
      metadata: { order_id: 'o-1' },
      link_url: '/dashboard/sales/o-1/license-record',
    };

    const html = renderToStaticMarkup(
      <NotificationList notifications={[notification]} onNotificationClick={vi.fn()} />
    );

    expect(html).toContain('Licence terminated');
    expect(html).not.toContain('license_terminated');
    expect(html).toContain('Licence ended');
    expect(html).toContain('Access has ended for this order');
    expect(getNotificationClickAction(notification)).toEqual({
      kind: 'route',
      href: '/dashboard/sales/o-1/license-record',
    });
  });
});
