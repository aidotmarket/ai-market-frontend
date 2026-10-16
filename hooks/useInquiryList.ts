'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { getMyConversations } from '@/api/conversations';
import type { ConversationListItem } from '@/types';

const PAGE_SIZE = 20;

export function useInquiryList(role: 'buyer' | 'seller') {
  const [page, setPage] = useState(1);
  const [inquiries, setInquiries] = useState<ConversationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const read = useRef<() => Promise<void>>(async () => {});
  const refetch = useCallback(() => read.current(), []);

  const changePage = useCallback((nextPage: number) => {
    if (!Number.isSafeInteger(nextPage) || nextPage < 1 || nextPage === page) return;
    // Invalidate immediately, including reads that finish before effect cleanup.
    generation.current += 1;
    read.current = async () => {};
    setInquiries([]);
    setError('');
    setLoading(true);
    setPage(nextPage);
  }, [page]);

  useEffect(() => {
    const current = ++generation.current;
    let version = 0;
    setInquiries([]);
    setError('');
    setLoading(true);
    const fetchPage = async () => {
      const request = ++version;
      const isCurrent = () => generation.current === current && request === version;
      try {
        const data = await getMyConversations(role, page, PAGE_SIZE);
        if (isCurrent()) {
          setInquiries(data);
          setError('');
        }
      } catch {
        if (isCurrent()) setError('Failed to load inquiries.');
      } finally {
        if (isCurrent()) setLoading(false);
      }
    };
    read.current = fetchPage;
    void fetchPage();
    const refreshVisible = () => {
      if (!document.hidden) void fetchPage();
    };
    const interval = setInterval(refreshVisible, 10000);
    document.addEventListener('visibilitychange', refreshVisible);
    return () => {
      generation.current += 1;
      read.current = async () => {};
      clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshVisible);
    };
  }, [role, page]);

  return { inquiries, loading, error, refetch, page, changePage,
    hasNext: inquiries.length === PAGE_SIZE };
}
