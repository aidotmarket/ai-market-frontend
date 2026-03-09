'use client';

import { useRef, useEffect, useState } from 'react';
import { useAllAI } from './AllAIContext';
import AllAIMessage from './AllAIMessage';
import AllAIChatInput from './AllAIChatInput';

const MOBILE_BREAKPOINT = 640;

export default function AllAIPanel() {
  const { isOpen, close, messages, isStreaming, sendMessage } = useAllAI();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (!isOpen) return null;

  const panelContent = (
    <>
      {/* Close button */}
      <button
        onClick={close}
        className="absolute top-3 right-3 z-10 p-1.5 rounded-full text-white/40 hover:text-white/80 hover:bg-white/10 transition-all"
        aria-label="Close allAI assistant"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6L6 18" />
          <path d="M6 6l12 12" />
        </svg>
      </button>

      {/* Header */}
      <div className="px-5 pt-4 pb-2">
        <h2 className="text-sm font-semibold text-white/80">allAI</h2>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-5 pb-2 space-y-3 scrollbar-thin"
        aria-live="polite"
      >
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-white/30 italic">How can I help you today?</p>
          </div>
        )}
        {messages.map((msg) => (
          <AllAIMessage
            key={msg.id}
            message={msg}
            isStreaming={isStreaming && msg === messages[messages.length - 1]}
          />
        ))}
      </div>

      {/* Input */}
      <AllAIChatInput onSend={sendMessage} disabled={isStreaming} />
    </>
  );

  if (isMobile) {
    return (
      <div
        className={`fixed inset-0 z-50 flex flex-col transition-opacity duration-200 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          background: 'rgba(12, 17, 30, 0.92)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
        }}
      >
        {panelContent}
      </div>
    );
  }

  return (
    <div
      className="fixed bottom-5 right-5 z-50 flex flex-col rounded-2xl overflow-hidden border border-white/[0.08] shadow-[0_8px_40px_rgba(0,0,0,0.5)]"
      style={{
        width: 480,
        height: 420,
        background: 'rgba(12, 17, 30, 0.54)',
        backdropFilter: 'blur(28px) saturate(150%)',
        WebkitBackdropFilter: 'blur(28px) saturate(150%)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(12px)',
        transition: 'opacity 200ms ease, transform 200ms ease',
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      {panelContent}
    </div>
  );
}
