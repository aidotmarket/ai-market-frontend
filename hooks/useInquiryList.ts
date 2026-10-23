'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { getMyConversations } from '@/api/conversations';
import { authSessionIdentity, useAuthStore } from '@/store/auth';
import type { ConversationListItem } from '@/types';

const PAGE_SIZE = 20;

export function useInquiryList(role: 'buyer' | 'seller') {
  const owner = useAuthStore(authSessionIdentity);
  const visitRef = useRef({ owner, role, account: 0 });
  const [, notify] = useState(0);
  const mounted = useRef(false);
  if (visitRef.current.owner !== owner || visitRef.current.role !== role) {
    visitRef.current = { owner, role, account: visitRef.current.account + Number(visitRef.current.owner !== owner) };
  }
  const visit = visitRef.current;
  const [renderedVisit, setRenderedVisit] = useState(visit);
  useEffect(() => {
    mounted.current = true;
    const unsubscribe = useAuthStore.subscribe((state) => {
      const next = authSessionIdentity(state);
      if (visitRef.current.owner !== next) {
        visitRef.current = { owner: next, role: visitRef.current.role, account: visitRef.current.account + 1 };
        notify((value) => value + 1);
      }
    });
    return () => { mounted.current = false; unsubscribe(); };
  }, []);
  const isCurrent = useCallback(() => mounted.current && visit.owner !== null && visitRef.current === visit
    && authSessionIdentity(useAuthStore.getState()) === visit.owner, [visit]);
  const [page, setPage] = useState(1);
  const [inquiries, setInquiries] = useState<ConversationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const read = useRef<() => Promise<void>>(async () => {});
  const refetch = useCallback(async () => { if (isCurrent()) await read.current(); }, [isCurrent]);

  // A new account visit starts at page one; a role change keeps current paging.
  if (renderedVisit !== visit) {
    setRenderedVisit(visit);
    if (renderedVisit.account !== visit.account) setPage(1);
    setInquiries([]);
    setError('');
    setLoading(true);
    generation.current += 1;
    read.current = async () => {};
  }

  const changePage = useCallback((nextPage: number) => {
    if (!isCurrent() || !Number.isSafeInteger(nextPage) || nextPage < 1 || nextPage === page) return;
    // Invalidate immediately, including reads that finish before effect cleanup.
    generation.current += 1;
    read.current = async () => {};
    setInquiries([]);
    setError('');
    setLoading(true);
    setPage(nextPage);
  }, [page, isCurrent]);

  useEffect(() => {
    const current = ++generation.current;
    let version = 0;
    setInquiries([]);
    setError('');
    setLoading(true);
    const fetchPage = async () => {
      if (!isCurrent() || generation.current !== current) return;
      const request = ++version;
      const ownsRead = () => isCurrent() && generation.current === current && request === version;
      try {
        const data = await getMyConversations(role, page, PAGE_SIZE);
        if (ownsRead()) {
          setInquiries(data);
          setError('');
        }
      } catch {
        if (ownsRead()) setError('Failed to load inquiries.');
      } finally {
        if (ownsRead()) setLoading(false);
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
  }, [role, page, isCurrent]);

  return { inquiries, loading, error, refetch, page, changePage, visit, isCurrent,
    hasNext: inquiries.length === PAGE_SIZE };
}
