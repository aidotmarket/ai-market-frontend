'use client';

import { useEffect, useRef, useState } from 'react';
import { getListingOwnership } from '@/api/listings';

export const OWNERSHIP_DEADLINE_MS = 3000;

interface OwnershipAttempt {
  listingId: string;
  userId?: string;
  deadline: number;
  promise?: Promise<boolean>;
  settled: boolean;
}

export function useListingOwnership(listingId: string, userId: string | undefined, sellerId: string | undefined, isAuthenticated: boolean) {
  const knownOwner = isAuthenticated && !!userId && userId === sellerId;
  const request = useRef<OwnershipAttempt | null>(null);
  const [result, setResult] = useState<{ attempt: OwnershipAttempt; isOwner: boolean } | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      request.current = null;
      return;
    }
    if (knownOwner) return;

    // Identity loading and the request share a deadline. Ordinary rerenders and
    // Strict Mode replay reuse the same attempt; a different user/listing does not.
    if (!request.current || request.current.listingId !== listingId ||
        (request.current.userId !== undefined && request.current.userId !== userId)) {
      request.current = { listingId, userId, deadline: Date.now() + OWNERSHIP_DEADLINE_MS, settled: false };
    }
    const attempt = request.current;
    attempt.userId ??= userId;
    if (attempt.settled) return;
    let cancelled = false;
    const finish = (isOwner: boolean) => {
      if (cancelled || attempt.settled) return;
      attempt.settled = true;
      clearTimeout(timer);
      setResult({ attempt, isOwner });
    };
    const timer = setTimeout(() => finish(false), Math.max(0, attempt.deadline - Date.now()));
    if (Date.now() >= attempt.deadline) {
      finish(false);
    } else if (userId) {
      attempt.promise ??= getListingOwnership(listingId).catch(() => false);
      attempt.promise.then((isOwner) => finish(Date.now() < attempt.deadline && isOwner === true));
    }
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [listingId, userId, knownOwner, isAuthenticated]);

  const attempt = request.current;
  const resolved = result?.attempt === attempt && attempt?.listingId === listingId &&
    (attempt.userId === undefined || attempt.userId === userId);
  return {
    isOwner: knownOwner || (isAuthenticated && resolved && result?.isOwner === true),
    checkingOwnership: isAuthenticated && !knownOwner && !resolved,
  };
}
