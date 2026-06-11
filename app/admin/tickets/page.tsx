'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createSupportTicketMessage,
  getSupportEmailDurabilityMetrics,
  getSupportTicket,
  getSupportTicketMessages,
  listSupportEmailDlq,
  listSupportEmailQuarantine,
  listSupportTickets,
  updateSupportTicket,
  type SupportEmailDlqRow,
  type SupportEmailDurabilityMetrics,
  type SupportEmailQuarantineRow,
  type SupportIssueClass,
  type SupportMessage,
  type SupportMessageDirection,
  type SupportPriority,
  type SupportTicket,
  type SupportTicketFilters,
  type SupportTicketStatus,
} from '@/api/support-tickets';

const STATUSES: SupportTicketStatus[] = [
  'new',
  'triaged',
  'in_progress',
  'waiting_customer',
  'waiting_internal',
  'resolved',
  'closed',
];
const ISSUE_CLASSES: SupportIssueClass[] = ['customer', 'ops', 'dev'];
const PRIORITIES: SupportPriority[] = ['low', 'medium', 'high', 'critical'];
const CHANNELS = ['web', 'allai', 'email', 'agent_api'];

const statusLabels: Record<string, string> = {
  new: 'New',
  triaged: 'Triaged',
  in_progress: 'In progress',
  waiting_customer: 'Waiting customer',
  waiting_internal: 'Waiting internal',
  resolved: 'Resolved',
  closed: 'Closed',
};

const badgeClasses: Record<string, string> = {
  low: 'bg-gray-100 text-gray-700',
  medium: 'bg-blue-50 text-blue-700',
  high: 'bg-orange-50 text-orange-700',
  critical: 'bg-red-50 text-red-700',
  dev: 'bg-purple-50 text-purple-700',
  ops: 'bg-amber-50 text-amber-700',
  customer: 'bg-emerald-50 text-emerald-700',
  inbound: 'bg-gray-100 text-gray-700',
  outbound: 'bg-[#E8EAF6] text-[#3F51B5]',
  internal: 'bg-yellow-50 text-yellow-800',
};

