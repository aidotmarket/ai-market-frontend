'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getPendingAction, type PendingAction } from '@/api/pending-actions';
import { PENDING_ACTION_CONTINUATION } from '@/lib/redirect';
import { isSellerBatchSummary } from '@/lib/seller-batch';
import { useAuthStore } from '@/store/auth';
import { useSessionGeneration } from '@/hooks/useSessionGeneration';
import SellerOperationReceipt from '@/components/SellerOperationReceipt';

// The existing private pending continuation is the only native results read
// exposed by Chunk 3. Do not treat global connector enablement as seller enablement.
export default function SellerOperationContinuation() {
  const { user, token } = useAuthStore();
  const generation = useSessionGeneration(token);
  const identity = `${user?.id}:${generation}`;
  const [saved, setSaved] = useState<{ identity: string; data: PendingAction; path: string } | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    if (!user || window.location.hash !== '#seller-operation') return;
    const path = new URLSearchParams(window.location.search).get('redirect') || '';
    const match = PENDING_ACTION_CONTINUATION.exec(path);
    if (!match) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const read = async () => {
      try {
        const data = await getPendingAction(match[1], match[2]);
        if (!active) return;
        if (!isSellerBatchSummary(data.summary) || !data.result?.operation_id) { setSaved(null); return; }
        setSaved({ identity, data, path }); setUnavailable(false);
        if (['queued', 'running'].includes(String(data.result.execution_status))) timer = setTimeout(read, 5000);
      } catch { if (active) setUnavailable(true); }
    };
    void read();
    return () => { active = false; clearTimeout(timer); };
  }, [user, identity]);
  if (!saved || saved.identity !== identity) return null;
  return <section id="seller-operation" aria-label="Seller operation in settings" className="mt-6 space-y-4">
    <SellerOperationReceipt result={saved.data.result} />
    {unavailable && <p role="alert">Unable to refresh this receipt. Reload to check current counts.</p>}
    <Link href={saved.path} prefetch={false} rel="noreferrer">Return to complete batch review</Link>
    <p>For individual receipts, ask your connected assistant to call get_activity with this operation ID and the returned signed cursor for each next page.</p>
    <p>To retry failed members, request a new explicit batch of failed targets only, with fresh revisions and a new key and review. Exclude successful, unchanged, blocked and cancelled members. Never automatically split a submission over 50 members.</p>
  </section>;
}
