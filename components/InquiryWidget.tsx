'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth';
import { useToast } from '@/components/Toast';
import { createInquiry, replyToConversation } from '@/api/conversations';
import {
  createAnonymousSession,
  readAnonymousMessageStream,
  sendAnonymousMessage,
} from '@/api/anonymousChat';
import { useConversationPoll } from '@/hooks/useConversationPoll';
import ConversationThread from '@/components/ConversationThread';
import type { ConversationDetail, ConversationMessage } from '@/types';
import { AxiosError } from 'axios';

interface Props {
  listingId: string;
  listingSlug: string;
  listingTitle: string;
}

const DRAFT_KEY_PREFIX = 'inquiry_draft_';

export default function InquiryWidget({ listingId, listingSlug, listingTitle }: Props) {
  const { isAuthenticated } = useAuthStore();
  const { toast } = useToast();

  const [question, setQuestion] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [showTyping, setShowTyping] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);
  const [anonymousMessages, setAnonymousMessages] = useState<ConversationMessage[]>([]);
  const [anonymousError, setAnonymousError] = useState<string | null>(null);
  const [anonymousAnswerReturned, setAnonymousAnswerReturned] = useState(false);
  const [anonymousAnswerStarted, setAnonymousAnswerStarted] = useState(false);
  const anonymousSessionRef = useRef<string | null>(null);
  const anonymousAbortRef = useRef<AbortController | null>(null);

  // Restore draft from sessionStorage
  useEffect(() => {
    const draft = sessionStorage.getItem(DRAFT_KEY_PREFIX + listingId);
    if (draft) {
      setQuestion(draft);
      sessionStorage.removeItem(DRAFT_KEY_PREFIX + listingId);
    }
  }, [listingId]);

  useEffect(() => () => anonymousAbortRef.current?.abort(), []);

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

    setSubmissionError(null);

    if (!isAuthenticated) {
      const trimmedQuestion = question.trim();
      const attemptId = Date.now();
      const questionMessageId = `anonymous-question-${attemptId}`;
      const answerMessageId = `anonymous-answer-${attemptId}`;
      const controller = new AbortController();
      let receivedAnswer = '';

      anonymousAbortRef.current = controller;
      setSubmitting(true);
      setAnonymousError(null);
      setAnonymousAnswerStarted(false);
      setAnonymousMessages((prev) => [
        ...prev,
        {
          id: questionMessageId,
          conversation_id: '',
          role: 'buyer',
          content: trimmedQuestion,
          created_at: new Date().toISOString(),
        },
      ]);

      try {
        if (!anonymousSessionRef.current) {
          anonymousSessionRef.current = await createAnonymousSession();
        }

        const response = await sendAnonymousMessage({
          session_id: anonymousSessionRef.current,
          message: `Question about the listing "${listingTitle}" (slug: ${listingSlug}):\n\n${trimmedQuestion}`,
          context: {
            page: `/listings/${listingSlug}`,
            listing_id: listingId,
          },
          locale: 'en',
          stream: true,
        }, { signal: controller.signal });

        if (!response.ok || !response.body) {
          throw new Error('Anonymous message request failed');
        }

        await readAnonymousMessageStream(response.body, (event) => {
          const streamError = event.error ?? (event.type === 'error' ? event.message : undefined);
          if (typeof streamError === 'string' && streamError) {
            throw new Error(streamError);
          }

          const delta = event.text ?? (event.type === 'delta' ? event.chunk : undefined);
          if (typeof delta !== 'string' || !delta) return;

          receivedAnswer += delta;
          setAnonymousAnswerStarted(true);
          setAnonymousMessages((prev) => {
            const answer = prev.find((message) => message.id === answerMessageId);
            if (!answer) {
              return [
                ...prev,
                {
                  id: answerMessageId,
                  conversation_id: '',
                  role: 'allai',
                  content: delta,
                  created_at: new Date().toISOString(),
                },
              ];
            }

            return prev.map((message) => (
              message.id === answerMessageId
                ? { ...message, content: message.content + delta }
                : message
            ));
          });
        });

        if (!receivedAnswer.trim()) {
          throw new Error('Anonymous message stream returned no answer');
        }

        setQuestion('');
        setAnonymousAnswerReturned(true);
      } catch (error) {
        if (!(error instanceof Error && error.name === 'AbortError')) {
          setAnonymousError("We couldn't get an answer. Please try again.");
          setAnonymousMessages((prev) => prev.filter(
            (message) => message.id !== questionMessageId && message.id !== answerMessageId
          ));
        }
      } finally {
        setSubmitting(false);
        anonymousAbortRef.current = null;
      }
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
          const message = 'You already have an inquiry for this listing. Check your dashboard.';
          setSubmissionError(message);
          toast(message, 'info');
        } else {
          const message = detail || 'Failed to submit question.';
          setSubmissionError(message);
          toast(message, 'error');
        }
      } else {
        const message = 'An unexpected error occurred.';
        setSubmissionError(message);
        toast(message, 'error');
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
      {!isAuthenticated && anonymousMessages.length > 0 && (
        <div className="max-h-80 overflow-y-auto mb-4" aria-live="polite">
          <ConversationThread
            messages={anonymousMessages}
            viewerRole="buyer"
            showTypingIndicator={submitting && !anonymousAnswerStarted}
          />
        </div>
      )}
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
      {isAuthenticated && submissionError && (
        <p className="text-xs text-red-600 mt-2" role="alert">
          {submissionError}
        </p>
      )}
      {!isAuthenticated && anonymousError && (
        <p className="text-xs text-red-600 mt-2" role="alert">
          {anonymousError}
        </p>
      )}
      {!isAuthenticated && anonymousAnswerReturned && (
        <p className="text-xs text-gray-500 mt-2 text-center">
          Want the seller to answer personally?{' '}
          <Link
            href={`/login?redirect=/listings/${encodeURIComponent(listingSlug)}`}
            className="text-[#3F51B5] hover:underline"
          >
            Sign in to forward this question.
          </Link>
        </p>
      )}
    </div>
  );
}
