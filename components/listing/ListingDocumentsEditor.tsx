'use client';

import axios from 'axios';
import {useEffect, useId, useRef, useState, useSyncExternalStore} from 'react';
import BackendListingHtml from '@/components/BackendListingHtml';
import {discardDocumentDraft, publishDocument, readListingDocuments, saveDocumentDraft, withdrawDocument} from '@/api/listingDocuments';
import {hashDataSheet} from '@/lib/listingDocumentPdf';
import type {DocumentDraft, DocumentKind, DocumentState, PdfMetadata, SellerDocument, SellerDocuments} from '@/types/listingDocuments';
import MarkdownTextField from './MarkdownTextField';
import {authSessionOwner, subscribeAuthSessionOwner} from '@/lib/auth-session-owner';

const DOCUMENT_LIMIT = 50_000;
const buttonClass = 'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium disabled:opacity-50';
const fieldClass = 'mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm';
const genericError = 'Documents could not be updated. Reload their current state and try again.';
const unavailable = 'Data sheets become available when public business names are switched on. Your listing must show a valid public business name.';

function errorMessage(error: unknown): string {
  const detail = axios.isAxiosError(error) ? error.response?.data?.detail : undefined;
  const code = typeof detail === 'string' ? detail : typeof detail?.code === 'string' ? detail.code : error instanceof Error ? error.message : '';
  if (code === 'FIRST_PARTY_SESSION_REQUIRED') return 'Sign in on the ai.market website to change documents. API keys and connector sessions cannot change them.';
  if (code === 'DATA_SHEET_REQUIRES_PUBLIC_NAME') return unavailable;
  if (code === 'DATA_SHEET_INVALID_URL') return 'Use a stable, public, non-expiring https address for the PDF, without contact details or a fragment.';
  if (code === 'DATA_SHEET_INVALID_FILENAME') return 'Choose a PDF with a simple filename without contact details.';
  if (typeof detail === 'string') return /^[A-Z][A-Z0-9_]*$/.test(detail) ? genericError : detail;
  if (typeof detail?.message === 'string') return detail.message;
  if (Array.isArray(detail)) return detail.map(item => item.msg).join(' ');
  return genericError;
}

export default function ListingDocumentsEditor({listingId}: {listingId?: string | null}) {
  const session = useSyncExternalStore(subscribeAuthSessionOwner, authSessionOwner, authSessionOwner);
  return <section aria-label="Documents" className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
    <h2 className="text-xl font-semibold text-gray-900">Documents</h2>
    <p className="text-sm text-gray-600">Optional technical documentation and a seller-hosted PDF. Documents have their own Publish action and never block listing publication. They appear to buyers only while your listing is public.</p>
    <p className="text-xs text-gray-500">Withdrawal removes a document from this listing. Copies already downloaded by buyers or crawlers cannot be recalled.</p>
    {listingId ? <DocumentsSession key={`${session}:${listingId}`} listingId={listingId}/> : <p className="text-sm text-gray-600">Publish your listing first, then return here or open it in Your Workspace listings to add documents.</p>}
  </section>;
}

type Action = (signal: AbortSignal) => Promise<SellerDocument>;
type Run = (action: Action, preview?: boolean) => Promise<void>;

