'use client';

import { useRef, useEffect } from 'react';
import type { ConversationMessage, MessageRole } from '@/types';

const ROLE_STYLES: Record<MessageRole, { bg: string; label: string; align: string }> = {
  buyer: { bg: 'bg-[#E8EAF6] border-[#C5CAE9]', label: 'You', align: 'ml-8' },
  seller: { bg: 'bg-gray-50 border-gray-200', label: 'Seller', align: 'mr-8' },
  allai: { bg: 'bg-purple-50 border-purple-200', label: 'allAI', align: 'mr-8' },
  system: { bg: 'bg-yellow-50 border-yellow-200', label: 'System', align: 'mx-8' },
};

interface Props {
  messages: ConversationMessage[];
  viewerRole: 'buyer' | 'seller';
  showTypingIndicator?: boolean;
}

export default function ConversationThread({ messages, viewerRole, showTypingIndicator }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, showTypingIndicator]);

  return (
    <div className="space-y-3">
      {messages.map((msg) => {
        const isOwn = msg.role === viewerRole;
        const style = isOwn
          ? { bg: 'bg-[#E8EAF6] border-[#C5CAE9]', label: 'You', align: 'ml-8' }
          : ROLE_STYLES[msg.role] || ROLE_STYLES.system;

        return (
          <div key={msg.id} className={`rounded-lg border p-3 ${style.bg} ${style.align}`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-600">{style.label}</span>
              <span className="text-xs text-gray-400">
                {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <p className="text-sm text-gray-900 whitespace-pre-wrap">{msg.content}</p>
          </div>
        );
      })}

      {showTypingIndicator && (
        <div className="rounded-lg border bg-purple-50 border-purple-200 p-3 mr-8">
          <span className="text-xs font-medium text-gray-600 block mb-1">allAI</span>
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="h-2 w-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="h-2 w-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
