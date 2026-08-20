'use client';

import { useAllAI } from './AllAIContext';
import { anonymousAllAIResources } from '@/lib/i18n/anonymous-allai';

export default function AllAIFab() {
  const { toggle, isOpen, locale, anonymousSurfaceActive, anonymousAvailable } = useAllAI();
  const resources = anonymousAllAIResources(locale);

  if (isOpen) return null;
  if (anonymousSurfaceActive && !anonymousAvailable) return null;

  return (
    <button
      type="button"
      id="allai-launcher"
      onClick={toggle}
      className={`allai-fab-pulse fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-5 z-40 h-12 rounded-full flex items-center justify-center shadow-lg transition-all hover:scale-105 active:scale-95 border border-white/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 motion-reduce:transition-none motion-reduce:hover:scale-100 ${
        anonymousSurfaceActive ? 'min-w-11 gap-2 px-4' : 'w-12'
      }`}
      style={{
        background: 'rgba(12, 17, 30, 0.7)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}
      aria-label={anonymousSurfaceActive ? resources.openAssistant : 'Open allAI assistant'}
      aria-expanded={isOpen}
      aria-controls="allai-assistant-dialog"
      data-testid="allai-launcher"
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
      {anonymousSurfaceActive && (
        <span className="whitespace-nowrap text-sm font-semibold text-white/90">
          {resources.assistantLabel}
        </span>
      )}
    </button>
  );
}
