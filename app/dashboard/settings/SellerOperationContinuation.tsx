'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getPendingAction, type PendingAction } from '@/api/pending-actions';
import { PENDING_ACTION_CONTINUATION } from '@/lib/redirect';
import { isSellerBatchSummary } from '@/lib/seller-batch';
import { useAuthStore } from '@/store/auth';
import { useSessionGeneration } from '@/hooks/useSessionGeneration';
import SellerOperationActivity from '@/components/SellerOperationActivity';
import { useSearchParams, usePathname } from 'next/navigation';
import SellerOperationReceipt from '@/components/SellerOperationReceipt';

export default function SellerOperationContinuation() {
  const pathname = usePathname();
  const query = useSearchParams();
  const [hash, setHash] = useState('');
  useEffect(() => {
    const changed = () => setHash(window.location.hash);
    changed(); window.addEventListener('hashchange', changed); window.addEventListener('popstate', changed);
    return () => { window.removeEventListener('hashchange', changed); window.removeEventListener('popstate', changed); };
  }, []);
  const path = query.get('redirect') || '';
  const { user, token } = useAuthStore();
  const generation = useSessionGeneration(token);
  const identity = `${user?.id}:${generation}:${pathname}:${path}:${hash}`;
  const [saved, setSaved] = useState<{ identity: string; data: PendingAction; path: string } | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    setSaved(null); setUnavailable(false);
    if (!user || pathname !== '/dashboard/settings' || hash !== '#seller-operation') return;
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
      } catch { if (active) { setUnavailable(true); timer = setTimeout(read, 5000); } }
    };
    void read();
    return () => { active = false; clearTimeout(timer); };
  }, [user, identity, pathname, path, hash]);
  if (!saved || saved.identity !== identity) return unavailable ? <p role="alert">Unable to refresh this receipt. Retrying…</p> : null;
  return <section id="seller-operation" aria-label="Seller operation in settings" className="mt-6 space-y-4">
    <SellerOperationReceipt result={saved.data.result} />
    {unavailable && <p role="alert">Unable to refresh this receipt. Retrying…</p>}
    <Link href={saved.path} prefetch={false} rel="noreferrer">Return to complete batch review</Link>
    <SellerOperationActivity key={identity} operationId={String(saved.data.result!.operation_id)} pendingId={saved.data.id} token={PENDING_ACTION_CONTINUATION.exec(saved.path)![2]} />
  </section>;
}
