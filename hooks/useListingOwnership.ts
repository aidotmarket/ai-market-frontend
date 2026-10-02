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

export function useListingOwnership(listingId: string, userId: string | undefined, sellerId: string | undefined, isAuthenticated: boolean, authPending: boolean) {
  const request = useRef<OwnershipAttempt | null>({
    listingId, userId, deadline: Date.now() + OWNERSHIP_DEADLINE_MS, settled: false,
  });
  const [result, setResult] = useState<{ attempt: OwnershipAttempt; isOwner: boolean } | null>(null);

  const attempt = request.current;
  const sameIdentity = attempt?.listingId === listingId &&
    (attempt.userId === undefined || attempt.userId === userId);
  const resolved = sameIdentity && result?.attempt === attempt;
  const knownOwner = isAuthenticated && !!userId && userId === sellerId &&
    (!sameIdentity || (resolved ? result.isOwner : Date.now() < attempt.deadline));

  useEffect(() => {
    if (!isAuthenticated && !authPending) {
      request.current = null;
      return;
    }

    // Auth hydration, identity loading and lookup share the deadline started at mount.
    // Rerenders and Strict Mode replay reuse it; a different user/listing does not.
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
    } else if (knownOwner) {
      finish(true);
    } else if (isAuthenticated && userId) {
      attempt.promise ??= getListingOwnership(listingId).catch(() => false);
      attempt.promise.then((isOwner) => finish(Date.now() < attempt.deadline && isOwner === true));
    }
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [listingId, userId, knownOwner, isAuthenticated, authPending]);

  return {
    isOwner: knownOwner || (isAuthenticated && resolved && result?.isOwner === true),
    checkingOwnership: (isAuthenticated || authPending) && !knownOwner && !resolved,
  };
}
