'use client';

import { useEffect, useState, useCallback, useRef, use } from 'react';
import Link from 'next/link';
import { getConversation, replyToConversation } from '@/api/conversations';
import { useConversationPoll } from '@/hooks/useConversationPoll';
import { useAuthStore } from '@/store/auth';
import ConversationThread from '@/components/ConversationThread';
import type { ConversationDetail, ConversationMessage } from '@/types';
import { AxiosError } from 'axios';
import { mergeConversationMessages } from '@/lib/conversationMessages';

interface Props {
  params: Promise<{ id: string }>;
}

export default function ConversationDetailPage({ params }: Props) {
  const { id } = use(params);
  return <ConversationView key={id} id={id} />;
}

function ConversationView({ id }: { id: string }) {
  const { user } = useAuthStore();

  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);

  // Determine if viewer is buyer or seller
  const viewerRole = user?.id === conversation?.seller_id ? 'seller' : 'buyer';

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
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#3F51B5] border-t-transparent" />
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
        {error || 'Conversation not found.'}
        <button onClick={() => void refresh()} disabled={refreshing}>Refresh conversation</button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <Link
          href={viewerRole === 'seller' ? '/dashboard/seller/inquiries' : '/dashboard/inquiries'}
          className="text-sm text-[#3F51B5] hover:underline"
        >
          &larr; Back to inquiries
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{conversation.listing_title}</h1>
        <p className="text-sm text-gray-500 mt-1">
          Inquiry started {new Date(conversation.created_at).toLocaleDateString()}
        </p>
        <p className="text-sm text-gray-500">Status: {conversation.status.replaceAll('_', ' ')}</p>
      </div>

      <div className="rounded-xl border border-gray-200 p-6">
        <div className="max-h-[60vh] overflow-y-auto mb-4">
          <ConversationThread messages={messages} viewerRole={viewerRole} />
        </div>

        {(conversation.status === 'escalated' || conversation.status === 'awaiting_seller') && viewerRole === 'buyer' && (
          <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2 mb-3">
            <p className="text-sm text-yellow-800">
              Escalated to seller - you&apos;ll be notified when they respond.
            </p>
          </div>
        )}

        {accepted && <p role="status">Reply accepted. Waiting to refresh the server thread.</p>}
        {error && <p role="alert">{error}</p>}
        {(accepted || error) && <button onClick={() => void refresh()} disabled={refreshing}>Refresh conversation</button>}
        {replyError && <p role="alert">{replyError}</p>}
        <div className="flex gap-2">
          <input
            type="text"
            disabled={replying || !!accepted}
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
              if (e.key === 'Enter' && !e.shiftKey) void handleReply();
            }}
            placeholder={`Reply as ${viewerRole}...`}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3F51B5] focus:border-transparent"
          />
          <button
            onClick={handleReply}
            disabled={replying || !!accepted || !replyText.trim()}
            className="rounded-lg bg-[#3F51B5] px-4 py-2 text-sm font-medium text-white hover:bg-[#3545a0] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {replying ? 'Sending...' : 'Reply'}
          </button>
        </div>
      </div>
    </div>
  );
}
