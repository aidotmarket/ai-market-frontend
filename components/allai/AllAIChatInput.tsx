'use client';

import { useState, useRef, useCallback, useEffect, type KeyboardEvent } from 'react';
import { useAllAI } from './AllAIContext';

const SUGGESTED_PROMPTS: Record<string, string[]> = {
  '/': [
    'What kind of data can I find here?',
    'How does ai.market work?',
  ],
  '/listings': [
    'Help me find a dataset',
    'What categories are available?',
  ],
  '/requests': [
    'How do data requests work?',
    'Can I request custom data?',
  ],
  '/partner': [
    'How do I become a data partner?',
    'What are the requirements?',
  ],
};

function getSuggestions(path: string): string[] {
  if (SUGGESTED_PROMPTS[path]) return SUGGESTED_PROMPTS[path];
  if (path.startsWith('/listings/')) {
    return ['Tell me more about this dataset', 'Is this data updated regularly?'];
  }
  return SUGGESTED_PROMPTS['/'];
}

export default function AllAIChatInput({
  onSend,
  disabled,
}: {
  onSend: (text: string) => void;
  disabled?: boolean;
}) {
  const { page, messages } = useAllAI();
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 72)}px`;
  }, []);

  useEffect(() => adjustHeight(), [value, adjustHeight]);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
  }, [value, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const showSuggestions = messages.length === 0 && !value;
  const suggestions = getSuggestions(page);

  return (
    <div className="px-4 pb-4 pt-2">
      {showSuggestions && (
        <div className="flex flex-wrap gap-2 mb-3">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => onSend(s)}
              className="text-xs px-3 py-1.5 rounded-full border border-white/[0.1] text-white/50 hover:text-white/80 hover:border-white/20 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2 rounded-xl border border-white/[0.1] bg-white/[0.04] px-3 py-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask allAI anything..."
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm text-white/90 placeholder:text-white/30 outline-none leading-snug"
        />
        <button
          onClick={handleSend}
          disabled={disabled || !value.trim()}
          aria-label="Send message"
          className="flex-shrink-0 p-1.5 rounded-lg text-white/40 hover:text-white/80 disabled:opacity-30 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2L11 13" />
            <path d="M22 2L15 22L11 13L2 9L22 2Z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
