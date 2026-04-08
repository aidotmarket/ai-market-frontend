'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth';
import { useToast } from '@/components/Toast';
import { createInquiry, replyToConversation } from '@/api/conversations';
import { useConversationPoll } from '@/hooks/useConversationPoll';
import ConversationThread from '@/components/ConversationThread';
import type { ConversationDetail, ConversationMessage } from '@/types';
import { AxiosError } from 'axios';

interface Props {
  listingId: string;
  listingSlug: string;
}

const DRAFT_KEY_PREFIX = 'inquiry_draft_';

export default function InquiryWidget({ listingId, listingSlug }: Props) {
  const { isAuthenticated } = useAuthStore();
  const { toast } = useToast();

  const [question, setQuestion] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [showTyping, setShowTyping] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);

  // Restore draft from sessionStorage
  useEffect(() => {
    const draft = sessionStorage.getItem(DRAFT_KEY_PREFIX + listingId);
    if (draft) {
      setQuestion(draft);
      sessionStorage.removeItem(DRAFT_KEY_PREFIX + listingId);
    }
  }, [listingId]);

  // Poll for new messages after submission
  const handleNewMessages = useCallback((newMsgs: ConversationMessage[]) => {
    setMessages((prev) => [...prev, ...newMsgs]);
    setShowTyping(false);
  }, []);

  const { updateSince } = useConversationPoll(
    conversation?.id ?? null,
    conversation ? conversation.messages[conversation.messages.length - 1]?.created_at ?? conversation.created_at : null,
    handleNewMessages
  );

  const handleSubmit = async () => {
    if (!question.trim()) return;

    if (!isAuthenticated) {
      // Save draft and redirect to login
      sessionStorage.setItem(DRAFT_KEY_PREFIX + listingId, question);
      window.location.href = `/login?redirect=/listings/${encodeURIComponent(listingSlug)}`;
      return;
    }

    setSubmitting(true);
    try {
      const conv = await createInquiry(listingId, question.trim());
      setConversation(conv);
      setMessages(conv.messages);
      setQuestion('');
      setShowTyping(true);
      // Set watermark for polling
      const lastMsg = conv.messages[conv.messages.length - 1];
      if (lastMsg) updateSince(lastMsg.created_at);
    } catch (err) {
      if (err instanceof AxiosError) {
        const detail = err.response?.data?.detail;
        if (err.response?.status === 409) {
          toast('You already have an inquiry for this listing. Check your dashboard.', 'info');
        } else {
          toast(detail || 'Failed to submit question.', 'error');
        }
      } else {
        toast('An unexpected error occurred.', 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleReply = async () => {
    if (!replyText.trim() || !conversation) return;
    setReplying(true);
    try {
      const msg = await replyToConversation(conversation.id, replyText.trim(), 'buyer');
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

  const escalatedStatus = conversation?.status === 'escalated' || conversation?.status === 'awaiting_seller';

  // Show conversation thread if already submitted
  if (conversation) {
    return (
      <div className="rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Your Inquiry</h3>
        <div className="max-h-80 overflow-y-auto mb-4">
          <ConversationThread
            messages={messages}
            viewerRole="buyer"
            showTypingIndicator={showTyping}
          />
        </div>

        {escalatedStatus && (
          <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2 mb-3">
            <p className="text-sm text-yellow-800">
              Escalated to seller - you&apos;ll be notified when they respond.
            </p>
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleReply()}
            placeholder="Follow up..."
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3F51B5] focus:border-transparent"
          />
          <button
            onClick={handleReply}
            disabled={replying || !replyText.trim()}
            className="rounded-lg bg-[#3F51B5] px-4 py-2 text-sm font-medium text-white hover:bg-[#3545a0] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {replying ? 'Sending...' : 'Reply'}
          </button>
        </div>

        <div className="mt-3">
          <Link
            href={`/dashboard/inquiries/${conversation.id}`}
            className="text-sm text-[#3F51B5] hover:underline"
          >
            View full conversation
          </Link>
        </div>
      </div>
    );
  }

  // Initial question form
  return (
    <div className="rounded-xl border border-gray-200 p-6">
      <h3 className="font-semibold text-gray-900 mb-3">Ask a Question</h3>
      <p className="text-sm text-gray-500 mb-4">
        Get an instant AI-powered answer, or your question will be forwarded to the seller.
      </p>
      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="What would you like to know about this dataset?"
        rows={3}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3F51B5] focus:border-transparent resize-none"
      />
      <button
        onClick={handleSubmit}
        disabled={submitting || !question.trim()}
        className="mt-3 w-full rounded-lg bg-[#3F51B5] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#3545a0] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
      >
        {submitting ? (
          <>
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Submitting...
          </>
        ) : (
          'Submit Question'
        )}
      </button>
      {!isAuthenticated && (
        <p className="text-xs text-gray-500 mt-2 text-center">
          You&apos;ll need to sign in to submit your question.
        </p>
      )}
    </div>
  );
}
