'use client';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { readListingReview, type ListingReview } from '@/api/sellerListingReview';

export default function SellerReview({active, enabled}: {active: boolean; enabled: boolean}) {
  const [review, setReview] = useState<ListingReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!active || !enabled) return;
    const request = new AbortController();
    setLoading(true); setError(null); setReview(null);
    readListingReview(request.signal).then(result => { if (!request.signal.aborted) setReview(result); }).catch(error => {
      if (request.signal.aborted) return;
      const code = axios.isAxiosError(error) ? error.response?.data?.detail : null;
      setError(code === 'source_required' ? 'Choose and save your files before reviewing the listing.' : code === 'draft_required' ? 'Save your listing in Prepare with Allai before reviewing it.' : code === 'source_connection_changed' ? 'Your storage connection has changed. Choose and save the current files before reviewing.' : 'Your saved listing could not be loaded. Try again.');
    }).finally(() => { if (!request.signal.aborted) setLoading(false); });
    return () => request.abort();
  }, [active, enabled, retry]);
  if (!enabled) return <p className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600">Saved listing review is not available yet. You can continue preparing your listing with Allai.</p>;
  return <section aria-label="Review saved listing" className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold text-gray-900">Review your saved listing</h2><p className="mt-2 text-sm text-gray-600">Save your file choices and listing edits before reviewing. Nothing is public yet.</p></div><button type="button" disabled={loading} onClick={() => setRetry(value => value + 1)} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm disabled:opacity-50">Refresh saved review</button></div>
    {loading && <p role="status" className="text-sm text-gray-600">Loading your saved listing and file selection…</p>}
    {error && <p role="alert" className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">{error}</p>}
    {review && <><section aria-label="Saved listing preview" className="space-y-4 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 sm:p-6"><p className="text-sm text-gray-600">This review uses your saved listing fields. Your brief, conversation and unaccepted suggestions are private.</p><iframe title="Saved listing buyers would see" sandbox="" referrerPolicy="no-referrer" srcDoc={review.rendered_html} className="h-[min(640px,75vh)] min-h-80 w-full rounded-xl border border-gray-200 bg-white" /></section>{review.missing_fields.length > 0 && <p role="status" className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">Complete and save these listing fields: {review.missing_fields.join(', ')}.</p>}<p className="text-sm text-gray-600">Public sample selection and final approval are being connected. This review does not approve or publish your listing.</p></>}
  </section>;
}
