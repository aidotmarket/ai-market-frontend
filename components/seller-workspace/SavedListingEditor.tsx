'use client';

import {useEffect,useRef,useState} from 'react';
import {authorityCode} from '@/lib/vectoraizHandoff';
import {DRAFT_SUPERSEDED_MESSAGE} from '@/lib/listing-action-error';
import SellerListingEditor, { type ListingAssistant } from '@/components/seller-workspace/SellerListingEditor';
import {useSellerListingDraft} from './SellerListingDraftStore';

export default function SavedListingEditor({ active, assistant }: { active: boolean; assistant?: ListingAssistant }) {
  const [replacementNotice,setReplacementNotice]=useState(false);
  const {draft,loaded,error,retry,requestLoad,saveListingFields}=useSellerListingDraft();
  const editorIdentity=useRef({draftId:draft?.draft_id,generation:0});
  // Assigning the first ID keeps in-flight edits; replacing an existing draft starts a fresh editor.
  if(editorIdentity.current.draftId&&draft?.draft_id&&editorIdentity.current.draftId!==draft.draft_id)editorIdentity.current.generation+=1;
  editorIdentity.current.draftId=draft?.draft_id;
  useEffect(()=>{if(active)requestLoad();},[active,requestLoad]);
  if (!loaded) return <div className="rounded-xl border border-gray-200 bg-white p-6">
    {error ? <><p role="alert">Your saved draft could not be loaded. Try again before editing.</p><button type="button" className="mt-3 text-indigo-700 underline" onClick={retry}>Try loading draft again</button></> : <p role="status">Loading your saved draft…</p>}
  </div>;
  return <>{replacementNotice&&<p role="alert">{DRAFT_SUPERSEDED_MESSAGE}</p>}
    <SellerListingEditor key={editorIdentity.current.generation} active={active} assistant={assistant} initialContent={draft?.content} savedVersion={draft?.version??0} onSave={async(fields,baseline)=>{
      try{const version=await saveListingFields(fields,baseline);setReplacementNotice(false);return version;}
      catch(failure){if(authorityCode(failure)==='DRAFT_SUPERSEDED')setReplacementNotice(true);throw failure;}
    }} /></>;
}
