import { api } from './client';
import type {
  ConversationListItem,
  ConversationDetail,
  ConversationReplyAck,
  ConversationPollResponse,
} from '@/types';

export async function createInquiry(
  listingId: string,
  question: string,
  requestSeller = false
): Promise<ConversationDetail> {
  const res = await api.post<ConversationDetail>('/conversations/', {
    listing_id: listingId,
    question,
    request_seller: requestSeller,
  });
  return res.data;
}

export async function getMyConversations(
  role: 'buyer' | 'seller',
  page = 1,
  perPage = 20
): Promise<ConversationListItem[]> {
  const res = await api.get<ConversationListItem[]>('/conversations/mine', {
    params: {
      role,
      page: Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1,
      per_page: Number.isFinite(perPage) ? Math.min(100, Math.max(1, Math.floor(perPage))) : 20,
    },
  });
  return res.data;
}

export async function getConversation(
  id: string
): Promise<ConversationDetail> {
  const res = await api.get<ConversationDetail>(
    `/conversations/${encodeURIComponent(id)}`
  );
  return res.data;
}

/**
 * Clear the caller's unread count for a thread that has been shown to them.
 * Best effort: resolves false instead of throwing, so a failed mark-read never
 * breaks the thread view. `seenMessageCount` is the number of messages shown;
 * messages that arrived after that view stay unread.
 */
export async function markConversationRead(
  id: string,
  seenMessageCount: number
): Promise<boolean> {
  try {
    await api.post(`/conversations/${encodeURIComponent(id)}/read`, {
      seen_message_count: seenMessageCount,
    });
    return true;
  } catch {
    return false;
  }
}

export async function replyToConversation(
  id: string,
  content: string,
  role: 'buyer' | 'seller'
): Promise<ConversationReplyAck> {
  const res = await api.post<ConversationReplyAck>(
    `/conversations/${encodeURIComponent(id)}/reply`,
    { content, role }
  );
  return res.data;
}

export async function pollConversation(
  id: string,
  since: string
): Promise<ConversationPollResponse> {
  const res = await api.get<ConversationPollResponse>(
    `/conversations/${encodeURIComponent(id)}/poll`,
    { params: { since } }
  );
  return res.data;
}
