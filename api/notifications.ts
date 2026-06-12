import { api } from './client';

export interface NotificationItem {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  metadata: Record<string, unknown>;
  link_url: string | null;
  read_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface NotificationListResponse {
  items: NotificationItem[];
  total: number;
  limit: number;
  offset: number;
  unread_only: boolean;
}

export interface NotificationUnreadCountResponse {
  unread_count: number;
}

export async function getNotifications(params?: { limit?: number; offset?: number; unread_only?: boolean }) {
  const res = await api.get<NotificationListResponse>('/notifications', { params });
  return res.data;
}

export async function getUnreadNotificationCount() {
  const res = await api.get<NotificationUnreadCountResponse>('/notifications/unread-count');
  return res.data;
}

export async function markNotificationRead(notificationId: string) {
  const res = await api.patch<NotificationItem>(`/notifications/${encodeURIComponent(notificationId)}/read`);
  return res.data;
}

export async function markAllNotificationsRead() {
  const res = await api.patch<{ updated: number }>('/notifications/read-all');
  return res.data;
}