function DocumentsSession({listingId}: {listingId: string}) {
  const [state, setState] = useState<SellerDocuments | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [invalidated, setInvalidated] = useState<Partial<Record<DocumentKind, boolean>>>({});
  const [preview, setPreview] = useState<Partial<Record<DocumentKind, number>>>({});
  const controller = useRef<AbortController | null>(null);
  const locked = useRef(false);
  useEffect(() => {
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    readListingDocuments(listingId, request.signal).then(value => {
      if (!request.signal.aborted) {setState(value); setInvalidated({});}
    }).catch(error => {
      if (!request.signal.aborted) setError(errorMessage(error));
    }).finally(() => {if (!request.signal.aborted) setBusy(false);});
    return () => request.abort();
  }, [listingId, retry]);

  const run = async (kind: DocumentKind, action: Action, showPreview = false) => {
    const signal = controller.current?.signal;
    if (!signal || signal.aborted || locked.current) return;
    locked.current = true; setBusy(true); setError(''); setPreview({});
    try {
      const result = await action(signal);
      const current = await readListingDocuments(listingId, signal);
      signal.throwIfAborted();
      setState(current);
      setInvalidated({});
      if (showPreview && current.documents[result.kind].draft?.revision === result.revision &&
          current.documents[result.kind].draft?.render_hash === result.render_hash) {
        setPreview({[result.kind]: result.revision});
      }
    } catch (error) {
      if (signal.aborted) return;
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        // Drop only the conflicting form, preserving unsaved edits in the other kind.
        setInvalidated(current => ({...current, [kind]: true}));
        try {
          const current = await readListingDocuments(listingId, signal);
          signal.throwIfAborted();
          setState(current);
          setInvalidated({});
          setError('This document changed in another window. The latest state has been loaded. Check it before continuing.');
        } catch {
          if (!signal.aborted) setError('This document changed in another window. Reload the current documents before continuing.');
        }
      } else setError(errorMessage(error));
    } finally {
      locked.current = false;
      if (!signal.aborted) setBusy(false);
    }
  };

  return <>
    {error && <p role="alert" className="text-sm text-red-800">{error} <button type="button" disabled={busy} onClick={() => {setError(''); setPreview({}); setRetry(value => value + 1);}} className="underline">Reload documents</button></p>}
    {!state ? !error && <p role="status">Loading documents…</p> : (['technical_markdown', 'data_sheet_pdf'] as const).filter(kind => !invalidated[kind]).map(kind =>
      <DocumentEditor key={`${kind}:${state.documents[kind].max_revision}:${state.documents[kind].draft?.revision}:${state.documents[kind].published?.revision}:${state.data_sheet_available}`} kind={kind} state={state.documents[kind]} listingId={listingId}
        available={kind === 'technical_markdown' || state.data_sheet_available} busy={busy} run={(action, preview) => run(kind, action, preview)}
        previewed={preview[kind] === state.documents[kind].draft?.revision}
        invalidatePreview={() => setPreview(current => ({...current, [kind]: undefined}))}/>
    )}
  </>;
}

