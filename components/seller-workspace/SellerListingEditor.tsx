'use client';

import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import type { ListingDraftContent } from '@/api/sellerListingDraft';
import {useListingFlow} from './GuidedListingFlow';
import {admissiblePrice,PRICE_REASON} from './listingSteps';
import type {SellerCategory} from '@/api/sellerListingSource';
import ListingPreview from './ListingPreview';

const fields = [
  ['title', 'Title'], ['description', 'Description'], ['category', 'Category'], ['tags', 'Tags'],
] as const;
type DraftField = typeof fields[number][0];
type Draft = Record<DraftField, string>;
interface FieldProposalEvent { field: string; value: string; reasoning: string }
export type ListingAssistant = (request: {
  brief: string; draft: Draft; reviewing: DraftField; instruction: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
}, signal: AbortSignal) => Promise<{ source_version?: number | null; message: string; proposals: FieldProposalEvent[] }>;
const emptyDraft: Draft = { title: '', description: '', category: '', tags: '' };
const limits: Record<DraftField, number> = { title: 255, description: 10000, category: 200, tags: 1000 };
const fieldClass = 'mt-2 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#3F51B5] focus:outline-none focus:ring-1 focus:ring-[#3F51B5]';
const buttonClass = 'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50';

export default function SellerListingEditor({ assistant, active = true, initialContent, onSave, sourceVersion: providedSourceVersion, categories: providedCategories, licensesEnabled: providedLicensesEnabled = false, onNext }: { sourceVersion?: number | null; categories?: SellerCategory[]; licensesEnabled?: boolean; onNext?:()=>void; assistant?: ListingAssistant; active?: boolean; initialContent?: ListingDraftContent; onSave?: (content: ListingDraftContent) => Promise<void> }) {
  const flow=useListingFlow();
  const sourceVersion=flow?flow.source?.version??null:providedSourceVersion;
  const currentRevision=useRef(flow?.fileRevision);currentRevision.current=flow?.fileRevision;
  const currentSource=useRef(sourceVersion);currentSource.current=sourceVersion;
  const categories=providedCategories??flow?.categories??[];
  const licensesEnabled=flow?.licensesEnabled??providedLicensesEnabled;
  const licenseSelection=initialContent?.license_selection;
  const [descriptionSourceVersion,setDescriptionSourceVersion]=useState(initialContent?.description_source_version??null);
  const [proposalSourceVersion,setProposalSourceVersion]=useState<number|null>(null);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const completedHistory = useRef<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [draft, setDraft] = useState<Draft>(initialContent ? { title: initialContent.title, description: initialContent.description, category: initialContent.category, tags: initialContent.tags } : emptyDraft);
  const [activeField, setActiveField] = useState<DraftField>('title');
  const [brief, setBrief] = useState(initialContent?.brief ?? '');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [proposals, setProposals] = useState<Partial<Record<DraftField, FieldProposalEvent>>>({});
  const [reviewed, setReviewed] = useState<DraftField[]>([]);
  const [price, setPrice] = useState(initialContent?.price ?? '');
  const priceInvalid = price !== '' && !admissiblePrice(price);
  const [license, setLicense] = useState(initialContent?.license ?? '');
  const [previewOpen, setPreviewOpen] = useState(false);
  const snapshot = JSON.stringify({ brief, ...draft, price, license, description_source_version:descriptionSourceVersion });
  const [savedSnapshot, setSavedSnapshot] = useState(snapshot);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const save = async () => {
    if (!onSave || savingRef.current || priceInvalid) return false;
    if(snapshot===savedSnapshot)return true;
    savingRef.current = true; setSaving(true); setSaveError(null);
    const submitted = snapshot;
    try {
      await onSave(JSON.parse(submitted));
      if (mounted.current) setSavedSnapshot(submitted);
      return true;
    } catch (error) {
      const detail=axios.isAxiosError(error)?error.response?.data?.detail:null;
      if (mounted.current) setSaveError(typeof detail==='string'?detail:typeof detail?.message==='string'?detail.message:axios.isAxiosError(error) && error.response?.status === 409
        ? 'This draft was saved elsewhere. Your edits are still here. Copy any changes you want to keep, then reload the Workspace to open the saved version.'
        : 'Saving could not be confirmed. Your edits are still here. Try saving again.');
    } finally { savingRef.current = false; if (mounted.current) setSaving(false); }
  };
  const flowRef=useRef(flow);flowRef.current=flow;
  useEffect(()=>{flowRef.current?.setListingDirty(snapshot!==savedSnapshot);},[snapshot,savedSnapshot]);
  const requesting = useRef(false);
  const [requested, setRequested] = useState(false);
  const mounted = useRef(true);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!active) {
      controller.current?.abort();
      requesting.current = false;
      setIsStreaming(false);
    }
  }, [active]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; controller.current?.abort(); };
  }, []);

  useEffect(()=>{
    setProposals({});setMessages([]);completedHistory.current=[];setRequested(false);setProposalSourceVersion(null);
    // Keep the request alive so a late reply can be discarded with the source-change explanation.
  },[sourceVersion,flow?.fileRevision]);
  const update = (field: DraftField, value: string) => {
    if(field==='description')setDescriptionSourceVersion(null);
    setDraft((current) => ({ ...current, [field]: value }));
    setReviewed((current) => current.filter((item) => item !== field));
  };
  const ask = async (instruction: string) => {
    if (!active || !assistant || isStreaming || requesting.current) return;
    requesting.current = true;
    setRequested(true); setError(null); setIsStreaming(true);
    setMessages((current) => [...current, { role: 'user', content: instruction }]);
    const requestRevision=currentRevision.current;
    const requestController = new AbortController();
    controller.current = requestController;
    try {
      const result = await assistant({ brief, draft: { ...draft }, reviewing: activeField, instruction,
        history: completedHistory.current.slice(-6).map((item) => ({ role: item.role, content: item.content.slice(0, 4000) })),
      }, requestController.signal);
      if (!mounted.current || requestController.signal.aborted) return;
      if(currentSource.current!==undefined && (result.source_version!==currentSource.current || sourceVersion!==currentSource.current || requestRevision!==currentRevision.current)){
        setProposals({});setError('Your files changed while Allai was drafting. Ask again.');return;
      }
      setProposalSourceVersion(result.source_version??null);
      if (typeof result.message !== 'string' || result.message.length > 12000 || !Array.isArray(result.proposals)) throw new Error('Invalid assistant response');
      completedHistory.current = [...completedHistory.current.slice(-4), { role: 'user', content: instruction }, { role: 'assistant', content: result.message }];
      setMessages((current) => [...current, { role: 'assistant', content: result.message }]);
      for (const proposal of result.proposals.slice(0, 4)) {
        if (!proposal || !fields.some(([field]) => field === proposal.field)) continue;
        const field = proposal.field as DraftField;
        if (typeof proposal.value !== 'string' || !proposal.value.trim() || proposal.value.length > limits[field]) continue;
        setProposals((current) => ({ ...current, [field]: { ...proposal, reasoning: typeof proposal.reasoning === 'string' ? proposal.reasoning.slice(0, 2000) : '' } }));
      }
    } catch (error) { if (mounted.current && !requestController.signal.aborted) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      setError(status === 402 && axios.isAxiosError(error) && error.response?.data?.detail === 'starter_credits_unavailable' ? 'Starter credits are not available for this account. Your draft is still here and you can continue editing.' : status === 402 ? 'There are not enough starter credits for this request. Your draft is still here and you can continue editing.' : status === 409 || status === 429 ? 'Allai is already working or receiving too many requests. Your draft is still here; try again shortly.' : 'Allai could not respond. Your draft is still here; try again.');
    } }
    finally { if (controller.current === requestController) { requesting.current = false; if (mounted.current) setIsStreaming(false); } }
  };
  const accept = (field: DraftField) => {
    const proposal = proposals[field];
    if (!proposal) return;
    if(sourceVersion!==undefined && proposalSourceVersion!==sourceVersion){setProposals({});setError('Your files changed while Allai was drafting. Ask again.');return;}
    if(field==='category'&&!categories.some(c=>c.slug===proposal.value)){setError('Choose a category from the list.');return;}
    update(field, proposal.value);
    if(field==='description' && typeof sourceVersion==='number' && proposalSourceVersion===sourceVersion)setDescriptionSourceVersion(sourceVersion);
    setProposals((current) => { const next = { ...current }; delete next[field]; return next; });
  };
  const label = fields.find(([field]) => field === activeField)![1];

  return (
    <section className="space-y-5" aria-labelledby="listing-editor-title">
      <div><h2 id="listing-editor-title" className="text-xl font-semibold text-gray-900">Describe and price</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">Allai, our assistant, can draft this for you from your files. Review her suggestions, ask for changes, and decide what buyers will see.</p></div>
      {assistant && <p className="text-sm text-gray-600">Allai requests use your existing starter credits. Editing and saving your draft do not use credits.</p>}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5 rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
          <div className="rounded-lg bg-indigo-50 p-4"><label htmlFor="seller-listing-brief" className="text-sm font-semibold text-indigo-950">Give Allai a starting point</label><p className="mt-1 text-xs leading-5 text-indigo-900">Tell her what the data covers and who it helps. Share information you want her to use for the listing.</p><textarea id="seller-listing-brief" rows={3} maxLength={4000} value={brief} onChange={(event) => setBrief(event.target.value)} className={fieldClass} placeholder="For example: weekly retail sales by region, covering 2024–2026…" /><p className="mt-3 text-xs text-indigo-900">Allai reads your file names and sizes to write the draft. It never opens your files.</p><button type="button" disabled={!assistant || isStreaming || !brief.trim()} onClick={() => ask('Draft my listing title, description, category and tags.')} className="mt-3 rounded-lg bg-[#3F51B5] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{isStreaming ? 'Allai is working…' : 'Ask Allai to draft my listing'}</button>{assistant&&!brief.trim()&&<p className="mt-2 text-xs text-indigo-900">Describe your data above to ask Allai for a draft.</p>}</div>
          <nav aria-label="Listing fields" className="flex flex-wrap gap-2">{fields.map(([field, fieldLabel]) => <button key={field} type="button" onClick={() => setActiveField(field)} aria-current={activeField === field ? 'step' : undefined} className={`${buttonClass} ${activeField === field ? 'border-indigo-300 bg-indigo-50 text-indigo-800' : ''}`}>{fieldLabel}{reviewed.includes(field) ? ' ✓' : ''}</button>)}</nav>
          {Object.keys(proposals).length > 0 && <button type="button" onClick={() => fields.forEach(([field]) => accept(field))} className={buttonClass}>Use all Allai suggestions</button>}
          {fields.map(([field, fieldLabel]) => <div key={field} className={`rounded-lg border p-4 ${activeField === field ? 'border-indigo-200 bg-indigo-50/30' : 'border-gray-100'}`}>
            <label htmlFor={`seller-listing-${field}`} className="text-sm font-semibold text-gray-900">{fieldLabel}</label>
            {field === 'category' ? <select id={`seller-listing-${field}`} value={categories.some(c=>c.slug===draft.category)?draft.category:''} onFocus={()=>setActiveField(field)} onChange={event=>update(field,event.target.value)} className={fieldClass}><option value="">Choose a category from the list</option>{categories.map(c=><option key={c.slug} value={c.slug}>{c.name}</option>)}</select> : field === 'description' ? <textarea id={`seller-listing-${field}`} rows={6} maxLength={limits[field]} value={draft[field]} onFocus={() => setActiveField(field)} onChange={(event) => update(field, event.target.value)} className={fieldClass} /> : <input id={`seller-listing-${field}`} maxLength={limits[field]} value={draft[field]} onFocus={() => setActiveField(field)} onChange={(event) => update(field, event.target.value)} className={fieldClass} />}
            {field === 'description' && <p className="mt-2 text-xs text-gray-500">Anything you keep here, including file names, will be public.</p>}
            {field === 'tags' && <p className="mt-2 text-xs text-gray-500">Separate tags with commas.</p>}
            {proposals[field] && <div className="mt-3 rounded-lg border border-indigo-200 bg-white p-3"><p className="text-xs font-semibold text-indigo-800">Allai suggests</p><p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-800">{proposals[field]!.value}</p>{proposals[field]!.reasoning && <p className="mt-2 text-xs text-gray-500">{proposals[field]!.reasoning}</p>}<div className="mt-3 flex gap-2"><button type="button" onClick={() => accept(field)} className={buttonClass}>Use suggestion</button><button type="button" onClick={() => setProposals((current) => { const next = { ...current }; delete next[field]; return next; })} className={buttonClass}>Keep mine</button></div></div>}
          </div>)}
          <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold text-gray-900">Your price (USD)<input type="number" min="0" max="999999.99" step="0.01" aria-invalid={priceInvalid} aria-describedby={priceInvalid ? "seller-price-error" : undefined} value={price} onChange={(event) => setPrice(event.target.value)} className={fieldClass} /></label>{!licensesEnabled&&<label className="text-sm font-semibold text-gray-900">Your license<input value={license} onChange={(event) => setLicense(event.target.value)} maxLength={500} className={fieldClass} /></label>}</div>
          {priceInvalid && <p id="seller-price-error" role="alert" className="text-sm text-red-800">Enter $0 for a free listing or $25 to $999,999.99 for a paid listing, with no more than two decimal places.</p>}
          {onSave ? <div className="space-y-3">{snapshot!==savedSnapshot&&<button type="button" disabled={saving || priceInvalid || snapshot === savedSnapshot} onClick={()=>void save()} className={buttonClass}>{saving ? 'Saving draft…' : 'Save private draft'}</button>}<p role="status" className="text-sm text-gray-600">{snapshot === savedSnapshot ? 'Draft saved to your account.' : 'You have unsaved changes.'} Saving does not publish your listing.</p>{saveError && <p role="alert" className="text-sm text-red-800">{saveError}</p>}<p className="text-xs text-gray-500">Saves your listing fields, brief, price and license. Chat and unaccepted suggestions stay in this Workspace only. Save your file choices separately in Choose your files.</p></div> : <p className="text-xs leading-5 text-gray-500">Your edits stay here when you switch Workspace sections. They are not saved to your account yet and will be lost if you reload or leave the Workspace. Save your draft and file choices before reviewing and publishing.</p>}
        </div>
        <aside className="space-y-4 lg:sticky lg:top-5" aria-label="Allai listing assistant">
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4"><p className="font-semibold text-indigo-950">Review {label.toLowerCase()} with Allai</p><p className="mt-2 text-sm text-indigo-900">Ask her to change the wording, refine the tags, or explain a suggestion.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={!draft[activeField].trim()} onClick={() => { setReviewed((current) => [...new Set([...current, activeField])]); const index = fields.findIndex(([field]) => field === activeField); setActiveField(fields[Math.min(index + 1, fields.length - 1)][0]); }} className={buttonClass}>Looks good</button><button type="button" disabled={!assistant || isStreaming || !brief.trim()} onClick={() => ask(`Help me improve the ${label.toLowerCase()}. Ask what I would like changed if needed.`)} className={buttonClass}>Change it with Allai</button></div>{!draft[activeField].trim()&&<p className="mt-2 text-xs text-indigo-900">Add or accept {label.toLowerCase()} text before marking it reviewed.</p>}</div>
          <p className="text-sm text-gray-600">See Allai’s suggested changes in the boxes on the left, under each field.</p><div className="overflow-hidden rounded-xl bg-[#18234B] text-white"><div className="border-b border-white/10 px-4 py-4"><h3 className="font-semibold">Allai</h3><p className="mt-1 text-xs text-indigo-200">Your listing assistant</p></div><div className="max-h-[480px] space-y-4 overflow-y-auto p-4" aria-live="polite">{!requested && <p className="text-sm leading-6 text-indigo-100">Tell me about your offering. I can draft the description and tags, then work through each field with you.</p>}{messages.map((item, index) => <p key={index} className={`whitespace-pre-wrap break-words rounded-lg p-3 text-sm leading-6 ${item.role === "user" ? "bg-indigo-500/30" : "border border-white/15"}`}>{item.content}</p>)}{isStreaming && <p role="status" className="text-sm text-indigo-200">Allai is preparing suggestions…</p>}{!assistant && <p className="text-sm leading-6 text-indigo-200">Allai listing assistance is not connected yet. You can edit the draft here while this is being completed.</p>}</div><form onSubmit={(event) => { event.preventDefault(); const text = message.trim(); if (text) { setMessage(''); void ask(text); } }} className="border-t border-white/10 p-4"><label htmlFor="seller-allai-message" className="sr-only">Message Allai about your listing</label><textarea id="seller-allai-message" rows={3} maxLength={4000} value={message} onChange={(event) => setMessage(event.target.value)} className="w-full rounded-lg border border-white/20 bg-white/5 p-3 text-sm text-white placeholder:text-indigo-200" placeholder="Make the description more concise…" /><button type="submit" disabled={!assistant || isStreaming || !message.trim()} className="mt-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-[#18234B] disabled:opacity-50">Send to Allai</button></form></div>
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        </aside>
      </div>
      {sourceVersion!==undefined && (sourceVersion===null || descriptionSourceVersion!==sourceVersion) && <div role="status" className="space-y-3 rounded-lg bg-amber-50 p-4 text-sm text-amber-900"><p>Your files changed after this description was written</p><div className="flex flex-wrap gap-3"><button type="button" disabled={!assistant||isStreaming||!brief.trim()||sourceVersion===null} onClick={()=>void ask('Update my description to match my current saved files.')} className={buttonClass}>Ask Allai to update it</button><button type="button" disabled={sourceVersion===null||!draft.description.trim()} onClick={()=>setDescriptionSourceVersion(sourceVersion??null)} className={buttonClass}>This description matches my files</button></div>{sourceVersion===null?<p>Choose and save your files before confirming this description.</p>:!draft.description.trim()?<p>Add a description before confirming it.</p>:!assistant?<p>Allai is unavailable. Edit the description and confirm it matches your files.</p>:!brief.trim()?<p>Add a brief above before asking Allai to update it.</p>:null}</div>}
      {onSave&&(flow||onNext)&&<><button type="button" disabled={saving||priceInvalid} onClick={async()=>{if(!await save())return; if(flow){const missing=flow.stepsForContent(JSON.parse(snapshot)).slice(0,4).find(s=>s.state!=='done'&&s.state!=='skipped');if(missing){setSaveError(missing.reason);return;} flow.navigate('review');}else onNext?.();}} className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white">Next: Review →</button>{priceInvalid&&<p className="text-sm text-amber-900">{PRICE_REASON}</p>}</>}
      <button type="button" aria-expanded={previewOpen} aria-controls="seller-listing-preview" onClick={() => setPreviewOpen(current => !current)} className={buttonClass}>{previewOpen ? 'Hide listing preview' : 'Preview my listing'}</button>
      {previewOpen && <div id="seller-listing-preview"><ListingPreview draft={{ ...draft, price, license:licensesEnabled?(licenseSelection?`${licenseSelection.kind==='standard'?'ai.market Standard Data Licence v1.0':"Seller's own licence"} · AI/ML training ${licenseSelection.ai_training?'allowed':'not allowed'}`:'Choose a licence'):license }} /></div>}
    </section>
  );
}
