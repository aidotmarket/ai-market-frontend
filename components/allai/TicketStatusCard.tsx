'use client';

export interface TicketStatusCardData {
  public_ref: string;
  status: string;
  priority: string;
  issue_class: string;
  collapsed: boolean;
  updated_at: string;
  last_ticket_message_at: string | null;
}

function formatDateTime(value: string | null): string {
  if (!value) return 'None';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatValue(value: string): string {
  return value.replace(/_/g, ' ');
}

export default function TicketStatusCard({ card }: { card: TicketStatusCardData }) {
  return (
    <div className="my-2 rounded-lg border border-emerald-300/30 bg-emerald-950/25 p-3 text-white/90">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-emerald-200">Ticket</span>
        <span className="rounded-md bg-white/10 px-2 py-0.5 font-mono text-xs text-white">{card.public_ref}</span>
        {card.collapsed && (
          <span className="rounded-full border border-amber-300/40 bg-amber-400/10 px-2 py-0.5 text-xs font-medium text-amber-100">
            collapsed=true
          </span>
        )}
      </div>

      <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-white/45">public_ref</dt>
          <dd className="font-medium text-white">{card.public_ref}</dd>
        </div>
        <div>
          <dt className="text-white/45">status</dt>
          <dd className="font-medium capitalize text-white">{formatValue(card.status)}</dd>
        </div>
        <div>
          <dt className="text-white/45">priority</dt>
          <dd className="font-medium capitalize text-white">{formatValue(card.priority)}</dd>
        </div>
        <div>
          <dt className="text-white/45">issue_class</dt>
          <dd className="font-medium capitalize text-white">{formatValue(card.issue_class)}</dd>
        </div>
        <div>
          <dt className="text-white/45">collapsed</dt>
          <dd className="font-medium text-white">{String(card.collapsed)}</dd>
        </div>
        <div>
          <dt className="text-white/45">updated_at</dt>
          <dd className="font-medium text-white">{formatDateTime(card.updated_at)}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-white/45">last_ticket_message_at</dt>
          <dd className="font-medium text-white">{formatDateTime(card.last_ticket_message_at)}</dd>
        </div>
      </dl>
    </div>
  );
}
