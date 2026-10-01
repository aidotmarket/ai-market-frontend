'use client';
import { useEffect, useRef, useState } from 'react';
import { readListingSource, saveListingSource, type SourceRead, type SourceContent } from '@/api/sellerListingSource';
import type {SampleLimits,SellerWorkspaceConnection,WorkspaceObject} from '@/api/sellerWorkspace';
import {useListingFlow} from './GuidedListingFlow';
import { WorkspaceData } from './WorkspaceData';
import {DraftNotLoadedError,useSellerListingDraft} from './SellerListingDraftStore';
import {createStandardSelection,type LicenseSelection} from '@/api/listingLicenses';
import axios from 'axios';
import {legalIdentityFailure} from '@/api/sellerLegalIdentity';

export default function SavedWorkspaceData({connections, enabled,sampleLimits,listingLicensesEnabled=false}: {connections: SellerWorkspaceConnection[]; enabled: boolean;sampleLimits?:SampleLimits;listingLicensesEnabled?:boolean}) {
  const flow=useListingFlow();
  const [source, setSource] = useState<SourceRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState(false);
  const {draft,available,loaded,error:draftError,retry:retryDraft,requestLoad,sampleCapability,sampleIndices,selectionSavePending,saveLicenseSelection,saveSamples,beginSelectionSave,finishSelectionSave,setVisibleSampleIndices}=useSellerListingDraft();
  const [licenseSelection,setLicenseSelection]=useState<LicenseSelection>(()=>draft?.content.license_selection??createStandardSelection());
  const [licenseReady,setLicenseReady]=useState(false);
  const [licenseSaving,setLicenseSaving]=useState(false);
  const [licenseSaveMessage,setLicenseSaveMessage]=useState('');
  const licenseChanged=useRef(false);
  useEffect(()=>{if(listingLicensesEnabled)requestLoad();},[listingLicensesEnabled,requestLoad]);
  useEffect(()=>{if(loaded){if(!licenseChanged.current)setLicenseSelection(draft?.content.license_selection??createStandardSelection());setLicenseReady(true);}},[draft?.content.license_selection,loaded]);
  const inFlight = useRef(false);
  const version = useRef(0);
  const observedVersion=useRef<number|null>(null);
  const draftState=useRef({draft,loaded,sampleIndices,selectionSavePending,saveSamples});
  const pending = useRef<{serialized: string; id: string; version: number} | null>(null);
  useEffect(()=>{draftState.current={draft,loaded,sampleIndices,selectionSavePending,saveSamples};},[draft,loaded,sampleIndices,selectionSavePending,saveSamples]);
  useEffect(() => {
    if(flow){version.current=flow.source?.version??0;observedVersion.current=version.current;setLoading(false);return;}
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
  }, [retry,flow?.source]);
  async function save(connection: SellerWorkspaceConnection, objects: WorkspaceObject[]) {
    if (inFlight.current) throw new Error('A file selection save is already pending');
    const sampleState=draftState.current;
    if(flow)version.current=flow.source?.version??0;
    inFlight.current = true; setSaving(true);beginSelectionSave();let succeeded=false;
    try {
      const content: SourceContent = {connection_id:connection.id, connection_version:connection.version, version_mode:'current',
        objects: objects.map(({key, version_id, etag, size}) => ({key, version_id, etag, size}))};
      const serialized = JSON.stringify(content);
      if (!pending.current || pending.current.serialized !== serialized || pending.current.version !== version.current)
        pending.current = {serialized, id:crypto.randomUUID(), version:version.current};
      const result = await saveListingSource(content, pending.current.version, pending.current.id);
      version.current = result.version;observedVersion.current=result.version; pending.current = null; setSource(result);flow?.sourceSaved(result);
      succeeded=true;
      if (sampleCapability&&sampleState.loaded&&(sampleState.selectionSavePending||sampleState.sampleIndices.length>0||sampleState.draft?.content.sample_decision==='member_files')) {
        try { await sampleState.saveSamples([]); } catch { succeeded=false; /* Source commit remains successful; retry from the sample selector. */ }
      }
    } finally { finishSelectionSave(succeeded);inFlight.current = false; setSaving(false); }
    return succeeded;
  }
  if(flow&&!flow.sourceLoaded)return <p role="status">{flow.sourceError||'Loading your saved file selection…'}</p>;
  if (loading&&!flow) return <p role="status" className="p-5 text-sm text-gray-600">Loading your saved file selection…</p>;
  if (failed) return <div role="alert" className="rounded-xl border border-red-200 p-5 text-sm text-red-800">Your saved file selection could not be loaded.<button className="ml-3 underline" onClick={() => setRetry(value => value + 1)}>Try loading again</button></div>;
  return <WorkspaceData connections={connections} enabled={enabled} savedSource={flow?flow.source:source} onSaveSelection={save} saving={saving}
    sampleFilesAvailable={sampleCapability&&loaded} initialSampleIndices={sampleIndices} onSaveSampleSelection={saveSamples} onVisibleSampleSelectionChange={setVisibleSampleIndices} sampleLimits={sampleLimits}
    licenseSelection={listingLicensesEnabled?licenseSelection:undefined} onLicenseSelectionChange={listingLicensesEnabled?value=>{licenseChanged.current=true;setLicenseSelection(value);setLicenseSaveMessage('');}:undefined} licenseSaving={licenseSaving} licenseSaveMessage={licenseSaveMessage}
    licenseDraftAvailable={available} licenseDraftLoaded={loaded&&licenseReady} licenseDraftError={draftError} onRetryLicenseDraft={retryDraft} licenseSelectionSaved={draft?.content.license_selection}
    onSaveLicenseSelection={listingLicensesEnabled?async()=>{setLicenseSaving(true);setLicenseSaveMessage('');try{
      if(!loaded)throw new DraftNotLoadedError();
      await saveLicenseSelection(licenseSelection);
      licenseChanged.current=false;
      setLicenseSaveMessage('Licence choice saved.');
    }catch(failure){const identityFailure=legalIdentityFailure(failure);
      if(identityFailure==='required')setLicenseSaveMessage('Your legal name and country are not saved. Return to the legal details above before saving the licence choice.');
      else if(identityFailure==='conflict')setLicenseSaveMessage('Your legal details need a quick check by our support team before you can save the licence choice.');
      else if(identityFailure==='unavailable')setLicenseSaveMessage('We could not check your legal details right now. Retry before saving the licence choice.');
      else if(axios.isAxiosError(failure)&&failure.response?.status===409){retryDraft();setLicenseSaveMessage('Your draft was changed elsewhere; we reloaded it. Check your licence choice and save again.');}
      else setLicenseSaveMessage(failure instanceof DraftNotLoadedError?failure.message:'Licence choice could not be saved. Try again.');
    }finally{setLicenseSaving(false);}}:undefined} />;
}
