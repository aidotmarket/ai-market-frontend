'use client';

import {useEffect} from 'react';
import SellerListingEditor, { type ListingAssistant } from '@/components/seller-workspace/SellerListingEditor';
import {useSellerListingDraft} from './SellerListingDraftStore';

export default function SavedListingEditor({ active, assistant }: { active: boolean; assistant?: ListingAssistant }) {
  const {draft,loaded,error,retry,requestLoad,saveFields}=useSellerListingDraft();
  useEffect(()=>{if(active)requestLoad();},[active,requestLoad]);
  if (!loaded) return <div className="rounded-xl border border-gray-200 bg-white p-6">
    {error ? <><p role="alert">Your saved draft could not be loaded. Try again before editing.</p><button type="button" className="mt-3 text-indigo-700 underline" onClick={retry}>Try loading draft again</button></> : <p role="status">Loading your saved draft…</p>}
  </div>;
  return <SellerListingEditor active={active} assistant={assistant} initialContent={draft?.content} onSave={saveFields} />;
}
