'use client';
import { useEffect, useRef, useState } from 'react';
import { readListingSource, saveListingSource, type SourceRead, type SourceContent } from '@/api/sellerListingSource';
import type {SampleLimits,SellerWorkspaceConnection,WorkspaceObject} from '@/api/sellerWorkspace';
import { WorkspaceData } from './WorkspaceData';
import {useSellerListingDraft} from './SellerListingDraftStore';
import {createStandardSelection,isCompleteLicenseSelection,type LicenseSelection} from '@/api/listingLicenses';

export default function SavedWorkspaceData({connections, enabled,sampleLimits,listingLicensesEnabled=false}: {connections: SellerWorkspaceConnection[]; enabled: boolean;sampleLimits?:SampleLimits;listingLicensesEnabled?:boolean}) {
  const [source, setSource] = useState<SourceRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState(false);
  const {draft,loaded,sampleCapability,sampleIndices,selectionSavePending,saveFields,saveSamples,beginSelectionSave,finishSelectionSave,setVisibleSampleIndices}=useSellerListingDraft();
  const [licenseSelection,setLicenseSelection]=useState<LicenseSelection>(()=>draft?.content.license_selection??createStandardSelection());
  const [licenseSaving,setLicenseSaving]=useState(false);
  const [licenseSaveMessage,setLicenseSaveMessage]=useState('');
  useEffect(()=>{if(draft?.content.license_selection)setLicenseSelection(draft.content.license_selection);},[draft?.content.license_selection]);
  const inFlight = useRef(false);
  const version = useRef(0);
  const observedVersion=useRef<number|null>(null);
  const draftState=useRef({draft,loaded,sampleIndices,selectionSavePending,saveSamples});
  const pending = useRef<{serialized: string; id: string; version: number} | null>(null);
  useEffect(()=>{draftState.current={draft,loaded,sampleIndices,selectionSavePending,saveSamples};},[draft,loaded,sampleIndices,selectionSavePending,saveSamples]);
  useEffect(() => {
    let current = true;
    setLoading(true); setFailed(false);
    readListingSource()
      .then(async result => { if (current) {
        const nextVersion=result?.version??0;const changed=observedVersion.current!==null&&observedVersion.current!==nextVersion;
        observedVersion.current=nextVersion;setSource(result);version.current=nextVersion;
        if(changed&&sampleCapability){
          const state=draftState.current;beginSelectionSave();let cleared=false;
          try{if(state.loaded&&(state.selectionSavePending||state.sampleIndices.length>0||state.draft?.content.sample_decision==='member_files'))await state.saveSamples([]);cleared=true;}
          catch{/* The source read is valid; the durable draft owner keeps Review blocked until reconciliation. */}
          finally{finishSelectionSave(cleared);}
        }
      } })
      .catch(() => { if (current) setFailed(true); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [retry]);
  async function save(connection: SellerWorkspaceConnection, objects: WorkspaceObject[]) {
    if (inFlight.current) throw new Error('A file selection save is already pending');
    const sampleState=draftState.current;
    inFlight.current = true; setSaving(true);beginSelectionSave();let succeeded=false;
    try {
      const content: SourceContent = {connection_id:connection.id, connection_version:connection.version, version_mode:'current',
        objects: objects.map(({key, version_id, etag, size}) => ({key, version_id, etag, size}))};
      const serialized = JSON.stringify(content);
      if (!pending.current || pending.current.serialized !== serialized || pending.current.version !== version.current)
        pending.current = {serialized, id:crypto.randomUUID(), version:version.current};
      const result = await saveListingSource(content, pending.current.version, pending.current.id);
      version.current = result.version;observedVersion.current=result.version; pending.current = null; setSource(result);
      succeeded=true;
      if (sampleCapability&&sampleState.loaded&&(sampleState.selectionSavePending||sampleState.sampleIndices.length>0||sampleState.draft?.content.sample_decision==='member_files')) {
        try { await sampleState.saveSamples([]); } catch { succeeded=false; /* Source commit remains successful; retry from the sample selector. */ }
      }
    } finally { finishSelectionSave(succeeded);inFlight.current = false; setSaving(false); }
  }
  if (loading) return <p role="status" className="p-5 text-sm text-gray-600">Loading your saved file selection…</p>;
  if (failed) return <div role="alert" className="rounded-xl border border-red-200 p-5 text-sm text-red-800">Your saved file selection could not be loaded.<button className="ml-3 underline" onClick={() => setRetry(value => value + 1)}>Try loading again</button></div>;
  return <WorkspaceData connections={connections} enabled={enabled} savedSource={source} onSaveSelection={save} saving={saving}
    sampleFilesAvailable={sampleCapability&&loaded} initialSampleIndices={sampleIndices} onSaveSampleSelection={saveSamples} onVisibleSampleSelectionChange={setVisibleSampleIndices} sampleLimits={sampleLimits}
    licenseSelection={listingLicensesEnabled?licenseSelection:undefined} onLicenseSelectionChange={listingLicensesEnabled?value=>{setLicenseSelection(value);setLicenseSaveMessage('');}:undefined} licenseSaving={licenseSaving} licenseSaveMessage={licenseSaveMessage}
    onSaveLicenseSelection={listingLicensesEnabled?async()=>{setLicenseSaving(true);setLicenseSaveMessage('');try{
      const {license_selection: _previousSelection,...fields}=draft?.content??{brief:'',title:'',description:'',category:'',tags:'',price:'',license:''};
      const complete=isCompleteLicenseSelection(licenseSelection);
      await saveFields({...fields,...(complete?{license_selection:licenseSelection}:{})});
      setLicenseSaveMessage(complete?'Licence choice saved.':'Draft saved without a licence choice. Complete the signer and covenant confirmation to save it.');
    }catch{setLicenseSaveMessage('Licence choice could not be saved. Try again.');}finally{setLicenseSaving(false);}}:undefined} />;
}