function DocumentEditor({kind, state, listingId, available, busy, run, previewed, invalidatePreview}: {
  kind: DocumentKind; state: DocumentState; listingId: string; available: boolean; busy: boolean; run: Run;
  previewed: boolean; invalidatePreview: () => void;
}) {
  const uid = useId();
  const technical = kind === 'technical_markdown';
  const label = technical ? 'Technical documentation' : 'Data sheet';
  const initial = state.draft ?? state.published ?? state.withdrawn;
  const [editing, setEditing] = useState(!!state.draft || !state.published);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body_markdown ?? '');
  const [url, setUrl] = useState(initial?.pdf_url ?? '');
  const [pdf, setPdf] = useState<PdfMetadata | null>(initial?.pdf_sha256 && initial.pdf_filename && initial.pdf_size_bytes ? {
    pdf_sha256: initial.pdf_sha256, pdf_filename: initial.pdf_filename, pdf_size_bytes: initial.pdf_size_bytes,
  } : null);
  const [hashing, setHashing] = useState(false);
  const [fileError, setFileError] = useState('');
  const fileGeneration = useRef(0);
  useEffect(() => () => {fileGeneration.current++;}, []);
  const disabled = busy || hashing;
  const valid = title.trim().length > 0 && [...title].length <= 120 &&
    (technical ? body.trim().length > 0 && [...body].length <= DOCUMENT_LIMIT : !!pdf && url.startsWith('https://') && [...url].length <= 2048);
  const save = (preview: boolean) => {
    if (!valid || !available || disabled) return;
    const content: DocumentDraft = {expected_revision: state.max_revision, title,
      ...(technical ? {body_markdown: body} : {...pdf!, pdf_url: url})};
    void run(signal => saveDocumentDraft(listingId, kind, content, signal), preview);
  };

  return <section aria-label={label} className="space-y-3 border-t border-gray-200 pt-4">
    <h3 className="font-semibold text-gray-900">{label}</h3>
    <div role="status" className="text-sm text-gray-600">
      {state.published ? <p>{!technical && !available ? 'Published but hidden until public business names are on' : 'Published'} · revision {state.published.revision} · {state.published.published_at && new Date(state.published.published_at).toLocaleDateString()}</p> :
        <p>{state.draft ? 'Draft' : state.withdrawn ? 'Withdrawn' : 'Not added'}</p>}
      {state.draft && state.published && <p>Draft · revision {state.draft.revision} (the published revision stays live until you publish this replacement)</p>}
    </div>
    {!available && <p className="text-sm text-gray-600">{unavailable}</p>}
    {editing && available && <fieldset disabled={disabled} className="space-y-3">
      <label htmlFor={`${uid}-title`} className="block text-sm font-medium">{label} title
        <input id={`${uid}-title`} className={fieldClass} value={title} onChange={event => {setTitle(event.target.value); invalidatePreview();}}/>
      </label>
      {[...title].length > 120 && <p role="alert">Shorten the title to 120 characters to save.</p>}
      {technical ? <MarkdownTextField id={`${uid}-body`} label="Technical document" limit={DOCUMENT_LIMIT} value={body} onChange={value => {setBody(value); invalidatePreview();}}/> : <>
        <label className="block text-sm font-medium">Choose PDF (local check only)
          <input type="file" accept="application/pdf,.pdf" className={fieldClass} onChange={async event => {
            const file = event.target.files?.[0];
            const selection = ++fileGeneration.current;
            setPdf(null); setFileError(''); invalidatePreview();
            if (!file) return;
            setHashing(true);
            try {
              const metadata = await hashDataSheet(file);
              if (selection === fileGeneration.current) setPdf(metadata);
            } catch (error) {
              if (selection === fileGeneration.current) setFileError(error instanceof Error ? error.message : 'The PDF could not be read. Choose it again.');
            } finally {
              if (selection === fileGeneration.current) setHashing(false);
            }
          }}/>
        </label>
        <p className="text-xs text-gray-500">The file stays in your browser. We check its PDF header, size (up to 10 MB) and SHA-256; we never upload it.</p>
        {hashing && <p role="status">Checking PDF locally…</p>}
        {fileError && <p role="alert" className="text-sm text-red-800">{fileError}</p>}
        {pdf && <div className="break-words text-xs text-gray-600"><p>{pdf.pdf_filename} · {pdf.pdf_size_bytes.toLocaleString()} bytes</p><p>SHA-256: {pdf.pdf_sha256}</p></div>}
        <label htmlFor={`${uid}-url`} className="block text-sm font-medium">Public PDF address
          <input id={`${uid}-url`} type="url" className={fieldClass} aria-describedby={`${uid}-url-help`} value={url} onChange={event => {setUrl(event.target.value); invalidatePreview();}}/>
        </label>
        <p id={`${uid}-url-help`} className="text-xs text-gray-500">Use a stable, public, non-expiring https address for the same file.</p>
      </>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!valid} onClick={() => save(false)} className={buttonClass}>Save document draft</button>
        <button type="button" disabled={!valid} onClick={() => save(true)} className={buttonClass}>Preview exactly what buyers see</button>
      </div>
    </fieldset>}
    {previewed && state.draft && available && <div aria-label={`${label} publication preview`} className="space-y-3 rounded-lg border border-indigo-200 p-4">
      <h4 className="font-semibold">{state.draft.title}</h4>
      {technical ? <BackendListingHtml description={state.draft.body_markdown ?? ''} descriptionHtml={state.draft.body_html}/> :
        <div className="break-words text-sm"><p>{state.draft.pdf_filename} · {state.draft.pdf_size_bytes?.toLocaleString()} bytes</p><p>SHA-256: {state.draft.pdf_sha256}</p><p>{state.draft.pdf_url}</p><p>Hosted by the seller, not ai.market.</p></div>}
      <button type="button" disabled={disabled || (technical && !state.draft.body_markdown?.trim())} className={buttonClass} onClick={() => void run(signal => publishDocument(listingId, kind, state.draft!.revision, state.draft!.render_hash, signal))}>Publish {technical ? 'technical document' : 'data sheet'}</button>
    </div>}
    <div className="flex flex-wrap gap-2">
      {!editing && available && <button type="button" disabled={disabled} className={buttonClass} onClick={() => {setEditing(true); invalidatePreview();}}>Replace</button>}
      {state.draft && <button type="button" disabled={disabled} className={buttonClass} onClick={() => void run(signal => discardDocumentDraft(listingId, kind, state.draft!.revision, signal))}>Discard draft</button>}
      {state.published && <button type="button" disabled={disabled} className={buttonClass} onClick={() => void run(signal => withdrawDocument(listingId, kind, state.published!.revision, signal))}>Withdraw</button>}
    </div>
  </section>;
}
