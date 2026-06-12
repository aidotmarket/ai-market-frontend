'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  getNotifications,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from '@/api/notifications';
import { useAllAI } from '@/components/allai/AllAIContext';

const SUPPORT_TYPES = new Set(['support_ticket_status_changed', 'support_ticket_message']);

function formatNotificationTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function extractPublicRef(notification: Pick<NotificationItem, 'metadata' | 'link_url' | 'body' | 'title'>): string | null {
  const metadataRef = notification.metadata.public_ref ?? notification.metadata.ticket_public_ref ?? notification.metadata.ticket_ref;
  if (typeof metadataRef === 'string' && metadataRef.trim()) return metadataRef.trim();

  const linkMatch = notification.link_url?.match(/\/support\/tickets\/([^/?#]+)/);
  if (linkMatch?.[1]) return decodeURIComponent(linkMatch[1]);

  const textMatch = `${notification.title} ${notification.body ?? ''}`.match(/\bT-[A-Z0-9-]+\b/i);
  return textMatch?.[0] ?? null;
}

export function getNotificationClickAction(notification: NotificationItem):
  | { kind: 'allai'; prompt: string }
  | { kind: 'route'; href: string }
  | { kind: 'inline' } {
  if (SUPPORT_TYPES.has(notification.type) || notification.link_url?.startsWith('/support/tickets/')) {
    const publicRef = extractPublicRef(notification);
    return { kind: 'allai', prompt: publicRef ? `status of ticket ${publicRef}` : 'show my support ticket status' };
  }

  if (notification.link_url) return { kind: 'route', href: notification.link_url };
  return { kind: 'inline' };
}

export function NotificationList({
  notifications,
  onNotificationClick,
}: {
  notifications: NotificationItem[];
  onNotificationClick: (notification: NotificationItem) => void;
}) {
  if (notifications.length === 0) {
    return <p className="px-4 py-6 text-sm text-gray-500">No notifications yet.</p>;
  }

  return (
    <ul className="max-h-96 overflow-y-auto divide-y divide-gray-100">
      {notifications.map((notification) => {
        const unread = !notification.read_at;
        return (
          <li key={notification.id}>
            <button
              type="button"
              onClick={() => onNotificationClick(notification)}
              className={`block w-full px-4 py-3 text-left transition-colors hover:bg-gray-50 ${unread ? 'bg-blue-50/60' : 'bg-white'}`}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`mt-1.5 h-2 w-2 rounded-full ${unread ? 'bg-blue-600' : 'bg-gray-300'}`}
                  aria-label={unread ? 'Unread notification' : 'Read notification'}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-gray-900">{notification.title}</span>
                    <span className="shrink-0 text-xs text-gray-500">{formatNotificationTime(notification.created_at)}</span>
                  </span>
                  {notification.body && (
                    <span className="mt-1 block text-sm leading-snug text-gray-600">{notification.body}</span>
                  )}
                  <span className="mt-1 block text-xs text-gray-400">{notification.type}</span>
                </span>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export default function NotificationCenter({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const allAI = useAllAI();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const visibleUnreadCount = useMemo(() => Math.min(unreadCount, 99), [unreadCount]);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setIsLoading(true);
    try {
      const [list, count] = await Promise.all([
        getNotifications({ limit: 20 }),
        getUnreadNotificationCount(),
      ]);
      setNotifications(list.items);
      setUnreadCount(count.unread_count);
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    refresh().catch(() => undefined);
  }, [refresh]);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [isOpen]);

  if (!enabled) return null;

  const handleNotificationClick = async (notification: NotificationItem) => {
    if (!notification.read_at) {
      setNotifications((prev) =>
        prev.map((item) =>
          item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item
        )
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
      markNotificationRead(notification.id).catch(() => refresh().catch(() => undefined));
    }

    const action = getNotificationClickAction(notification);
    setIsOpen(false);
    if (action.kind === 'allai') {
      allAI.open();
      await allAI.sendMessage(action.prompt);
    } else if (action.kind === 'route') {
      router.push(action.href);
    }
  };

  const handleMarkAllRead = async () => {
    setNotifications((prev) => prev.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })));
    setUnreadCount(0);
    await markAllNotificationsRead().catch(() => refresh().catch(() => undefined));
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="relative rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={isOpen}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 00-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M13.73 21a2 2 0 01-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-blue-600 px-1.5 py-0.5 text-center text-[10px] font-semibold leading-none text-white">
            {visibleUnreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Notifications</h2>
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={unreadCount === 0}
              className="text-xs font-medium text-blue-600 disabled:text-gray-300"
            >
              Mark all read
            </button>
          </div>
          {isLoading && notifications.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500">Loading notifications...</p>
          ) : (
            <NotificationList notifications={notifications} onNotificationClick={handleNotificationClick} />
          )}
        </div>
      )}
    </div>
  );
}
