import { api } from './client';
import type {
  ConversationListItem,
  ConversationDetail,
  ConversationMessage,
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
  role: 'buyer' | 'seller'
): Promise<ConversationListItem[]> {
  const res = await api.get<ConversationListItem[]>('/conversations/mine', {
    params: { role },
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

export async function replyToConversation(
  id: string,
  content: string,
  role: 'buyer' | 'seller'
): Promise<ConversationMessage> {
  const res = await api.post<ConversationMessage>(
    `/conversations/${encodeURIComponent(id)}/reply`,
    { content, role }
  );
  return res.data;
}

export async function pollConversation(
  id: string,
  since: string
): Promise<ConversationMessage[]> {
  const res = await api.get<ConversationMessage[]>(
    `/conversations/${encodeURIComponent(id)}/poll`,
    { params: { since } }
  );
  return res.data;
}
