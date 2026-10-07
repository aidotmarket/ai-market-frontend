import { Suspense } from 'react';
import PendingActionReview from './PendingActionReview';

export const dynamic = 'force-dynamic';

export default function PendingActionPage() {
  return <Suspense fallback={<main className="mx-auto max-w-xl px-6 py-16" role="status">Loading confirmation…</main>}>
    <PendingActionReview />
  </Suspense>;
}
