import type { ListingShareResponse } from '@/api/share';
export function promoteShare(canShare = true): ListingShareResponse {
  return {
    listing_id: 'listing-1', short_code: 'Code', share_url: 'https://ai.market/l/Code', card_url: 'https://ai.market/l/Code/card.png',
    caption: { og_title: 'Unsafe caption title', og_description: 'Draft description', caption_text: 'Draft text', status: 'machine' },
    promote: {
      enabled: true, can_share: canShare, ttl_seconds: 45,
      links: Object.fromEntries(['x', 'li', 'rd', 'bs', 'wa', 'tg', 'em'].map(net => [net, { share_url: `https://ai.market/l/Code/${net}`, compose_url: `https://compose.example/${net}`, prefilled: net !== 'li' }])) as NonNullable<ListingShareResponse['promote']>['links'],
      copy_text: 'Safe server text', share_title: 'Safe server title', rules: 'Attribution rules',
      counts: [{ network: 'x', opens: { all: 10, d30: 3 }, inquiries: { all: { value: null, masked: true }, d30: { value: null, masked: true } } }],
    },
  };
}
