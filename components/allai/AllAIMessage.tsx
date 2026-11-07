'use client';

import { useEffect, useRef } from 'react';
import type { Message } from './AllAIContext';
import Markdown from 'react-markdown';
import TicketStatusCard from './TicketStatusCard';
import AllAINextStep from './AllAINextStep';
import { useAllAI } from './AllAIContext';
import { anonymousAllAIResources } from '@/lib/i18n/anonymous-allai';

function StreamingDots() {
  return (
    <span className="inline-flex gap-1 items-center h-5">
      <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-[allai-dot_1.4s_ease-in-out_infinite]" />
      <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-[allai-dot_1.4s_ease-in-out_0.2s_infinite]" />
      <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-[allai-dot_1.4s_ease-in-out_0.4s_infinite]" />
    </span>
  );
}

export default function AllAIMessage({
  message,
  isStreaming,
}: {
  message: Message;
  isStreaming: boolean;
}) {
  const { locale, anonymousSurfaceActive } = useAllAI();
  const resources = anonymousAllAIResources(locale);
  if (message.role === 'system') {
    return (
      <div className="text-center">
        <span className="text-xs text-white/30 italic">{message.content}</span>
      </div>
    );
  }

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-md px-4 py-2.5 bg-blue-600 text-white text-sm leading-relaxed whitespace-pre-wrap break-words">
          {message.content}
        </div>
      </div>
    );
  }

  // assistant
  const showDots = isStreaming && !message.content;
  const ticketStatusCards = message.ticketStatusCards ?? [];
  return (
    <div className="flex justify-start">
      <div
        className="max-w-[80%] rounded-2xl rounded-bl-md px-4 py-2.5 bg-transparent border border-white/[0.08] text-white/90 text-sm leading-relaxed break-words allai-markdown"
        data-safe-outcome={message.safeOutcome}
        data-fact-revision-set={message.factRevisionSet}
      >
        {message.historical && anonymousSurfaceActive && (
          <p className="mb-2 text-xs text-amber-200/70">{resources.historicalAnswer}</p>
        )}
        {showDots ? (
          <StreamingDots />
        ) : (
          <Markdown
            components={{
              p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
              strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
              em: ({ children }) => <em className="italic">{children}</em>,
              a: ({ href, children }) => (
                <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline hover:text-blue-300">
                  {children}
                </a>
              ),
              ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
              li: ({ children }) => <li>{children}</li>,
              code: ({ children }) => (
                <code className="bg-white/10 rounded px-1 py-0.5 text-xs font-mono">{children}</code>
              ),
            }}
          >
            {message.content}
          </Markdown>
        )}
        {message.failureNotice && (
          <p role="alert" className="mt-2 text-amber-200">
            {message.failureNotice}
          </p>
        )}
        {ticketStatusCards.map((card) => (
          <TicketStatusCard key={`${message.id}-${card.public_ref}-${card.updated_at}`} card={card} />
        ))}
        {message.nextStep && !message.safeOutcome && (
          <AllAINextStep nextStep={message.nextStep} />
        )}
      </div>
    </div>
  );
}

// Only a customer-safe server message/version rendered in a visible customer view
// can create a receipt. Status cards, fetched records and general chat do not.
export function CustomerSupportMessage({ message, current, onRendered }: {
  message: import('@/api/support').CustomerMessage;
  current: () => boolean;
  onRendered: () => Promise<void>;
}) {
  const node = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ current, onRendered });
  callbacks.current = { current, onRendered };
  useEffect(() => {
    const element = node.current;
    if (!element || message.direction !== 'outbound' || typeof IntersectionObserver === 'undefined') return;
    let visible = false;
    let sent = false;
    let alive = true;
    const report = () => {
      const style = getComputedStyle(element);
      if (!alive || sent || !visible || !callbacks.current.current() ||
        document.visibilityState !== 'visible' || !element.isConnected ||
        element.closest('[hidden], [aria-hidden="true"]') || style.display === 'none' || style.visibility === 'hidden' ||
        element.getBoundingClientRect().width <= 0 || element.getBoundingClientRect().height <= 0) return;
      for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
        const computed = getComputedStyle(ancestor);
        if (computed.display === 'none' || computed.visibility === 'hidden' || computed.opacity === '0') return;
      }
      sent = true;
      void callbacks.current.onRendered().catch((error: unknown) => {
        const status = (error as { response?: { status?: number } })?.response?.status;
        // A refused receipt is not receipt evidence. Do not repeat a permanent
        // client refusal on every focus/transition; unknown transport can retry
        // this same immutable message/version on a later visibility event.
        if (status === undefined || status < 400 || status >= 500) sent = false;
      });
    };
    const observer = new IntersectionObserver(entries => {
      visible = entries.some(e => e.target === element && e.isIntersecting && e.intersectionRatio > 0);
      report();
    });
    observer.observe(element);
    document.addEventListener('visibilitychange', report);
    document.addEventListener('transitionend', report, true);
    return () => { alive = false; observer.disconnect(); document.removeEventListener('visibilitychange', report); document.removeEventListener('transitionend', report, true); };
  }, [message.id, message.version, message.direction]);
  return <div ref={node} className="rounded-lg border border-white/15 p-3 whitespace-pre-wrap break-words">
    <span className="sr-only">{message.direction === 'outbound' ? 'Support' : 'You'}: </span>{message.body}
  </div>;
}
