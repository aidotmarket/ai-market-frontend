'use client';

import { useEffect, useRef, useState } from 'react';
import { getMyListings } from '@/api/listings';

export function useListingOwnership(listingId: string, userId?: string, sellerId?: string) {
  const knownOwner = !!userId && userId === sellerId;
  const request = useRef<{ userId: string; promise: Promise<Set<string>> } | null>(null);
  const [result, setResult] = useState<{ userId: string; ids: Set<string> } | null>(null);

  useEffect(() => {
    if (!userId || knownOwner) return;
    let cancelled = false;
    // Keep one request for this page view, including Strict Mode effect replay.
    if (request.current?.userId !== userId) {
      request.current = {
        userId,
        promise: getMyListings()
          .then(({ data }: { data: Array<{ id: string }> }) => new Set(data.map(({ id }) => id)))
          .catch(() => new Set<string>()),
      };
    }
    request.current.promise.then((ids) => {
      if (!cancelled) setResult({ userId, ids });
    });
    return () => { cancelled = true; };
  }, [userId, knownOwner]);

  const resolved = result?.userId === userId;
  return {
    isOwner: knownOwner || (!!userId && resolved && !!result?.ids.has(listingId)),
    checkingOwnership: !!userId && !knownOwner && !resolved,
  };
}
