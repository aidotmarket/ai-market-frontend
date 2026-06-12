import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
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

    expect(html).toContain('support_ticket_status_changed');
    expect(html).toContain('support_ticket_message');
    expect(html).toContain('Unread notification');
    expect(html).toContain('Read notification');
    expect(html).toContain('Ticket T-123 updated');
    expect(html).toContain('New support ticket message');
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
});
