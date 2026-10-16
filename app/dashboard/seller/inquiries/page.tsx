'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import InquiryListPager from '@/components/InquiryListPager';
import { useInquiryList } from '@/hooks/useInquiryList';
import { replyToConversation, getConversation } from '@/api/conversations';
import { useConversationPoll } from '@/hooks/useConversationPoll';
import ConversationThread from '@/components/ConversationThread';
import { formatDate } from '@/lib/format';
import type { ConversationListItem, ConversationDetail, ConversationMessage, ConversationStatus } from '@/types';
import { AxiosError } from 'axios';
import { mergeConversationMessages } from '@/lib/conversationMessages';

const STATUS_BADGE: Record<ConversationStatus, { css: string; label: string }> = {
  auto_answered: { css: 'bg-green-100 text-green-800', label: 'Auto-answered' },
  escalated: { css: 'bg-red-100 text-red-800', label: 'Needs reply' },
  awaiting_seller: { css: 'bg-red-100 text-red-800', label: 'Awaiting your reply' },
  seller_replied: { css: 'bg-[#E8EAF6] text-[#303F9F]', label: 'Replied' },
  awaiting_buyer: { css: 'bg-[#E8EAF6] text-[#303F9F]', label: 'Awaiting buyer' },
  closed: { css: 'bg-gray-100 text-gray-600', label: 'Closed' },
  resolved: { css: 'bg-gray-100 text-gray-600', label: 'Resolved' },
};

function statusBadge(status: ConversationStatus) {
  const s = STATUS_BADGE[status] || { css: 'bg-gray-100 text-gray-600', label: status };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${s.css}`}>
      {s.label}
    </span>
  );
}

function sortInquiries(items: ConversationListItem[]): ConversationListItem[] {
  return [...items].sort((a, b) => {
    // Unread first
    if (a.unread_by_seller > 0 && b.unread_by_seller === 0) return -1;
    if (a.unread_by_seller === 0 && b.unread_by_seller > 0) return 1;
    // Then by last_message_at desc (oldest unanswered first within unread)
    return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
  });
}

export default function SellerInquiriesPage() {
  const { inquiries, loading, error, refetch, page, changePage, hasNext } = useInquiryList('seller');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const navigate = (nextPage: number) => {
    setExpandedId(null);
    changePage(nextPage);
  };
  const pager = <InquiryListPager page={page} hasNext={hasNext} loading={loading}
    onPageChange={navigate} />;
  const failure = error && (
    <div role="alert" className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
      {error} <button type="button" onClick={() => void refetch()}>Retry inquiries</button>
    </div>
  );

  if (loading) {
    return <div><p role="status">Loading inquiries...</p>{pager}</div>;
  }

  if (error && inquiries.length === 0) {
    return <div>{failure}{pager}</div>;
  }

  if (page > 1 && inquiries.length === 0) {
    return <div><p>No inquiries on this page. Use Previous to return to earlier pages.</p>{pager}</div>;
  }

  if (inquiries.length === 0) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">No inquiries yet</h1>
          <p className="text-gray-500">When buyers ask questions about your listings, they&apos;ll appear here.</p>
        </div>
      </div>
    );
  }

  const sorted = sortInquiries(inquiries);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Buyer Inquiries</h1>
      {failure}

      <div className="space-y-3">
        {sorted.map((inq) => (
          <SellerInquiryCard
            key={inq.id}
            inquiry={inq}
            isExpanded={expandedId === inq.id}
            onToggle={() => setExpandedId(expandedId === inq.id ? null : inq.id)}
            onReplied={refetch}
          />
        ))}
      </div>
      {pager}
    </div>
  );
}

function SellerInquiryCard({
  inquiry,
  isExpanded,
  onToggle,
  onReplied,
}: {
  inquiry: ConversationListItem;
  isExpanded: boolean;
  onToggle: () => void;
  onReplied: () => void;
}) {
  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-medium text-gray-900 truncate">{inquiry.listing_title}</span>
          {inquiry.unread_by_seller > 0 && (
            <span className="inline-flex items-center rounded-full bg-red-600 px-2 py-0.5 text-xs font-medium text-white shrink-0">
              {inquiry.unread_by_seller}
            </span>
          )}
          {statusBadge(inquiry.status)}
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          <span className="text-xs text-gray-500">{formatDate(inquiry.last_message_at)}</span>
          <svg
            className={`h-5 w-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-gray-200 p-4">
          <SellerInquiryThread key={inquiry.id} id={inquiry.id} onReplied={onReplied} />
        </div>
      )}
    </div>
  );
}

