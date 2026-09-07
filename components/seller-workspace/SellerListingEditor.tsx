'use client';

import { useEffect, useRef, useState } from 'react';

const fields = [
  ['title', 'Title'], ['description', 'Description'], ['category', 'Category'], ['tags', 'Tags'],
] as const;
type DraftField = typeof fields[number][0];
type Draft = Record<DraftField, string>;
interface FieldProposalEvent { field: string; value: string; reasoning: string }
export type ListingAssistant = (request: {
  brief: string; draft: Draft; reviewing: DraftField; instruction: string;
}, signal: AbortSignal) => Promise<{ message: string; proposals: FieldProposalEvent[] }>;
const emptyDraft: Draft = { title: '', description: '', category: '', tags: '' };
const limits: Record<DraftField, number> = { title: 255, description: 10000, category: 200, tags: 1000 };
const fieldClass = 'mt-2 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#3F51B5] focus:outline-none focus:ring-1 focus:ring-[#3F51B5]';
const buttonClass = 'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50';

export default function SellerListingEditor({ assistant, active = true }: { assistant?: ListingAssistant; active?: boolean }) {
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [activeField, setActiveField] = useState<DraftField>('title');
  const [brief, setBrief] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [proposals, setProposals] = useState<Partial<Record<DraftField, FieldProposalEvent>>>({});
  const [reviewed, setReviewed] = useState<DraftField[]>([]);
  const [price, setPrice] = useState('');
  const [license, setLicense] = useState('');
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

  const update = (field: DraftField, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setReviewed((current) => current.filter((item) => item !== field));
  };
  const ask = async (instruction: string) => {
    if (!active || !assistant || isStreaming || requesting.current) return;
    requesting.current = true;
    setRequested(true); setError(null); setIsStreaming(true);
    setMessages((current) => [...current, { role: 'user', content: instruction }]);
    const requestController = new AbortController();
    controller.current = requestController;
    try {
      const result = await assistant({ brief, draft: { ...draft }, reviewing: activeField, instruction }, requestController.signal);
      if (!mounted.current || requestController.signal.aborted) return;
      if (typeof result.message !== 'string' || result.message.length > 12000 || !Array.isArray(result.proposals)) throw new Error('Invalid assistant response');
      setMessages((current) => [...current, { role: 'assistant', content: result.message }]);
      for (const proposal of result.proposals.slice(0, 4)) {
        if (!proposal || !fields.some(([field]) => field === proposal.field)) continue;
        const field = proposal.field as DraftField;
        if (typeof proposal.value !== 'string' || !proposal.value.trim() || proposal.value.length > limits[field]) continue;
        setProposals((current) => ({ ...current, [field]: { ...proposal, reasoning: typeof proposal.reasoning === 'string' ? proposal.reasoning.slice(0, 2000) : '' } }));
      }
    } catch { if (mounted.current && !requestController.signal.aborted) setError('Allai could not respond. Your draft is still here; try again.'); }
    finally { if (controller.current === requestController) { requesting.current = false; if (mounted.current) setIsStreaming(false); } }
  };
  const accept = (field: DraftField) => {
    const proposal = proposals[field];
    if (!proposal) return;
    update(field, proposal.value);
    setProposals((current) => { const next = { ...current }; delete next[field]; return next; });
  };
  const label = fields.find(([field]) => field === activeField)![1];

  return (
    <section className="space-y-5" aria-labelledby="listing-editor-title">
      <div><h2 id="listing-editor-title" className="text-xl font-semibold text-gray-900">Prepare your listing with Allai</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">Let Allai do the writing and suggest metadata tags. Review her suggestions, ask for changes, and decide what buyers will see.</p></div>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5 rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
          <div className="rounded-lg bg-indigo-50 p-4"><label htmlFor="seller-listing-brief" className="text-sm font-semibold text-indigo-950">Give Allai a starting point</label><p className="mt-1 text-xs leading-5 text-indigo-900">Tell her what the data covers and who it helps. Share information you want her to use for the listing.</p><textarea id="seller-listing-brief" rows={3} maxLength={4000} value={brief} onChange={(event) => setBrief(event.target.value)} className={fieldClass} placeholder="For example: weekly retail sales by region, covering 2024–2026…" /><button type="button" disabled={!assistant || isStreaming || !brief.trim()} onClick={() => ask('Draft my listing title, description, category and tags.')} className="mt-3 rounded-lg bg-[#3F51B5] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{isStreaming ? 'Allai is working…' : 'Ask Allai to draft my listing'}</button></div>
          <nav aria-label="Listing fields" className="flex flex-wrap gap-2">{fields.map(([field, fieldLabel]) => <button key={field} type="button" onClick={() => setActiveField(field)} aria-current={activeField === field ? 'step' : undefined} className={`${buttonClass} ${activeField === field ? 'border-indigo-300 bg-indigo-50 text-indigo-800' : ''}`}>{fieldLabel}{reviewed.includes(field) ? ' ✓' : ''}</button>)}</nav>
          {Object.keys(proposals).length > 0 && <button type="button" onClick={() => fields.forEach(([field]) => accept(field))} className={buttonClass}>Use all Allai suggestions</button>}
          {fields.map(([field, fieldLabel]) => <div key={field} className={`rounded-lg border p-4 ${activeField === field ? 'border-indigo-200 bg-indigo-50/30' : 'border-gray-100'}`}>
            <label htmlFor={`seller-listing-${field}`} className="text-sm font-semibold text-gray-900">{fieldLabel}</label>
            {field === 'description' ? <textarea id={`seller-listing-${field}`} rows={6} maxLength={limits[field]} value={draft[field]} onFocus={() => setActiveField(field)} onChange={(event) => update(field, event.target.value)} className={fieldClass} /> : <input id={`seller-listing-${field}`} maxLength={limits[field]} value={draft[field]} onFocus={() => setActiveField(field)} onChange={(event) => update(field, event.target.value)} className={fieldClass} />}
            {field === 'tags' && <p className="mt-2 text-xs text-gray-500">Separate tags with commas.</p>}
            {proposals[field] && <div className="mt-3 rounded-lg border border-indigo-200 bg-white p-3"><p className="text-xs font-semibold text-indigo-800">Allai suggests</p><p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-800">{proposals[field]!.value}</p>{proposals[field]!.reasoning && <p className="mt-2 text-xs text-gray-500">{proposals[field]!.reasoning}</p>}<div className="mt-3 flex gap-2"><button type="button" onClick={() => accept(field)} className={buttonClass}>Use suggestion</button><button type="button" onClick={() => setProposals((current) => { const next = { ...current }; delete next[field]; return next; })} className={buttonClass}>Keep mine</button></div></div>}
          </div>)}
          <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold text-gray-900">Your price (USD)<input type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} className={fieldClass} /></label><label className="text-sm font-semibold text-gray-900">Your license<input value={license} onChange={(event) => setLicense(event.target.value)} maxLength={500} className={fieldClass} /></label></div>
          <p className="text-xs leading-5 text-gray-500">Your edits stay here when you switch Workspace sections. They are not saved to your account yet and will be lost if you reload or leave the Workspace. Public-sample approval and publishing are not connected yet.</p>
        </div>
        <aside className="space-y-4 lg:sticky lg:top-5" aria-label="Allai listing assistant">
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4"><p className="font-semibold text-indigo-950">Review {label.toLowerCase()} with Allai</p><p className="mt-2 text-sm text-indigo-900">Ask her to change the wording, refine the tags, or explain a suggestion.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={!draft[activeField].trim()} onClick={() => { setReviewed((current) => [...new Set([...current, activeField])]); const index = fields.findIndex(([field]) => field === activeField); setActiveField(fields[Math.min(index + 1, fields.length - 1)][0]); }} className={buttonClass}>Looks good</button><button type="button" disabled={!assistant || isStreaming || !brief.trim()} onClick={() => ask(`Help me improve the ${label.toLowerCase()}. Ask what I would like changed if needed.`)} className={buttonClass}>Change it with Allai</button></div></div>
          <div className="overflow-hidden rounded-xl bg-[#18234B] text-white"><div className="border-b border-white/10 px-4 py-4"><h3 className="font-semibold">Allai</h3><p className="mt-1 text-xs text-indigo-200">Your listing assistant</p></div><div className="max-h-[480px] space-y-4 overflow-y-auto p-4" aria-live="polite">{!requested && <p className="text-sm leading-6 text-indigo-100">Tell me about your offering. I can draft the description and tags, then work through each field with you.</p>}{messages.map((item, index) => <p key={index} className={`whitespace-pre-wrap break-words rounded-lg p-3 text-sm leading-6 ${item.role === "user" ? "bg-indigo-500/30" : "border border-white/15"}`}>{item.content}</p>)}{isStreaming && <p role="status" className="text-sm text-indigo-200">Allai is preparing suggestions…</p>}{!assistant && <p className="text-sm leading-6 text-indigo-200">Allai listing assistance is not connected yet. You can edit the draft here while this is being completed.</p>}</div><form onSubmit={(event) => { event.preventDefault(); const text = message.trim(); if (text) { setMessage(''); void ask(text); } }} className="border-t border-white/10 p-4"><label htmlFor="seller-allai-message" className="sr-only">Message Allai about your listing</label><textarea id="seller-allai-message" rows={3} maxLength={4000} value={message} onChange={(event) => setMessage(event.target.value)} className="w-full rounded-lg border border-white/20 bg-white/5 p-3 text-sm text-white placeholder:text-indigo-200" placeholder="Make the description more concise…" /><button type="submit" disabled={!assistant || isStreaming || !message.trim()} className="mt-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-[#18234B] disabled:opacity-50">Send to Allai</button></form></div>
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        </aside>
      </div>
    </section>
  );
}
