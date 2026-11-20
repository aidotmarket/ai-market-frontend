'use client';
import { useEffect, useRef, useState } from 'react';
import { readListingSource, saveListingSource, type SourceRead, type SourceContent } from '@/api/sellerListingSource';
import type {SampleLimits,SellerWorkspaceConnection,WorkspaceObject} from '@/api/sellerWorkspace';
import {StartAnotherListingAction,useListingFlow} from './GuidedListingFlow';
import { WorkspaceData } from './WorkspaceData';
import {DraftNotLoadedError,useSellerListingDraft} from './SellerListingDraftStore';
import {createStandardSelection,type LicenseSelection} from '@/api/listingLicenses';
import axios from 'axios';
import {authorityCode} from '@/lib/vectoraizHandoff';
import {listingDraftError} from '@/lib/listing-action-error';
import {legalIdentityFailure} from '@/api/sellerLegalIdentity';

export default function SavedWorkspaceData({connections, enabled,sampleLimits,listingLicensesEnabled=false}: {connections: SellerWorkspaceConnection[]; enabled: boolean;sampleLimits?:SampleLimits;listingLicensesEnabled?:boolean}) {
  const flow=useListingFlow();
  const [source, setSource] = useState<SourceRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [sourceDraftId,setSourceDraftId]=useState<string|null>(null);
  const [draftChanged,setDraftChanged]=useState(false);
  const [saveNotice,setSaveNotice]=useState('');
  const [reloading,setReloading]=useState(false);
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState(false);
  const {draft,available,loaded,error:draftError,reload:reloadDraft,retry:retryDraft,requestLoad,sampleCapability,sampleIndices,selectionSavePending,saveLicenseSelection,saveSamples,beginSelectionSave,finishSelectionSave,setVisibleSampleIndices}=useSellerListingDraft();
  const [licenseSelection,setLicenseSelection]=useState<LicenseSelection>(()=>draft?.content.license_selection??createStandardSelection());
  const [licenseReady,setLicenseReady]=useState(false);
  const [licenseSaving,setLicenseSaving]=useState(false);
  const [alreadyPublished,setAlreadyPublished]=useState(false);
  const [licenseSaveMessage,setLicenseSaveMessage]=useState('');
  const licenseChanged=useRef(false);
  useEffect(()=>{if(available||listingLicensesEnabled)requestLoad();},[available,listingLicensesEnabled,requestLoad]);
  useEffect(()=>{if(loaded){if(!licenseChanged.current)setLicenseSelection(draft?.content.license_selection??createStandardSelection());setLicenseReady(true);}},[draft?.content.license_selection,loaded]);
  const inFlight = useRef(false);
  const version = useRef(0);
  const currentDraftId=useRef<string|null>(null);
  const observedVersion=useRef<{draftId:string|null;version:number}|null>(null);
  const draftState=useRef({draft,loaded,sampleIndices,selectionSavePending,saveSamples});
  const pending = useRef<{serialized: string; id: string; version: number; draftId: string | null; targetId?: string} | null>(null);
  useEffect(()=>{draftState.current={draft,loaded,sampleIndices,selectionSavePending,saveSamples};},[draft,loaded,sampleIndices,selectionSavePending,saveSamples]);
  useEffect(() => {
    if(flow){currentDraftId.current=flow.sourceCurrentDraftId;version.current=flow.source?.version??0;observedVersion.current=flow.sourceLoaded?{draftId:draft?.draft_id??null,version:version.current}:null;setLoading(false);return;}
    let current = true;
    setLoading(true); setFailed(false);
    readListingSource(draft?.draft_id)
      .then(async result => { if (current) {
        const draftId=draft?.draft_id??null;
        currentDraftId.current=result.current_draft_id;setSourceDraftId(draftId);
        const nextVersion=result.source?.version??0;
        setSource(result.source);version.current=nextVersion;
        // A mismatched pointer is not a reconciliation baseline. Neither its
        // version nor the previous draft's version may clear the current samples.
        if(available&&result.current_draft_id!==draftId){observedVersion.current=null;return;}
        const previous=observedVersion.current;
        const changed=previous?.draftId===draftId&&previous.version!==nextVersion;
        observedVersion.current={draftId,version:nextVersion};
        const state=draftState.current;
        if(changed&&sampleCapability&&state.loaded&&(state.draft?.draft_id??null)===draftId){
          beginSelectionSave();let cleared=false;
          try{if(state.selectionSavePending||state.sampleIndices.length>0||state.draft?.content.sample_decision==='member_files')await state.saveSamples([]);cleared=true;}
          catch{/* The source read is valid; the durable draft owner keeps Review blocked until reconciliation. */}
          finally{finishSelectionSave(cleared);}
        }
      } })
      .catch(() => { if (current) setFailed(true); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [retry,flow?.source,flow?.sourceCurrentDraftId,flow?.sourceLoaded,draft?.draft_id]);
  const sourceDraftChanged=flow?flow.sourceDraftChanged:!loading&&available&&loaded&&sourceDraftId===(draft?.draft_id??null)&&currentDraftId.current!==(draft?.draft_id??null);
  const sourceReady=flow?flow.sourceLoaded:!loading&&sourceDraftId===(draft?.draft_id??null);
  async function reloadCurrentSource(){
    // Reload adopts the saved draft and samples; it never writes a sample decision.
    observedVersion.current=null;
    setReloading(true);setDraftChanged(true);pending.current=null;
    try{if(flow)await flow.reloadSource();else{setLoading(true);await reloadDraft();setRetry(n=>n+1);}setDraftChanged(false);}
    catch{setDraftChanged(true);}
    finally{setReloading(false);}
  }
  async function save(connection: SellerWorkspaceConnection, objects: WorkspaceObject[]) {
    if (inFlight.current) throw new Error('A file selection save is already pending');
    if(available&&!loaded)throw new DraftNotLoadedError();
    // A source GET may describe A while reporting that B is now current.
    // Never use B's pointer to admit a selection made in A's editor.
    if(available&&(!sourceReady||currentDraftId.current!==(draft?.draft_id??null))){
      setDraftChanged(true);pending.current=null;return false;
    }
    const sampleState=draftState.current;
    if(flow)version.current=flow.source?.version??0;
    inFlight.current = true; setSaving(true);beginSelectionSave();let succeeded=false;
    try {
      const content: SourceContent = {connection_id:connection.id, connection_version:connection.version, version_mode:'current',
        objects: objects.map(({key, version_id, etag, size}) => ({key, version_id, etag, size}))};
      const serialized = JSON.stringify(content);
      const observedDraftId=currentDraftId.current;
      // An uncertain retry must retain its entire request, even if a read has
      // since learned the draft created by the original null save.
      if (!pending.current || pending.current.serialized !== serialized)
        pending.current = {serialized, id:crypto.randomUUID(), version:version.current, draftId:observedDraftId, targetId:draft?.authority_version_id?draft.draft_id??undefined:undefined};
      // Bind every save, including an observed empty draft. Only imported drafts
      // need the explicit native target and its lineage authorization.
      const result = await saveListingSource(content, pending.current.version, pending.current.id, pending.current.draftId, pending.current.targetId);
      currentDraftId.current=result.current_draft_id;version.current = result.source.version;
      const savedDraftId=sampleState.draft?.draft_id??null;
      observedVersion.current=result.current_draft_id===savedDraftId?{draftId:savedDraftId,version:result.source.version}:null;
      pending.current = null; setSaveNotice('');setSource(result.source);flow?.sourceSaved(result);
      succeeded=true;
      if (sampleCapability&&sampleState.loaded&&(!available||result.current_draft_id===(sampleState.draft?.draft_id??null))&&(sampleState.selectionSavePending||sampleState.sampleIndices.length>0||sampleState.draft?.content.sample_decision==='member_files')) {
        try { await sampleState.saveSamples([]); } catch { succeeded=false; /* Source commit remains successful; retry from the sample selector. */ }
      }
      if(available&&loaded){try{await reloadDraft();}catch{retryDraft();}}
    } catch(failure) {
      if(authorityCode(failure)==='DRAFT_SUPERSEDED'){const message=listingDraftError(failure)?.message??'Your draft was replaced. Check the current draft before choosing files again.';if(flow)flow.sourceSaveRefused?.(message);else setSaveNotice(message);pending.current=null;try{await reloadDraft();}catch{retryDraft();}}
      throw failure;
    } finally { finishSelectionSave(succeeded);inFlight.current = false; setSaving(false); }
    return succeeded;
  }

  const draftBlocked=available&&!loaded;
  if(sourceDraftChanged||draftChanged)return <div role="alert" className="text-sm text-red-800">Your listing draft changed. Reload the current draft before saving your files again. <button type="button" disabled={reloading} className="underline" onClick={()=>void reloadCurrentSource()}>Reload current draft</button></div>;
  if(flow&&!flow.sourceLoaded&&!(draftBlocked&&draftError))return <p role="status">{flow.sourceError||'Loading your saved file selection…'}</p>;
  if (failed) return <div role="alert" className="rounded-xl border border-red-200 p-5 text-sm text-red-800">Your saved file selection could not be loaded.<button className="ml-3 underline" onClick={() => setRetry(value => value + 1)}>Try loading again</button></div>;
  if (!sourceReady&&!flow) return <>{saveNotice&&<p role="alert">{saveNotice}</p>}<p role="status" className="p-5 text-sm text-gray-600">Loading your saved file selection…</p></>;
  return <>{saveNotice&&<p role="alert" className="text-sm text-red-800">{saveNotice}</p>}{draftBlocked&&(<div role={draftError?'alert':'status'}>{draftError?'Your saved draft could not be loaded. Retry before saving files.':'Loading your saved draft…'}{draftError&&<button type="button" onClick={retryDraft}>Try loading draft again</button>}</div>)}{(licenseReady||!draftBlocked)&&<fieldset hidden={draftBlocked} disabled={draftBlocked} className="min-w-0 border-0 p-0"><WorkspaceData key={draft?.draft_id??'empty'} connections={connections} enabled={enabled} savedSource={flow?flow.source:source} onSaveSelection={save} saving={saving}
    sampleFilesAvailable={sampleCapability&&loaded} initialSampleIndices={sampleIndices} onSaveSampleSelection={saveSamples} onVisibleSampleSelectionChange={setVisibleSampleIndices} sampleLimits={sampleLimits}
    licenseSelection={listingLicensesEnabled?licenseSelection:undefined} onLicenseSelectionChange={listingLicensesEnabled?value=>{licenseChanged.current=true;setLicenseSelection(value);setLicenseSaveMessage('');}:undefined} licenseSaving={licenseSaving} licenseSaveMessage={licenseSaveMessage}
    licenseDraftAvailable={available} licenseDraftLoaded={loaded&&licenseReady} licenseDraftError={draftError} onRetryLicenseDraft={retryDraft} licenseSelectionSaved={draft?.content.license_selection}
    onSaveLicenseSelection={listingLicensesEnabled?async()=>{setLicenseSaving(true);setLicenseSaveMessage('');try{
      if(!loaded)throw new DraftNotLoadedError();
      await saveLicenseSelection(licenseSelection);
      licenseChanged.current=false;
      setLicenseSaveMessage('Licence choice saved.');
    }catch(failure){const draftFailure=listingDraftError(failure);setAlreadyPublished(draftFailure?.alreadyPublished??false);const identityFailure=legalIdentityFailure(failure);
      if(draftFailure)setLicenseSaveMessage(draftFailure.message);
      else if(identityFailure==='required')setLicenseSaveMessage('Your legal name and country are not saved. Return to the legal details above before saving the licence choice.');
      else if(identityFailure==='conflict')setLicenseSaveMessage('Your legal details need a quick check by our support team before you can save the licence choice.');
      else if(identityFailure==='unavailable')setLicenseSaveMessage('We could not check your legal details right now. Retry before saving the licence choice.');
      else if(axios.isAxiosError(failure)&&failure.response?.status===409){retryDraft();setLicenseSaveMessage('Your draft was changed elsewhere; we reloaded it. Check your licence choice and save again.');}
      else setLicenseSaveMessage(failure instanceof DraftNotLoadedError?failure.message:'Licence choice could not be saved. Try again.');
    }finally{setLicenseSaving(false);}}:undefined} /></fieldset>}{alreadyPublished&&<StartAnotherListingAction/>}</>;
}