function humanize(value: string | null | undefined) {
  if (!value) return 'Unassigned';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'n/a';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatAge(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined) return 'n/a';
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

function JsonBlock({ value }: { value: unknown }) {
  if (!value || (typeof value === 'object' && Object.keys(value as Record<string, unknown>).length === 0)) {
    return <p className="text-sm text-gray-500">None</p>;
  }
  return (
    <pre className="max-h-64 overflow-auto rounded-lg bg-gray-950 p-3 text-xs leading-5 text-gray-100">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function Badge({ value }: { value: string }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${badgeClasses[value] || 'bg-gray-100 text-gray-700'}`}>
      {humanize(value)}
    </span>
  );
}

function extractSuggestions(ticket: SupportTicket | null) {
  if (!ticket) return [];
  const payload = ticket.payload || {};
  const candidates = [
    payload.triage_suggestion,
    payload.triage,
    payload.brain_triage,
    payload.suggested_resolution,
    payload.resolution_suggestion,
    payload.support_suggestions,
    payload.suggestions,
  ];

  return candidates
    .flatMap((candidate) => (Array.isArray(candidate) ? candidate : candidate ? [candidate] : []))
    .filter(Boolean);
}

export default function AdminTicketsPage() {
  const [filters, setFilters] = useState<SupportTicketFilters>({ status: '', issue_class: '', priority: '', channel: '' });
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [metrics, setMetrics] = useState<SupportEmailDurabilityMetrics | null>(null);
  const [dlqRows, setDlqRows] = useState<SupportEmailDlqRow[]>([]);
  const [quarantineRows, setQuarantineRows] = useState<SupportEmailQuarantineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [saving, setSaving] = useState(false);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [queue, emailMetrics, dlq, quarantine] = await Promise.all([
        listSupportTickets({ ...filters, limit: 100 }),
        getSupportEmailDurabilityMetrics(),
        listSupportEmailDlq(),
        listSupportEmailQuarantine(),
      ]);
      setTickets(queue);
      setMetrics(emailMetrics);
      setDlqRows(dlq);
      setQuarantineRows(quarantine);
      if (!selectedRef && queue[0]) {
        setSelectedRef(queue[0].public_ref);
      }
    } catch (err) {
      console.error('Failed to load support tickets', err);
      setError('Failed to load the support ticket queue.');
    } finally {
      setLoading(false);
    }
  }, [filters, selectedRef]);

  const loadDetail = useCallback(async (publicRef: string) => {
    setDetailLoading(true);
    setError('');
    try {
      const [ticket, ticketMessages] = await Promise.all([
        getSupportTicket(publicRef),
        getSupportTicketMessages(publicRef),
      ]);
      setSelectedTicket(ticket);
      setMessages(ticketMessages);
    } catch (err) {
      console.error('Failed to load support ticket detail', err);
      setError('Failed to load the selected ticket.');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    if (selectedRef) {
      loadDetail(selectedRef);
    } else {
      setSelectedTicket(null);
      setMessages([]);
    }
  }, [loadDetail, selectedRef]);

  const counters = useMemo(() => {
    const open = tickets.filter((ticket) => !['resolved', 'closed'].includes(ticket.status));
    return {
      open: open.length,
      escalated: open.filter((ticket) => ticket.human_required || (ticket.risk_score ?? 0) >= 0.8).length,
      critical: open.filter((ticket) => ticket.priority === 'critical').length,
      ops: open.filter((ticket) => ticket.issue_class === 'ops').length,
      dev: open.filter((ticket) => ticket.issue_class === 'dev').length,
    };
  }, [tickets]);

  const suggestions = useMemo(() => extractSuggestions(selectedTicket), [selectedTicket]);

  async function updateSelectedTicket(patch: Parameters<typeof updateSupportTicket>[1]) {
    if (!selectedTicket) return;
    setSaving(true);
    setError('');
    try {
      const updated = await updateSupportTicket(selectedTicket.public_ref, patch);
      setSelectedTicket(updated);
      setTickets((current) => current.map((ticket) => (ticket.id === updated.id ? updated : ticket)));
    } catch (err) {
      console.error('Failed to update support ticket', err);
      setError('Failed to update the ticket.');
    } finally {
      setSaving(false);
    }
  }

  async function sendMessage(direction: SupportMessageDirection, body: string, reset: () => void) {
    if (!selectedTicket || !body.trim()) return;
    setSaving(true);
    setError('');
    try {
      const message = await createSupportTicketMessage(selectedTicket.public_ref, {
        body: body.trim(),
        direction,
        channel: direction === 'outbound' ? 'email' : 'web',
      });
      setMessages((current) => [...current, message]);
      reset();
      const refreshed = await getSupportTicket(selectedTicket.public_ref);
      setSelectedTicket(refreshed);
      setTickets((current) => current.map((ticket) => (ticket.id === refreshed.id ? refreshed : ticket)));
    } catch (err) {
      console.error('Failed to append support message', err);
      setError('Failed to add the message.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Support tickets</h1>
          <p className="mt-1 text-sm text-gray-500">Internal queue, customer timeline, diagnostics, and human-approved responses.</p>
        </div>
        <button
          onClick={loadQueue}
          disabled={loading}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="grid gap-4 md:grid-cols-5">
        {[
          ['Open', counters.open],
          ['Escalated', counters.escalated],
          ['Critical', counters.critical],
          ['Ops', counters.ops],
          ['Dev', counters.dev],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(360px,0.9fr)_minmax(0,1.4fr)]">
        <section className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Search</span>
                <input
                  value={filters.q || ''}
                  onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))}
                  placeholder="Ref, subject, body"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#3F51B5]"
                />
              </label>
              <FilterSelect label="Status" value={filters.status || ''} values={STATUSES} onChange={(status) => setFilters((current) => ({ ...current, status }))} />
              <FilterSelect label="Class" value={filters.issue_class || ''} values={ISSUE_CLASSES} onChange={(issue_class) => setFilters((current) => ({ ...current, issue_class }))} />
              <FilterSelect label="Priority" value={filters.priority || ''} values={PRIORITIES} onChange={(priority) => setFilters((current) => ({ ...current, priority }))} />
              <FilterSelect label="Channel" value={filters.channel || ''} values={CHANNELS} onChange={(channel) => setFilters((current) => ({ ...current, channel }))} />
              <FilterSelect label="Assignee" value={filters.assignee || ''} values={['unassigned']} onChange={(assignee) => setFilters((current) => ({ ...current, assignee }))} />
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#3F51B5] border-t-transparent" />
              </div>
            ) : tickets.length === 0 ? (
              <p className="px-4 py-12 text-center text-sm text-gray-500">No tickets match these filters.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {tickets.map((ticket) => {
                  const selected = ticket.public_ref === selectedRef;
                  return (
                    <button
                      key={ticket.id}
                      onClick={() => setSelectedRef(ticket.public_ref)}
                      className={`block w-full px-4 py-4 text-left transition-colors ${
                        selected ? 'bg-[#F8F9FF]' : 'bg-white hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-[#3F51B5]">{ticket.public_ref}</p>
                          <p className="mt-1 line-clamp-2 text-sm font-semibold text-gray-900">{ticket.subject}</p>
                        </div>
                        {(ticket.human_required || (ticket.risk_score ?? 0) >= 0.8) && (
                          <span className="shrink-0 rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-700">
                            Escalated
                          </span>
                        )}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge value={ticket.status} />
                        <Badge value={ticket.priority} />
                        <Badge value={ticket.issue_class} />
                        <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                          {humanize(ticket.channel)}
                        </span>
                        {ticket.collapsed && (
                          <span className="inline-flex rounded-full bg-yellow-50 px-2.5 py-1 text-xs font-medium text-yellow-800">
                            Collapsed
                          </span>
                        )}
                      </div>
                      <p className="mt-3 text-xs text-gray-500">Updated {formatDate(ticket.updated_at)}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="space-y-4">
          {detailLoading ? (
            <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-[#3F51B5] border-t-transparent" />
            </div>
          ) : selectedTicket ? (
            <>
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#3F51B5]">{selectedTicket.public_ref}</p>
                    <h2 className="mt-1 text-xl font-semibold text-gray-900">{selectedTicket.subject}</h2>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge value={selectedTicket.status} />
                      <Badge value={selectedTicket.priority} />
                      <Badge value={selectedTicket.issue_class} />
                      {selectedTicket.human_required && <Badge value="critical" />}
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <select
                      value={selectedTicket.status}
                      onChange={(event) => updateSelectedTicket({ status: event.target.value as SupportTicketStatus })}
                      disabled={saving}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3F51B5]"
                    >
                      {STATUSES.map((status) => (
                        <option key={status} value={status}>{statusLabels[status]}</option>
                      ))}
                    </select>
                    <select
                      value={selectedTicket.priority}
                      onChange={(event) => updateSelectedTicket({ priority: event.target.value as SupportPriority })}
                      disabled={saving}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3F51B5]"
                    >
                      {PRIORITIES.map((priority) => (
                        <option key={priority} value={priority}>{humanize(priority)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 border-t border-gray-100 pt-5 md:grid-cols-3">
                  <Meta label="Requester party" value={selectedTicket.requester_party_id || 'Unlinked'} />
                  <Meta label="Organization" value={selectedTicket.org_party_id || 'None'} />
                  <Meta label="Assignee" value={selectedTicket.assignee_actor_id || 'Unassigned'} />
                  <Meta label="Risk score" value={selectedTicket.risk_score === null ? 'n/a' : selectedTicket.risk_score.toFixed(2)} />
                  <Meta label="Created" value={formatDate(selectedTicket.created_at)} />
                  <Meta label="Updated" value={formatDate(selectedTicket.updated_at)} />
                </div>

                <label className="mt-5 flex items-center gap-3 border-t border-gray-100 pt-5 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={selectedTicket.human_required}
                    onChange={(event) => updateSelectedTicket({ human_required: event.target.checked })}
                    disabled={saving}
                    className="h-4 w-4 rounded border-gray-300 text-[#3F51B5] focus:ring-[#3F51B5]"
                  />
                  Human review required
                </label>
              </div>

              {suggestions.length > 0 && (
                <div className="rounded-xl border border-[#C5CAE9] bg-[#F8F9FF] p-5 shadow-sm">
                  <h3 className="text-sm font-semibold text-gray-900">Brain suggestions</h3>
                  <p className="mt-1 text-xs text-gray-500">Shadow-mode advisory output. These are not performed actions.</p>
                  <div className="mt-4 space-y-3">
                    {suggestions.map((suggestion, index) => (
                      <div key={index} className="rounded-lg border border-[#C5CAE9] bg-white p-3">
                        {typeof suggestion === 'string' ? (
                          <p className="text-sm text-gray-700">{suggestion}</p>
                        ) : (
                          <JsonBlock value={suggestion} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <h3 className="text-sm font-semibold text-gray-900">Timeline</h3>
                  <div className="mt-4 max-h-[520px] space-y-3 overflow-y-auto pr-1">
                    {messages.length === 0 ? (
                      <p className="text-sm text-gray-500">No messages yet.</p>
                    ) : (
                      messages.map((message) => (
                        <div key={message.id} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge value={message.direction} />
                            <span className="text-xs text-gray-500">{message.actor_type}:{message.actor_id}</span>
                            <span className="text-xs text-gray-400">{formatDate(message.created_at)}</span>
                          </div>
                          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-800">{message.body}</p>
                          {message.translated_body && (
                            <p className="mt-3 whitespace-pre-wrap rounded-lg bg-white p-3 text-sm leading-6 text-gray-600">
                              {message.translated_body}
                            </p>
                          )}
                        </div>
                      ))
                    )}
                  </div>

                  <div className="mt-5 grid gap-4 border-t border-gray-100 pt-5 lg:grid-cols-2">
                    <Composer
                      title="Reply"
                      value={replyBody}
                      onChange={setReplyBody}
                      disabled={saving}
                      onSubmit={() => sendMessage('outbound', replyBody, () => setReplyBody(''))}
                    />
                    <Composer
                      title="Internal note"
                      value={noteBody}
                      onChange={setNoteBody}
                      disabled={saving}
                      onSubmit={() => sendMessage('internal', noteBody, () => setNoteBody(''))}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <Panel title="CRM context">
                    <div className="space-y-3">
                      <Meta label="Requester" value={selectedTicket.requester_party_id || 'Unlinked'} />
                      <Meta label="Org" value={selectedTicket.org_party_id || 'None'} />
                      <Meta label="Collapsed duplicate" value={selectedTicket.collapsed ? 'Yes' : 'No'} />
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Links</p>
                        <div className="mt-2">
                          <JsonBlock value={selectedTicket.links} />
                        </div>
                      </div>
                    </div>
                  </Panel>

                  <Panel title="Ops diagnostics">
                    <JsonBlock value={selectedTicket.payload} />
                  </Panel>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white p-12 text-center text-sm text-gray-500 shadow-sm">
              Select a ticket to review.
            </div>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Email durability</h2>
            <p className="mt-1 text-sm text-gray-500">Internal-only DLQ and quarantine signals.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge value={`DLQ ${metrics?.dlq.pending_count ?? 0}`} />
            <Badge value={`Quarantine ${metrics?.quarantine.pending_count ?? 0}`} />
          </div>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <DurabilityTable title={`DLQ oldest ${formatAge(metrics?.dlq.oldest_pending_age_seconds)}`} rows={dlqRows} />
          <DurabilityTable title={`Quarantine oldest ${formatAge(metrics?.quarantine.oldest_pending_age_seconds)}`} rows={quarantineRows} />
        </div>
      </section>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: string;
  values: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#3F51B5]"
      >
        <option value="">All</option>
        {values.map((item) => (
          <option key={item} value={item}>{humanize(item)}</option>
        ))}
      </select>
    </label>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 truncate text-sm text-gray-900" title={value}>{value}</p>
    </div>
  );
}

function Composer({
  title,
  value,
  onChange,
  onSubmit,
  disabled,
}: {
  title: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
}) {
  return (
    <div>
      <label className="text-sm font-semibold text-gray-900">{title}</label>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#3F51B5]"
      />
      <button
        onClick={onSubmit}
        disabled={disabled || !value.trim()}
        className="mt-2 rounded-lg bg-[#3F51B5] px-4 py-2 text-sm font-medium text-white hover:bg-[#3545a0] disabled:cursor-not-allowed disabled:opacity-50"
      >
        Send
      </button>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function DurabilityTable({
  title,
  rows,
}: {
  title: string;
  rows: Array<SupportEmailDlqRow | SupportEmailQuarantineRow>;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      </div>
      <div className="divide-y divide-gray-100">
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500">No pending rows.</p>
        ) : (
          rows.map((row) => (
            <div key={row.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 truncate text-sm font-medium text-gray-900">{row.gmail_message_id}</p>
                <span className="shrink-0 text-xs text-gray-500">{formatDate(row.created_at)}</span>
              </div>
              <p className="mt-1 text-sm text-gray-600">{row.reason}</p>
              {'candidate_public_ref' in row && row.candidate_public_ref && (
                <p className="mt-1 text-xs text-[#3F51B5]">{row.candidate_public_ref}</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
