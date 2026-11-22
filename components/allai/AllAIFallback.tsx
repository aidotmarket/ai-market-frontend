import Link from 'next/link';
import type { FallbackPart } from '@/lib/anonymous-allai-fallback';

export function AllAIFallback({ parts }: { parts: FallbackPart[] }) {
  return parts.map(({ text, href }, index) =>
    href ? <Link key={index} href={href} className="underline">{text}</Link> : text
  );
}

export function ListingRecoveryLinks({ search, support }: { search: string; support: string }) {
  return (
    <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
      <Link href="/search" className="underline">{search}</Link>
      <Link href="/support" className="underline">{support}</Link>
    </span>
  );
}
