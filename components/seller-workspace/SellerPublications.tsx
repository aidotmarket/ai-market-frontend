'use client';
import {useEffect,useState} from 'react';
import {readPublicationPage,type PublicationPage} from '@/api/sellerListingPublication';
export default function SellerPublications({active,enabled}:{active:boolean;enabled:boolean}) {
  const [page,setPage]=useState(0);
  const [result,setResult]=useState<PublicationPage|null>(null);
  const [error,setError]=useState('');
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    if (!active || !enabled) return;
    const request=new AbortController();setResult(null);setError('');
    readPublicationPage(page,request.signal).then(value=>{if (!request.signal.aborted) setResult(value);}).catch(()=>{
      if (!request.signal.aborted) setError('Your listings could not be loaded. Try refreshing.');
    });return ()=>request.abort();
  },[active,enabled,page,retry]);
  return <section aria-label="Your Workspace listings" className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold text-gray-900">Your Workspace listings</h2>
      <p className="mt-2 text-sm text-gray-600">See what you have published from your storage. Each listing keeps its approved description and file selection.</p></div>
      <button type="button" onClick={()=>setRetry(value=>value+1)} disabled={!active || !enabled} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm disabled:opacity-50">Refresh listings</button></div>
    {!enabled ? <p className="text-sm text-gray-600">Saved Workspace listings are not available yet.</p>:error ? <p role="alert" className="text-sm text-red-800">{error}</p>:!result ? <p role="status" className="text-sm text-gray-600">Loading your listings…</p>:<>
      {result.items.length===0 && <p className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600">No Workspace listings on this page. Your saved draft stays in Prepare with Allai until you approve and publish it.</p>}
      <ul className="space-y-4">{result.items.map(item=><li key={item.id} className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold text-gray-900">{item.title}</h3><span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700">{item.status==='published' && item.is_listed?'Published':'Not listed'}</span></div>
        <p className="mt-2 text-xs text-gray-500">Published {new Date(item.published_at).toLocaleDateString('en',{year:'numeric',month:'short',day:'numeric'})}</p>
        <a href={`/listings/${encodeURIComponent(item.slug)}`} className="mt-4 inline-block text-sm font-medium text-indigo-700 underline">View listing</a>
      </li>)}</ul>
      <div className="flex gap-4"><button type="button" disabled={page===0} onClick={()=>setPage(value=>value-1)} className="text-sm text-indigo-700 disabled:opacity-50">Previous page</button><button type="button" disabled={!result.has_more || page>=500} onClick={()=>setPage(value=>value+1)} className="text-sm text-indigo-700 disabled:opacity-50">Next page</button></div>
    </>}
  </section>;
}
