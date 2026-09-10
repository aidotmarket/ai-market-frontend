'use client';
import { useEffect, useRef, useState } from 'react';
import { readListingSource, saveListingSource, type SourceRead, type SourceContent } from '@/api/sellerListingSource';
import type { SellerWorkspaceConnection, WorkspaceObject } from '@/api/sellerWorkspace';
import { WorkspaceData } from './WorkspaceData';

export default function SavedWorkspaceData({connections, enabled}: {connections: SellerWorkspaceConnection[]; enabled: boolean}) {
  const [source, setSource] = useState<SourceRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const version = useRef(0);
  const pending = useRef<{serialized: string; id: string; version: number} | null>(null);
  useEffect(() => {
    let current = true;
    setLoading(true); setFailed(false);
    readListingSource().then(result => { if (current) { setSource(result); version.current = result?.version ?? 0; } })
      .catch(() => { if (current) setFailed(true); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [retry]);
  async function save(connection: SellerWorkspaceConnection, objects: WorkspaceObject[]) {
    if (inFlight.current) throw new Error('A file selection save is already pending');
    inFlight.current = true; setSaving(true);
    try {
      const content: SourceContent = {connection_id:connection.id, connection_version:connection.version, version_mode:'current',
        objects: objects.map(({key, version_id, etag, size}) => ({key, version_id, etag, size}))};
      const serialized = JSON.stringify(content);
      if (!pending.current || pending.current.serialized !== serialized || pending.current.version !== version.current)
        pending.current = {serialized, id:crypto.randomUUID(), version:version.current};
      const result = await saveListingSource(content, pending.current.version, pending.current.id);
      version.current = result.version; pending.current = null; setSource(result);
    } finally { inFlight.current = false; setSaving(false); }
  }
  if (loading) return <p role="status" className="p-5 text-sm text-gray-600">Loading your saved file selection…</p>;
  if (failed) return <div role="alert" className="rounded-xl border border-red-200 p-5 text-sm text-red-800">Your saved file selection could not be loaded.<button className="ml-3 underline" onClick={() => setRetry(value => value + 1)}>Try loading again</button></div>;
  return <WorkspaceData connections={connections} enabled={enabled} savedSource={source} onSaveSelection={save} saving={saving} />;
}
