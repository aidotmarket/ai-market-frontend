'use client';

import { useEffect, useRef, useState } from 'react';
import { prepareWorkspacePurchase } from '@/api/sellerWorkspaceDownload';
import { getOrder } from '@/api/orders';
import type { BuyerOrderDetail } from '@/types';

export default function WorkspacePurchaseRecovery({orderId,onReady}:{orderId:string;onReady:(order:BuyerOrderDetail)=>void}) {
  const controller=useRef<AbortController | null>(null);
  const [pending,setPending]=useState(false);
  const [error,setError]=useState('');
  useEffect(() => () => {controller.current?.abort();}, [orderId]);
  async function check() {
    if (controller.current && !controller.current.signal.aborted) return;
    const current=new AbortController();controller.current=current;
    setPending(true);setError('');
    try {
      await prepareWorkspacePurchase(orderId,current.signal);
      current.signal.throwIfAborted();
      const refreshed=await getOrder(orderId);
      current.signal.throwIfAborted();
      if (refreshed.id!==orderId || !refreshed.workspace_delivery || !['delivered','completed','fulfilled'].includes(String(refreshed.status))) throw new Error('Not ready');
      onReady(refreshed);
    } catch {
      if (!current.signal.aborted) setError('Your files are not ready yet. You can check again here.');
    } finally {
      if (!current.signal.aborted && controller.current===current) setPending(false);
      current.abort();
    }
  }
  return <section className="rounded-lg border border-indigo-200 bg-indigo-50 p-6">
    <h2 className="font-semibold">Preparing your file access</h2>
    <p className="mt-2 text-sm">Check whether your purchased files are ready. This does not use a download allowance.</p>
    <button type="button" disabled={pending} onClick={check} className="mt-4 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{pending?'Checking access…':'Check file access'}</button>
    {error && <p role="alert" className="mt-3 text-sm">{error}</p>}
  </section>;
}
