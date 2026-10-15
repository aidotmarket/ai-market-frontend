import type { ConversationMessage } from '@/types';

/** Only server records enter the thread, keyed by their immutable message ID. */
export function mergeConversationMessages(current: ConversationMessage[], incoming: ConversationMessage[]) {
  const messages = new Map(current.map((message) => [message.id, message]));
  incoming.forEach((message) => messages.set(message.id, message));
  return [...messages.values()].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
}
