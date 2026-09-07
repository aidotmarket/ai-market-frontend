'use client';

import { useEffect, useRef, useState } from 'react';
import SellerListingEditor, { type ListingAssistant } from '@/components/seller-workspace/SellerListingEditor';
import { readListingDraft, saveListingDraft, type ListingDraftContent, type SavedListingDraft } from '@/api/sellerListingDraft';

export default function SavedListingEditor({ active, assistant }: { active: boolean; assistant?: ListingAssistant }) {
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState<SavedListingDraft | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const version = useRef(0);
  const pending = useRef<{ content: string; id: string; version: number } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    readListingDraft(controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      version.current = result?.version ?? 0;
      setDraft(result); setLoaded(true);
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [retry]);
  async function save(content: ListingDraftContent) {
    const serialized = JSON.stringify(content);
    if (!pending.current || pending.current.content !== serialized || pending.current.version !== version.current) {
      pending.current = { content: serialized, version: version.current, id: crypto.randomUUID() };
    }
    const result = await saveListingDraft(content, version.current, pending.current.id);
    version.current = result.version;
    pending.current = null;
  }
  if (!loaded) return <div className="rounded-xl border border-gray-200 bg-white p-6">
    {error ? <><p role="alert">Your saved draft could not be loaded. Try again before editing.</p><button type="button" className="mt-3 text-indigo-700 underline" onClick={() => setRetry((value) => value + 1)}>Try loading draft again</button></> : <p role="status">Loading your saved draft…</p>}
  </div>;
  return <SellerListingEditor active={active} assistant={assistant} initialContent={draft?.content} onSave={save} />;
}
