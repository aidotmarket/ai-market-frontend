'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {getPurchasedLicenseDisplay,type PurchasedLicenseDisplay as Display} from '@/api/purchasedLicenseDisplay';
import ApprovedListingPreview from '@/components/ApprovedListingPreview';
import {authSessionIdentity,useAuthStore} from '@/store/auth';

export default function PurchasedLicenseDisplay({orderId,listingId}:{orderId:string;listingId:string}) {
  const session=useAuthStore(authSessionIdentity);
  return <PurchasedDisplayVisit key={JSON.stringify([session,orderId,listingId])} orderId={orderId} listingId={listingId}/>;
}
function PurchasedDisplayVisit({orderId,listingId}:{orderId:string;listingId:string}) {
  const [display,setDisplay]=useState<Display|null>(null);
  const [error,setError]=useState(false);
  useEffect(()=>{
    const request=new AbortController();
    getPurchasedLicenseDisplay(orderId,listingId,request.signal).then(value=>{if(!request.signal.aborted)setDisplay(value);})
      .catch(()=>{if(!request.signal.aborted)setError(true);});
    return ()=>request.abort();
  },[orderId,listingId]);
  if(error)return <p role="status">Purchased licence display is unavailable. Your original licence record and purchase access remain available separately.</p>;
  if(!display)return <p role="status">Loading purchased licence evidence…</p>;
  const original=display.original_license;
  const originalLabel=typeof original==='string'?original:original&&typeof original==='object'&&'code' in original&&'version' in original
    ? `${String(original.code)} ${String(original.version)}`:'No original licence label retained';
  return <section aria-label="Purchased licence display" className="space-y-3 rounded-lg border border-gray-200 p-6">
    <h2 className="font-semibold">Purchased licence and original evidence</h2>
    {display.instrument_display ? <><p>{display.instrument_display.license_label??`${display.instrument_display.license_code} ${display.instrument_display.license_version}`}</p><p>{display.instrument_display.notice}</p></>:<p>No purchased instrument display is available.</p>}
    <p>Original accepted snapshot licence: {originalLabel}</p>
    <p className="break-all text-xs">Original snapshot digest: {display.original_snapshot_hash}</p>
    {display.license_record_url&&<Link href={`/dashboard/orders/${encodeURIComponent(orderId)}/license-record`} className="text-indigo-700 underline">Original licence record</Link>}
    {display.retained_presentation&&<><p>{display.retained_presentation.notice}</p><ApprovedListingPreview title="Original seller evidence for purchased version" html={display.retained_presentation.presentation.rendered_html}/></>}
    {!display.retained_presentation&&<p>Original seller presentation is {display.retained_presentation_status??'not retained'}.</p>}
    <Link href={`/listings/${encodeURIComponent(listingId)}`} className="block text-indigo-700 underline">Current public display (may differ from this purchase)</Link>
  </section>;
}
