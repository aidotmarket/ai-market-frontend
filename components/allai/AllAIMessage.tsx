'use client';

import type { Message } from './AllAIContext';

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
  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] rounded-2xl rounded-bl-md px-4 py-2.5 bg-transparent border border-white/[0.08] text-white/90 text-sm leading-relaxed whitespace-pre-wrap break-words">
        {showDots ? <StreamingDots /> : message.content}
      </div>
    </div>
  );
}
