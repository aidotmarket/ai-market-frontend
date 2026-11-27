import { vi } from 'vitest';

const { default: Link } = await vi.importActual<typeof import('next/link')>('next/link');

export default function ListingLinkPrefetchMock(props: React.ComponentProps<typeof Link>) {
  const isListing = typeof props.href === 'string' && props.href.startsWith('/listings/');
  return <Link {...props} data-prefetch={isListing ? String(props.prefetch) : undefined} />;
}
