import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import TicketStatusCard, { type TicketStatusCardData } from './TicketStatusCard';

describe('TicketStatusCard', () => {
  it('renders all seven binding fields and the collapsed badge', () => {
    const card: TicketStatusCardData = {
      public_ref: 'T-123',
      status: 'waiting_customer',
      priority: 'high',
      issue_class: 'billing',
      collapsed: true,
      updated_at: '2026-06-12T10:15:00Z',
      last_ticket_message_at: '2026-06-12T10:10:00Z',
    };

    const html = renderToStaticMarkup(<TicketStatusCard card={card} />);

    expect(html).toContain('public_ref');
    expect(html).toContain('T-123');
    expect(html).toContain('status');
    expect(html).toContain('waiting customer');
    expect(html).toContain('priority');
    expect(html).toContain('high');
    expect(html).toContain('issue_class');
    expect(html).toContain('billing');
    expect(html).toContain('collapsed');
    expect(html).toContain('true');
    expect(html).toContain('collapsed=true');
    expect(html).toContain('updated_at');
    expect(html).toContain('last_ticket_message_at');
  });
});
