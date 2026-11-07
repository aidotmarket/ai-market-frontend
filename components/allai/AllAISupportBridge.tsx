'use client';
import { createContext, useContext } from 'react';
import type { OrderIssueSession } from '@/lib/order-issue-report';
export const AllAISupportBridge = createContext<{ openSupportConversation: (session: OrderIssueSession) => void } | null>(null);
export const useOptionalAllAI = () => useContext(AllAISupportBridge);