function SellerInquiryThread({ id, onReplied }: { id: string; onReplied: () => void }) {
  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);

  const viewerRole = 'seller';

  const [replyError, setReplyError] = useState('');
  const [accepted, setAccepted] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const active = useRef(false);
  const sending = useRef(false);
  const readVersion = useRef(0);
  const statusVersion = useRef(0);

  const handleNewMessages = useCallback((newMsgs: ConversationMessage[], status: ConversationDetail['status']) => {
    statusVersion.current += 1;
    setMessages((prev) => mergeConversationMessages(prev, newMsgs));
    setConversation((prev) => prev ? { ...prev, status } : prev);
  }, []);

  const lastMsgTime = messages.length > 0 ? messages[messages.length - 1].created_at : null;
  const { updateSince } = useConversationPoll(conversation ? id : null, lastMsgTime, handleNewMessages);

  const refresh = useCallback(async () => {
    const version = ++readVersion.current;
    const statusAtStart = statusVersion.current;
    setRefreshing(true);
    try {
      const data = await getConversation(id);
      if (!active.current || version !== readVersion.current) return;
      setConversation((prev) => statusAtStart === statusVersion.current || !prev
        ? data : { ...data, status: prev.status });
      setMessages((prev) => mergeConversationMessages(prev, data.messages ?? []));
      const latest = (data.messages ?? []).at(-1)?.created_at;
      if (latest) updateSince(latest);
      setError('');
      setAccepted((pending) => pending && !(data.messages ?? []).some((msg) => msg.id === pending) ? pending : null);
    } catch {
      if (active.current && version === readVersion.current) setError('Failed to refresh conversation.');
    } finally {
      if (active.current && version === readVersion.current) {
        setRefreshing(false);
        setLoading(false);
      }
    }
  }, [id, updateSince]);

  useEffect(() => {
    active.current = true;
    void refresh();
    return () => { active.current = false; readVersion.current += 1; };
  }, [refresh]);

  useEffect(() => {
    if (accepted && messages.some((message) => message.id === accepted)) {
      setAccepted(null);
      setError('');
    }
  }, [accepted, messages]);

  const handleReply = async () => {
    if (sending.current || accepted || !replyText.trim() || !conversation) return;
    sending.current = true;
    setReplying(true);
    setReplyError('');
    let ack;
    try {
      ack = await replyToConversation(id, replyText.trim(), viewerRole);
      if (!ack.success) throw new Error('Reply not accepted');
    } catch (err) {
      if (active.current) {
        const detail = err instanceof AxiosError ? err.response?.data?.detail : null;
        setReplyError(typeof detail === 'string' ? detail : 'Failed to send reply. Please revise and try again.');
        sending.current = false;
        setReplying(false);
      }
      return;
    }
    if (!active.current) return;
    setAccepted(ack.message_id);
    setReplyText('');
    // A confirmed write stays accepted even when the following read fails.
    await refresh();
    if (active.current) {
      sending.current = false;
      setReplying(false);
      onReplied();
    }
  };

  if (loading) return <p>Loading conversation...</p>;
  return (
    <>
      {conversation && <p className="mb-2">{statusBadge(conversation.status)}</p>}
      <div className="max-h-80 overflow-y-auto mb-4">
        <ConversationThread messages={messages} viewerRole="seller" />
      </div>
      {accepted && <p role="status">Reply accepted. Waiting to refresh the server thread.</p>}
      {error && <p role="alert">{error}</p>}
      {(accepted || error) && <button onClick={() => void refresh()} disabled={refreshing}>Refresh conversation</button>}
      {replyError && <p role="alert">{replyError}</p>}
      <div className="flex gap-2">
        <input type="text" value={replyText} disabled={replying || !!accepted || !conversation}
          onChange={(e) => setReplyText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleReply()}
          placeholder="Reply to buyer..."
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3F51B5] focus:border-transparent" />
        <button onClick={handleReply} disabled={replying || !!accepted || !conversation || !replyText.trim()}
          className="rounded-lg bg-[#3F51B5] px-4 py-2 text-sm font-medium text-white hover:bg-[#3545a0] disabled:opacity-50 disabled:cursor-not-allowed">
          {replying ? 'Sending...' : 'Reply'}
        </button>
      </div>
      <div className="mt-2">
        <Link href={`/dashboard/inquiries/${id}`} className="text-xs text-[#3F51B5] hover:underline">Open full thread</Link>
      </div>
    </>
  );
}
