'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { authSessionIdentity, useAuthStore } from '@/store/auth';
import { useToast } from '@/components/Toast';
import { createInquiry, getConversation, replyToConversation } from '@/api/conversations';
import {
  createAnonymousSession,
  readAnonymousMessageStream,
  sendAnonymousMessage,
} from '@/api/anonymousChat';
import { useConversationPoll } from '@/hooks/useConversationPoll';
import ConversationThread from '@/components/ConversationThread';
import type { ConversationDetail, ConversationMessage } from '@/types';
import { AxiosError } from 'axios';
import { mergeConversationMessages } from '@/lib/conversationMessages';

interface Props {
  listingId: string;
  listingSlug: string;
  listingTitle: string;
}

const DRAFT_KEY_PREFIX = 'inquiry_draft_';
const ANONYMOUS_WAIT_NOTICE_DELAY_MS = 8_000;
const ANONYMOUS_ATTEMPT_DEADLINE_MS = 45_000;

interface AnonymousAttemptResource<T> {
  attemptId: number;
  value: T;
}

// A listing is a separate public attempt/session as well as a private visit.
export default function InquiryWidget(props: Props) {
  return <ListingInquiryWidget key={props.listingId} {...props} />;
}

function ListingInquiryWidget({ listingId, listingSlug, listingTitle }: Props) {
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
  const [replyError, setReplyError] = useState('');
  const [accepted, setAccepted] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const sending = useRef(false);
  const readVersion = useRef(0);
  const statusVersion = useRef(0);
  const owner = authSessionIdentity(useAuthStore.getState());
  const visitRef = useRef({ owner });
  const [renderedVisit, setRenderedVisit] = useState(visitRef.current);
  const [, notifyOwnerChange] = useState(0);
  const creating = useRef(false);
  if (visitRef.current.owner !== owner) visitRef.current = { owner };
  const visit = visitRef.current;

  // Store notifications retire visits synchronously, including A -> B -> A
  // transitions batched before React renders. Token rotation keeps the owner.
  useEffect(() => useAuthStore.subscribe((state) => {
    const nextOwner = authSessionIdentity(state);
    if (visitRef.current.owner !== nextOwner) {
      visitRef.current = { owner: nextOwner };
      notifyOwnerChange((version) => version + 1);
    }
  }), []);

  if (renderedVisit !== visit) {
    setRenderedVisit(visit);
    setConversation(null);
    setMessages([]);
    setReplyText('');
    setReplyError('');
    setAccepted(null);
    setRefreshError('');
    setRefreshing(false);
    setReplying(false);
    setShowTyping(false);
    setSubmissionError(null);
    if (renderedVisit.owner !== null) setQuestion('');
    if (creating.current) setSubmitting(false);
    creating.current = false;
    sending.current = false;
    readVersion.current += 1;
  }
  const [anonymousMessages, setAnonymousMessages] = useState<ConversationMessage[]>([]);
  const [anonymousError, setAnonymousError] = useState<string | null>(null);
  const [anonymousTimedOut, setAnonymousTimedOut] = useState(false);
  const [anonymousAnswerReturned, setAnonymousAnswerReturned] = useState(false);
  const [anonymousAnswerStarted, setAnonymousAnswerStarted] = useState(false);
  const [anonymousWaitElapsed, setAnonymousWaitElapsed] = useState(false);
  const [anonymousSubmissionInProgress, setAnonymousSubmissionInProgress] = useState(false);
  const anonymousSessionRef = useRef<string | null>(null);
  const anonymousAbortRef = useRef<AnonymousAttemptResource<AbortController> | null>(null);
  const anonymousWaitTimerRef = useRef<AnonymousAttemptResource<ReturnType<typeof setTimeout>> | null>(null);
  const anonymousDeadlineTimerRef = useRef<AnonymousAttemptResource<ReturnType<typeof setTimeout>> | null>(null);
  const anonymousAttemptRef = useRef(0);
  const anonymousSubmittedQuestionRef = useRef('');
  const mountedRef = useRef(true);

  const clearAnonymousAttemptTimers = useCallback((attemptId?: number) => {
    if (
      anonymousWaitTimerRef.current !== null
      && (attemptId === undefined || anonymousWaitTimerRef.current.attemptId === attemptId)
    ) {
      clearTimeout(anonymousWaitTimerRef.current.value);
      anonymousWaitTimerRef.current = null;
    }

    if (
      anonymousDeadlineTimerRef.current !== null
      && (attemptId === undefined || anonymousDeadlineTimerRef.current.attemptId === attemptId)
    ) {
      clearTimeout(anonymousDeadlineTimerRef.current.value);
      anonymousDeadlineTimerRef.current = null;
    }
  }, []);

  // Restore draft from sessionStorage
  useEffect(() => {
    const draft = sessionStorage.getItem(DRAFT_KEY_PREFIX + listingId);
    if (draft) {
      setQuestion(draft);
      sessionStorage.removeItem(DRAFT_KEY_PREFIX + listingId);
    }
  }, [listingId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      anonymousAttemptRef.current += 1;
      clearAnonymousAttemptTimers();
      anonymousAbortRef.current?.value.abort();
      anonymousAbortRef.current = null;
    };
  }, [clearAnonymousAttemptTimers]);

  const preserveAnonymousDraft = useCallback(() => {
    const draft = question.trim() ? question : anonymousSubmittedQuestionRef.current;
    if (draft) {
      sessionStorage.setItem(
        DRAFT_KEY_PREFIX + listingId,
        draft
      );
    }
  }, [listingId, question]);

  const current = useCallback(() => mountedRef.current
    && visitRef.current === visit
    && authSessionIdentity(useAuthStore.getState()) === visit.owner, [visit]);

  // Poll for new messages after submission
  const handleNewMessages = useCallback((newMsgs: ConversationMessage[], status: ConversationDetail['status']) => {
    if (!current()) return;
    statusVersion.current += 1;
    setMessages((prev) => mergeConversationMessages(prev, newMsgs));
    setConversation((prev) => prev ? { ...prev, status } : prev);
    setShowTyping(false);
  }, [current]);

  const { updateSince } = useConversationPoll(
    conversation?.id ?? null,
    conversation ? messages.at(-1)?.created_at ?? conversation.created_at : null,
    handleNewMessages,
    current
  );

  const handleSubmit = async () => {
    if (!current() || creating.current || anonymousAbortRef.current || !question.trim()) return;

    setSubmissionError(null);
    setAnonymousError(null);
    setAnonymousTimedOut(false);

    if (!isAuthenticated) {
      const trimmedQuestion = question.trim();
      const attemptId = anonymousAttemptRef.current + 1;
      const questionMessageId = `anonymous-question-${attemptId}`;
      const answerMessageId = `anonymous-answer-${attemptId}`;
      const controller = new AbortController();
      let receivedAnswer = '';

      anonymousAttemptRef.current = attemptId;
      clearAnonymousAttemptTimers();
      anonymousAbortRef.current = { attemptId, value: controller };
      anonymousSubmittedQuestionRef.current = trimmedQuestion;
      setSubmitting(true);
      setAnonymousSubmissionInProgress(true);
      setAnonymousAnswerReturned(false);
      setAnonymousAnswerStarted(false);
      setAnonymousWaitElapsed(false);
      const waitTimer = setTimeout(() => {
        if (anonymousWaitTimerRef.current?.attemptId === attemptId) {
          anonymousWaitTimerRef.current = null;
        }
        if (mountedRef.current && anonymousAttemptRef.current === attemptId) {
          setAnonymousWaitElapsed(true);
        }
      }, ANONYMOUS_WAIT_NOTICE_DELAY_MS);
      anonymousWaitTimerRef.current = { attemptId, value: waitTimer };

      const deadlineTimer = setTimeout(() => {
        if (!mountedRef.current || anonymousAttemptRef.current !== attemptId) return;

        anonymousAttemptRef.current += 1;
        if (anonymousDeadlineTimerRef.current?.attemptId === attemptId) {
          anonymousDeadlineTimerRef.current = null;
        }
        clearAnonymousAttemptTimers(attemptId);
        if (anonymousAbortRef.current?.attemptId === attemptId) {
          anonymousAbortRef.current.value.abort();
          anonymousAbortRef.current = null;
        }
        setAnonymousMessages((prev) => prev.filter(
          (message) => message.id !== questionMessageId && message.id !== answerMessageId
        ));
        setAnonymousError('This is taking longer than expected. Please try again, or');
        setAnonymousTimedOut(true);
        setAnonymousWaitElapsed(false);
        setAnonymousAnswerStarted(false);
        setAnonymousSubmissionInProgress(false);
        setSubmitting(false);
      }, ANONYMOUS_ATTEMPT_DEADLINE_MS);
      anonymousDeadlineTimerRef.current = { attemptId, value: deadlineTimer };

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
        let sessionId = anonymousSessionRef.current;
        if (!sessionId) {
          const createdSessionId = await createAnonymousSession({ signal: controller.signal });
          if (!mountedRef.current || anonymousAttemptRef.current !== attemptId) return;
          anonymousSessionRef.current = createdSessionId;
          sessionId = createdSessionId;
        }
        if (!mountedRef.current || anonymousAttemptRef.current !== attemptId) return;

        const response = await sendAnonymousMessage({
          session_id: sessionId,
          message: `Question about the listing "${listingTitle}" (slug: ${listingSlug}):\n\n${trimmedQuestion}`,
          context: {
            page: `/listings/${listingSlug}`,
            listing_id: listingId,
          },
          locale: 'en',
          stream: true,
        }, { signal: controller.signal });

        if (response.status === 404 && anonymousSessionRef.current === sessionId) {
          anonymousSessionRef.current = null;
        }
        if (!mountedRef.current || anonymousAttemptRef.current !== attemptId) return;
        if (!response.ok || !response.body) {
          throw new Error('Anonymous message request failed');
        }

        await readAnonymousMessageStream(response.body, (event) => {
          if (!mountedRef.current || anonymousAttemptRef.current !== attemptId) return;

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
        }, ANONYMOUS_ATTEMPT_DEADLINE_MS + 1, controller.signal);

        if (!mountedRef.current || anonymousAttemptRef.current !== attemptId) return;
        if (!receivedAnswer.trim()) {
          throw new Error('Anonymous message stream returned no answer');
        }

        if (mountedRef.current) {
          setQuestion('');
          setAnonymousAnswerReturned(true);
        }
      } catch (error) {
        if (
          mountedRef.current
          && anonymousAttemptRef.current === attemptId
          && !(error instanceof Error && error.name === 'AbortError')
        ) {
          setAnonymousError("We couldn't get an answer. Please try again.");
          setAnonymousTimedOut(false);
          setAnonymousMessages((prev) => prev.filter(
            (message) => message.id !== questionMessageId && message.id !== answerMessageId
          ));
        }
      } finally {
        clearAnonymousAttemptTimers(attemptId);
        if (mountedRef.current && anonymousAttemptRef.current === attemptId) {
          setAnonymousWaitElapsed(false);
          setAnonymousSubmissionInProgress(false);
          setSubmitting(false);
        }
        if (anonymousAbortRef.current?.attemptId === attemptId) {
          anonymousAbortRef.current = null;
        }
      }
      return;
    }

    if (visit.owner === null) return;
    creating.current = true;
    setSubmitting(true);
    try {
      const conv = await createInquiry(listingId, question.trim());
      if (!current()) return;
      setConversation(conv);
      setMessages(conv.messages);
      setQuestion('');
      setShowTyping(true);
      // Set watermark for polling
      const lastMsg = conv.messages[conv.messages.length - 1];
      if (lastMsg) updateSince(lastMsg.created_at);
    } catch (err) {
      if (!current()) return;
      if (err instanceof AxiosError) {
        const detail = err.response?.data?.detail;
        if (err.response?.status === 409) {
          const message = 'You already have an inquiry for this listing. Check your dashboard.';
          setSubmissionError(message);
          toast(message, 'info');
        } else {
          const message = typeof detail === 'string' ? detail : 'Failed to submit question.';
          setSubmissionError(message);
          toast(message, 'error');
        }
      } else {
        const message = 'An unexpected error occurred.';
        setSubmissionError(message);
        toast(message, 'error');
      }
    } finally {
      if (current()) {
        creating.current = false;
        setSubmitting(false);
      }
    }
  };

  const refresh = async () => {
    if (!current() || !conversation) return;
    const version = ++readVersion.current;
    const statusAtStart = statusVersion.current;
    setRefreshing(true);
    try {
      const data = await getConversation(conversation.id);
      if (!current() || version !== readVersion.current) return;
      setConversation((prev) => statusAtStart === statusVersion.current || !prev
        ? data : { ...data, status: prev.status });
      setMessages((prev) => mergeConversationMessages(prev, data.messages ?? []));
      const latest = (data.messages ?? []).at(-1)?.created_at;
      if (latest) updateSince(latest);
      setRefreshError('');
      setShowTyping(false);
    } catch {
      if (current() && version === readVersion.current) setRefreshError('Failed to refresh conversation.');
    } finally {
      if (current() && version === readVersion.current) setRefreshing(false);
    }
  };

  useEffect(() => {
    if (accepted && messages.some((message) => message.id === accepted)) {
      setAccepted(null);
      setRefreshError('');
    }
  }, [accepted, messages]);

  const handleReply = async () => {
    if (!current() || sending.current || accepted || !replyText.trim() || !conversation) return;
    sending.current = true;
    setReplying(true);
    setReplyError('');
    let ack;
    try {
      ack = await replyToConversation(conversation.id, replyText.trim(), 'buyer');
      if (!ack.success) throw new Error('Reply not accepted');
    } catch (err) {
      if (current()) {
        const detail = err instanceof AxiosError ? err.response?.data?.detail : null;
        setReplyError(typeof detail === 'string' ? detail : 'Failed to send reply. Please revise and try again.');
        sending.current = false;
        setReplying(false);
      }
      return;
    }
    if (!current()) return;
    setAccepted(ack.message_id);
    setReplyText('');
    await refresh();
    if (current()) {
      sending.current = false;
      setReplying(false);
    }
  };

  const escalatedStatus = conversation?.status === 'escalated' || conversation?.status === 'awaiting_seller';
  const showAnonymousWaitNotice = anonymousSubmissionInProgress && anonymousWaitElapsed;

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

        {accepted && <p role="status">Reply accepted. Waiting to refresh the server thread.</p>}
        {refreshError && <p role="alert">{refreshError}</p>}
        {(accepted || refreshError) && <button onClick={() => void refresh()} disabled={refreshing}>Refresh conversation</button>}
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
            placeholder="Follow up..."
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
        {isAuthenticated
          ? 'Get an instant AI-powered answer, or your question will be forwarded to the seller.'
          : 'allAI checks current public information to answer questions about this listing.'}
      </p>
      {anonymousMessages.length > 0 && (
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
            {anonymousSubmissionInProgress
              ? (showAnonymousWaitNotice ? 'Still working...' : 'Checking public information...')
              : 'Submitting...'}
          </>
        ) : (
          'Submit Question'
        )}
      </button>
      {(!isAuthenticated || anonymousSubmissionInProgress) && (
        <p
          className={showAnonymousWaitNotice
            ? 'text-xs text-gray-600 mt-2 text-center'
            : 'sr-only'}
          role="status"
        >
          {showAnonymousWaitNotice && (
            <>
              allAI is checking current public information. You may keep waiting, or{' '}
              <Link
                href={`/login?redirect=/listings/${encodeURIComponent(listingSlug)}`}
                onClick={preserveAnonymousDraft}
                className="text-[#3F51B5] hover:underline"
              >
                sign in to ask the seller.
              </Link>
            </>
          )}
        </p>
      )}
      {isAuthenticated && submissionError && (
        <p className="text-xs text-red-600 mt-2" role="alert">
          {submissionError}
        </p>
      )}
      {anonymousTimedOut && anonymousError && (
        <p className="text-xs text-red-600 mt-2" role="alert">
          {anonymousError}{' '}
          <Link
            href={`/login?redirect=/listings/${encodeURIComponent(listingSlug)}`}
            onClick={preserveAnonymousDraft}
            className="text-[#3F51B5] hover:underline"
          >
            sign in to ask the seller.
          </Link>
        </p>
      )}
      {anonymousError && !anonymousTimedOut && (
        <p className="text-xs text-red-600 mt-2" role="alert">
          {anonymousError}
        </p>
      )}
      {anonymousAnswerReturned && (
        <p className="text-xs text-gray-500 mt-2 text-center">
          Want to contact the seller?{' '}
          <Link
            href={`/login?redirect=/listings/${encodeURIComponent(listingSlug)}`}
            onClick={preserveAnonymousDraft}
            className="text-[#3F51B5] hover:underline"
          >
            Sign in to ask the seller.
          </Link>
        </p>
      )}
    </div>
  );
}
