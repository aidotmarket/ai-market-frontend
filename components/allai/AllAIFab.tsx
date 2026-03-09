'use client';

import { useAllAI } from './AllAIContext';

export default function AllAIFab() {
  const { toggle, isOpen } = useAllAI();

  if (isOpen) return null;

  return (
    <button
      onClick={toggle}
      className="allai-fab-pulse fixed bottom-5 right-5 z-40 h-12 w-12 rounded-full flex items-center justify-center shadow-lg transition-all hover:scale-105 active:scale-95 border border-white/[0.1]"
      style={{
        background: 'rgba(12, 17, 30, 0.7)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}
      aria-label="Open allAI assistant"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-blue-400/70"
      >
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      </svg>
    </button>
  );
}
