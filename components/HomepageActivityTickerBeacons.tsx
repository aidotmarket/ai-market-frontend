'use client';

import { useEffect } from 'react';

type TickerBeaconItem = {
  listingId: string;
  slot: number;
  placementId?: string | null;
};

type HomepageActivityTickerBeaconsProps = {
  items: TickerBeaconItem[];
  locale: string;
  impressionEndpoint: string;
  clickEndpointBase: string;
};

function sendJsonBeacon(endpoint: string, payload: Record<string, unknown>) {
  if (!endpoint || typeof navigator === 'undefined' || !navigator.sendBeacon) return;

  try {
    navigator.sendBeacon(endpoint, new Blob([JSON.stringify(payload)], { type: 'application/json' }));
  } catch {
    // Analytics must never affect navigation or rendering.
  }
}

export function HomepageActivityTickerBeacons({
  items,
  locale,
  impressionEndpoint,
  clickEndpointBase,
}: HomepageActivityTickerBeaconsProps) {
  useEffect(() => {
    if (items.length === 0) return;

    const device = navigator.userAgent;
    for (const item of items) {
      sendJsonBeacon(impressionEndpoint, {
        listing_id: item.listingId,
        slot: item.slot,
        locale,
        device,
        surface: 'homepage_ticker',
        placement_id: item.placementId ?? null,
      });
    }
  }, [impressionEndpoint, items, locale]);

  useEffect(() => {
    if (!clickEndpointBase) return;

    const handleClick = (event: MouseEvent) => {
      const target = event.target instanceof Element
        ? event.target.closest<HTMLAnchorElement>('[data-featured-listing-id]')
        : null;

      if (!target) return;

      const listingId = target.dataset.featuredListingId;
      if (!listingId) return;

      const params = new URLSearchParams({ locale });
      if (target.dataset.featuredSlot) params.set('slot', target.dataset.featuredSlot);
      if (target.dataset.featuredPlacementId) params.set('placement_id', target.dataset.featuredPlacementId);

      sendJsonBeacon(`${clickEndpointBase}/${encodeURIComponent(listingId)}/click?${params.toString()}`, {
        listing_id: listingId,
        slot: Number(target.dataset.featuredSlot ?? 0),
        locale,
        surface: 'homepage_ticker',
        placement_id: target.dataset.featuredPlacementId ?? null,
      });
    };

    document.addEventListener('click', handleClick, { capture: true });
    return () => document.removeEventListener('click', handleClick, { capture: true });
  }, [clickEndpointBase, locale]);

  return null;
}
