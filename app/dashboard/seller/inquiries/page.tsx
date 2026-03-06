'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useInquiryList } from '@/hooks/useInquiryList';
import { useToast } from '@/components/Toast';
import { replyToConversation, getConversation } from '@/api/conversations';
import { useConversationPoll } from '@/hooks/useConversationPoll';
import ConversationThread from '@/components/ConversationThread';
import { formatDate } from '@/lib/format';
import type { ConversationListItem, ConversationDetail, ConversationMessage, ConversationStatus } from '@/types';
import { AxiosError } from 'axios';

const STATUS_BADGE: Record<ConversationStatus, { css: string; label: string }> = {
  auto_answered: { css: 'bg-green-100 text-green-800', label: 'Auto-answered' },
  escalated: { css: 'bg-red-100 text-red-800', label: 'Needs reply' },
  awaiting_seller: { css: 'bg-red-100 text-red-800', label: 'Awaiting your reply' },
  seller_replied: { css: 'bg-blue-100 text-blue-800', label: 'Replied' },
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
  const { inquiries, loading, error, refetch } = useInquiryList('seller');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    );
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
  const { toast } = useToast();
  const [conv, setConv] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);

  const handleNewMessages = (newMsgs: ConversationMessage[]) => {
    setMessages((prev) => [...prev, ...newMsgs]);
  };

  const lastMsgTime = messages.length > 0 ? messages[messages.length - 1].created_at : null;
  const { updateSince } = useConversationPoll(
    isExpanded ? inquiry.id : null,
    lastMsgTime,
    handleNewMessages
  );

  const handleToggle = async () => {
    onToggle();
    if (!isExpanded && !conv) {
      setLoadingDetail(true);
      try {
        const data = await getConversation(inquiry.id);
        setConv(data);
        setMessages(data.messages);
      } catch {
        toast('Failed to load conversation.', 'error');
      } finally {
        setLoadingDetail(false);
      }
    }
  };

  const handleReply = async () => {
    if (!replyText.trim()) return;
    setReplying(true);
    try {
      const msg = await replyToConversation(inquiry.id, replyText.trim(), 'seller');
      setMessages((prev) => [...prev, msg]);
      setReplyText('');
      updateSince(msg.created_at);
      onReplied();
    } catch (err) {
      if (err instanceof AxiosError) {
        toast(err.response?.data?.detail || 'Failed to send reply.', 'error');
      } else {
        toast('An unexpected error occurred.', 'error');
      }
    } finally {
      setReplying(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <button
        onClick={handleToggle}
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
          {loadingDetail ? (
            <div className="flex justify-center py-4">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
            </div>
          ) : (
            <>
              <div className="max-h-80 overflow-y-auto mb-4">
                <ConversationThread messages={messages} viewerRole="seller" />
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleReply()}
                  placeholder="Reply to buyer..."
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  onClick={handleReply}
                  disabled={replying || !replyText.trim()}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {replying ? 'Sending...' : 'Reply'}
                </button>
              </div>
              <div className="mt-2">
                <Link
                  href={`/dashboard/inquiries/${inquiry.id}`}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Open full thread
                </Link>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
