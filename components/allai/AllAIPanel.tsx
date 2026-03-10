'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { useAllAI } from './AllAIContext';
import AllAIMessage from './AllAIMessage';
import AllAIChatInput from './AllAIChatInput';

const MOBILE_BREAKPOINT = 640;

const DEFAULT_WIDTH = 480;
const DEFAULT_HEIGHT = 420;
const MIN_WIDTH = 320;
const MIN_HEIGHT = 300;
const MAX_WIDTH = 700;
const MAX_HEIGHT = 600;

export default function AllAIPanel() {
  const { isOpen, close, messages, isStreaming, sendMessage } = useAllAI();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Position & size state (desktop only)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState({ w: DEFAULT_WIDTH, h: DEFAULT_HEIGHT });

  // Drag refs (useRef to avoid re-renders during drag)
  const dragRef = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });

  // Resize refs
  const resizeRef = useRef(false);
  const resizeStart = useRef({ mx: 0, my: 0, w: 0, h: 0 });

  const panelRef = useRef<HTMLDivElement>(null);

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

  // Clamp position within viewport
  const clampPos = useCallback(
    (x: number, y: number, w: number, h: number) => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      return {
        x: Math.max(0, Math.min(x, vw - w)),
        y: Math.max(0, Math.min(y, vh - h)),
      };
    },
    []
  );

  // --- Drag handlers ---
  const onDragStart = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      // Don't drag if clicking close button
      if ((e.target as HTMLElement).closest('button')) return;
      e.preventDefault();
      dragRef.current = true;

      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

      // If no custom position yet, compute from bottom-right default
      const currentPos = pos ?? {
        x: window.innerWidth - size.w - 20,
        y: window.innerHeight - size.h - 20,
      };

      dragStart.current = {
        mx: clientX,
        my: clientY,
        px: currentPos.x,
        py: currentPos.y,
      };

      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
    },
    [pos, size]
  );

  const onDragMove = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (!dragRef.current) return;
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const dx = clientX - dragStart.current.mx;
      const dy = clientY - dragStart.current.my;
      const newX = dragStart.current.px + dx;
      const newY = dragStart.current.py + dy;
      const clamped = clampPos(newX, newY, size.w, size.h);
      setPos(clamped);
    },
    [clampPos, size]
  );

  const onDragEnd = useCallback(() => {
    if (!dragRef.current) return;
    dragRef.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  // --- Resize handlers ---
  const onResizeStart = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      resizeRef.current = true;

      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

      resizeStart.current = {
        mx: clientX,
        my: clientY,
        w: size.w,
        h: size.h,
      };

      document.body.style.cursor = 'nwse-resize';
      document.body.style.userSelect = 'none';
    },
    [size]
  );

  const onResizeMove = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (!resizeRef.current) return;
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const dx = clientX - resizeStart.current.mx;
      const dy = clientY - resizeStart.current.my;
      const newW = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, resizeStart.current.w + dx));
      const newH = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, resizeStart.current.h + dy));
      setSize({ w: newW, h: newH });
    },
    []
  );

  const onResizeEnd = useCallback(() => {
    if (!resizeRef.current) return;
    resizeRef.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  // Attach global mouse/touch listeners for drag & resize
  useEffect(() => {
    if (isMobile) return;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      onDragMove(e);
      onResizeMove(e);
    };
    const handleUp = () => {
      onDragEnd();
      onResizeEnd();
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchmove', handleMove);
    window.addEventListener('touchend', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleUp);
    };
  }, [isMobile, onDragMove, onDragEnd, onResizeMove, onResizeEnd]);

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

      {/* Header — drag handle (desktop only) */}
      <div
        className={`px-5 pt-4 pb-2 select-none ${!isMobile ? 'cursor-grab active:cursor-grabbing' : ''}`}
        onMouseDown={!isMobile ? onDragStart : undefined}
        onTouchStart={!isMobile ? onDragStart : undefined}
        style={!isMobile ? { borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.03)' } : undefined}
      >
        <div className="flex items-center gap-2">
          {!isMobile && (
            <span className="text-white/20 text-[10px] leading-none tracking-[2px]" aria-hidden>⠿</span>
          )}
          <h2 className="text-sm font-semibold text-white/80">allAI</h2>
        </div>
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

      {/* Resize handle (desktop only) */}
      {!isMobile && (
        <div
          onMouseDown={onResizeStart}
          onTouchStart={onResizeStart}
          className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize z-10 flex items-end justify-end p-[3px]"
          aria-hidden
        >
          <svg width="10" height="10" viewBox="0 0 10 10" className="text-white/20">
            <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1.5" />
            <line x1="9" y1="5" x2="5" y2="9" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </div>
      )}
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

  // Desktop: compute position
  const computedPos = pos ?? {
    x: window.innerWidth - size.w - 20,
    y: window.innerHeight - size.h - 20,
  };

  return (
    <div
      ref={panelRef}
      className="fixed z-50 flex flex-col rounded-2xl overflow-hidden shadow-[0_8px_40px_rgba(0,0,0,0.5)]"
      style={{
        width: size.w,
        height: size.h,
        left: computedPos.x,
        top: computedPos.y,
        background: 'rgba(12, 17, 30, 0.88)',
        backdropFilter: 'blur(28px) saturate(150%)',
        WebkitBackdropFilter: 'blur(28px) saturate(150%)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 8px 40px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.05)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(12px)',
        transition: dragRef.current || resizeRef.current
          ? 'none'
          : 'opacity 200ms ease, transform 200ms ease',
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      {panelContent}
    </div>
  );
}
