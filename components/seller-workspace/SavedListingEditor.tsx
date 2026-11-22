'use client';

import {useEffect,useRef,useState} from 'react';
import type {ListingDraftContent} from '@/api/sellerListingDraft';
import {authorityCode} from '@/lib/vectoraizHandoff';
import {DRAFT_SUPERSEDED_MESSAGE} from '@/lib/listing-action-error';
import SellerListingEditor, { type ListingAssistant } from '@/components/seller-workspace/SellerListingEditor';
import {useSellerListingDraft} from './SellerListingDraftStore';
import {useListingFlow} from './GuidedListingFlow';
import {listingPolishEnabled} from '@/api/listingPolish';
import {listingPolish as copy} from '@/lib/i18n/listing-polish';
import {usePendingPolishAccept} from './pendingPolishAccept';

export default function SavedListingEditor({ active, assistant }: { active: boolean; assistant?: ListingAssistant }) {
  const [replacementNotice,setReplacementNotice]=useState(false);
  const {draft,loaded,error,retry,requestLoad,saveListingFields,reload}=useSellerListingDraft();
  const flow = useListingFlow();
  const localLock = useRef(false);
  const lock = flow?.polishLock ?? localLock;
  const enabled = listingPolishEnabled();
  const pending = usePendingPolishAccept(enabled);
  const publicationReview = enabled ? flow?.polishPublication : null;
  const publication = publicationReview?.item;
  const publicationDraft = publicationReview?.successorId && draft?.draft_id === publicationReview.successorId
    ? draft : null;
  const editorIdentity=useRef({draftId:draft?.draft_id,generation:0});
  // Assigning the first ID keeps in-flight edits; replacing an existing draft starts a fresh editor.
  if(!lock.current&&!pending&&editorIdentity.current.draftId&&draft?.draft_id&&editorIdentity.current.draftId!==draft.draft_id)editorIdentity.current.generation+=1;
  editorIdentity.current.draftId=draft?.draft_id;
  useEffect(()=>{if(active)requestLoad();},[active,requestLoad]);
  if (!loaded && !lock.current && !pending && !publication) return <div className="rounded-xl border border-gray-200 bg-white p-6">
    {error ? <><p role="alert">Your saved draft could not be loaded. Try again before editing.</p><button type="button" className="mt-3 text-indigo-700 underline" onClick={retry}>Try loading draft again</button></> : <p role="status">Loading your saved draft…</p>}
  </div>;
  async function save(fields: ListingDraftContent, baseline?: number) {
    try{const version=await saveListingFields(fields,baseline);setReplacementNotice(false);return version;}
    catch(failure){if(authorityCode(failure)==='DRAFT_SUPERSEDED')setReplacementNotice(true);throw failure;}
  }
  const sharedPolish = { reload, lock, sharedBusy: flow?.polishBusy, onBusy: flow?.setPolishBusy };
  const draftEditor = <SellerListingEditor key={editorIdentity.current.generation} active={active && !publication}
    assistant={assistant} initialContent={draft?.content} savedVersion={draft?.version??0}
    listingPolish={enabled ? { ...sharedPolish, draft } : undefined} reportListingDirty={!publicationDraft} onSave={save} />;
  return <>{replacementNotice&&<p role="alert">{DRAFT_SUPERSEDED_MESSAGE}</p>}
    {enabled ? <div hidden={!!publication} inert={!!publication}>{draftEditor}</div> : draftEditor}
    {publication && <>
      <button type="button" disabled={flow?.polishBusy} className="text-sm text-indigo-700 underline"
        onClick={flow?.closePublicationPolish}>{copy.returnToDraft}</button>
      <SellerListingEditor key={publication.listing_version_id} active={active} assistant={assistant}
        initialContent={publicationDraft?.content} savedVersion={publicationDraft?.version??0} reportListingDirty={!!publicationDraft}
        listingPolish={{ ...sharedPolish, draft: publicationDraft, onPublishedDraft: flow?.setPolishSuccessor,
          publishedTitle: publication.title, published: {
            listing_id: publication.listing_id, expected_base_version_id: publication.listing_version_id,
          } }} onSave={save} />
    </>}
  </>;
}
