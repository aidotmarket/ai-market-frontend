'use client';

import { useEffect, useState, useCallback, use } from 'react';
import Link from 'next/link';
import { getConversation, replyToConversation } from '@/api/conversations';
import { useConversationPoll } from '@/hooks/useConversationPoll';
import { useToast } from '@/components/Toast';
import { useAuthStore } from '@/store/auth';
import ConversationThread from '@/components/ConversationThread';
import type { ConversationDetail, ConversationMessage } from '@/types';
import { AxiosError } from 'axios';

interface Props {
  params: Promise<{ id: string }>;
}

export default function ConversationDetailPage({ params }: Props) {
  const { id } = use(params);
  const { user } = useAuthStore();
  const { toast } = useToast();

  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);

  // Determine if viewer is buyer or seller
  const viewerRole = user?.id === conversation?.seller_id ? 'seller' : 'buyer';

  const handleNewMessages = useCallback((newMsgs: ConversationMessage[]) => {
    setMessages((prev) => [...prev, ...newMsgs]);
  }, []);

  const lastMsgTime = messages.length > 0 ? messages[messages.length - 1].created_at : null;
  const { updateSince } = useConversationPoll(
    conversation ? id : null,
    lastMsgTime,
    handleNewMessages
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    getConversation(id)
      .then((data) => {
        if (cancelled) return;
        setConversation(data);
        setMessages(data.messages);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load conversation.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [id]);

  const handleReply = async () => {
    if (!replyText.trim() || !conversation) return;
    setReplying(true);
    try {
      const msg = await replyToConversation(conversation.id, replyText.trim(), viewerRole);
      setMessages((prev) => [...prev, msg]);
      setReplyText('');
      updateSince(msg.created_at);
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

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (error || !conversation) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
        {error || 'Conversation not found.'}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <Link
          href={viewerRole === 'seller' ? '/dashboard/seller/inquiries' : '/dashboard/inquiries'}
          className="text-sm text-blue-600 hover:underline"
        >
          &larr; Back to inquiries
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{conversation.listing_title}</h1>
        <p className="text-sm text-gray-500 mt-1">
          Inquiry started {new Date(conversation.created_at).toLocaleDateString()}
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 p-6">
        <div className="max-h-[60vh] overflow-y-auto mb-4">
          <ConversationThread messages={messages} viewerRole={viewerRole} />
        </div>

        {(conversation.status === 'escalated' || conversation.status === 'awaiting_seller') && viewerRole === 'buyer' && (
          <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2 mb-3">
            <p className="text-sm text-yellow-800">
              Escalated to seller — you&apos;ll be notified when they respond.
            </p>
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleReply()}
            placeholder={`Reply as ${viewerRole}...`}
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
      </div>
    </div>
  );
}
