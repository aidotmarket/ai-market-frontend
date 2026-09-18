'use client';
import { useEffect, useRef, useState } from 'react';
import { readListingSource, saveListingSource, type SourceRead, type SourceContent } from '@/api/sellerListingSource';
import {readListingDraft,saveListingDraft,type ListingDraftContent,type SavedListingDraft} from '@/api/sellerListingDraft';
import type { SellerWorkspaceConnection, WorkspaceObject } from '@/api/sellerWorkspace';
import { WorkspaceData } from './WorkspaceData';

export default function SavedWorkspaceData({connections, enabled}: {connections: SellerWorkspaceConnection[]; enabled: boolean}) {
  const [source, setSource] = useState<SourceRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState(false);
  const [draftReady,setDraftReady]=useState(false);
  const [draft,setDraft]=useState<SavedListingDraft|null>(null);
  const inFlight = useRef(false);
  const version = useRef(0);
  const pending = useRef<{serialized: string; id: string; version: number} | null>(null);
  const draftVersion=useRef(0);
  const draftPending=useRef<{serialized:string;id:string;version:number}|null>(null);
  const draftInFlight=useRef(false);
  useEffect(() => {
    let current = true;
    setLoading(true); setFailed(false);
    Promise.all([readListingSource(),readListingDraft().then(value=>({ok:true as const,value})).catch(()=>({ok:false as const,value:null}))])
      .then(([result,draftResult]) => { if (current) { setSource(result); version.current = result?.version ?? 0;
        setDraft(draftResult.value);draftVersion.current=draftResult.value?.version??0;setDraftReady(draftResult.ok); } })
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
      if ((draft?.content.sample_object_indices?.length ?? 0) > 0) await saveSamples([]);
    } finally { inFlight.current = false; setSaving(false); }
  }
  async function saveSamples(indices:number[]) {
    if (!draftReady || draftInFlight.current) throw new Error('A sample selection save is already pending');
    draftInFlight.current=true;
    try {
      const base:ListingDraftContent=draft?.content ?? {brief:'',title:'',description:'',category:'',tags:'',price:'',license:''};
      const content:ListingDraftContent={...base,sample_decision:indices.length?'member_files':'none',sample_object_indices:indices};
      const serialized=JSON.stringify(content);
      if(!draftPending.current || draftPending.current.serialized!==serialized || draftPending.current.version!==draftVersion.current)
        draftPending.current={serialized,id:crypto.randomUUID(),version:draftVersion.current};
      const result=await saveListingDraft(content,draftPending.current.version,draftPending.current.id);
      draftVersion.current=result.version;draftPending.current=null;setDraft(result);
    } finally {draftInFlight.current=false;}
  }
  if (loading) return <p role="status" className="p-5 text-sm text-gray-600">Loading your saved file selection…</p>;
  if (failed) return <div role="alert" className="rounded-xl border border-red-200 p-5 text-sm text-red-800">Your saved file selection could not be loaded.<button className="ml-3 underline" onClick={() => setRetry(value => value + 1)}>Try loading again</button></div>;
  return <WorkspaceData connections={connections} enabled={enabled} savedSource={source} onSaveSelection={save} saving={saving}
    sampleFilesAvailable={draftReady} initialSampleIndices={draft?.content.sample_object_indices ?? []} onSaveSampleSelection={saveSamples} />;
}
