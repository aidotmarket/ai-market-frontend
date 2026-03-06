'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { getMyConversations } from '@/api/conversations';
import type { ConversationListItem } from '@/types';

export function useInquiryList(role: 'buyer' | 'seller') {
  const [inquiries, setInquiries] = useState<ConversationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const activeRef = useRef(true);

  const fetch = useCallback(async () => {
    try {
      const data = await getMyConversations(role);
      if (activeRef.current) {
        setInquiries(data);
        setError('');
      }
    } catch {
      if (activeRef.current) {
        setError('Failed to load inquiries.');
      }
    } finally {
      if (activeRef.current) setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    activeRef.current = true;
    setLoading(true);
    fetch();

    const interval = setInterval(() => {
      if (!document.hidden) fetch();
    }, 10000);

    const onVisibility = () => {
      if (!document.hidden) fetch();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      activeRef.current = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetch]);

  return { inquiries, loading, error, refetch: fetch };
}
