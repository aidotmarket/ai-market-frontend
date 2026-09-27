'use client';

import {useEffect,useRef,useState} from 'react';
import {
  LICENSE_HASHES, createStandardSelection, submitCustomLicenseText, licenseDocumentPath,
  type LicenseSelection,
} from '@/api/listingLicenses';
import {MAX_CUSTOM_LICENSE_CODEPOINTS,canonicalizeCustomText} from '@/lib/customLicenseVerification';
import {getSellerLegalIdentity,refreshSellerLegalIdentity,saveSellerLegalIdentity,legalIdentityFailure,LEGAL_IDENTITY_SUPPORT_PATH,type SellerLegalIdentity} from '@/api/sellerLegalIdentity';
import {SELLER_COUNTRIES} from '@/api/sellerLegalIdentityCountries';

export type IdentityState = {kind:'checking'|'conflict'|'unavailable'} | {kind:'known'|'required';value:SellerLegalIdentity};

export const STANDARD_SELLER_SUMMARY = `Not the contract — read the full licence before choosing it.
You remain the owner and licensor of the delivered dataset version.
The buyer may use it internally and commercialise models, outputs and derived work that do not expose or reconstruct the raw data.
The buyer may not redistribute or resell the dataset itself, and AI/ML training follows your displayed switch.
You promise that you have the rights, sourced the data lawfully, stated the listing facts accurately and included no regulated personal or special-category data.
A material mismatch reported within seven days is remedied by fix or refund; liability is capped as the full licence states.
ai.market is not a party and gives no legal advice; New York law governs.`;

export const CUSTOM_NOTICE = "The seller's own terms. ai.market did not write these; review them before you accept. The separate ai.market AI-Training Rider and Marketplace Listing Covenant also form part of your record. ai.market is not a party and gives no legal advice.";

export default function SellerLicenseSelection({value, onChange, disabled = false,onIdentityStateChange,legalIdentityEnabled=false}: {
  value: LicenseSelection; onChange: (value: LicenseSelection) => void; disabled?: boolean;
  onIdentityStateChange?:(state:IdentityState)=>void;legalIdentityEnabled?:boolean;
}) {
  const [legalState,setLegalState]=useState<IdentityState>({kind:'checking'});
  const [legalName,setLegalName]=useState('');
  const [country,setCountry]=useState('');
  const [editingLegal,setEditingLegal]=useState(false);
  const [savingLegal,setSavingLegal]=useState(false);
  const [legalError,setLegalError]=useState('');
  const current=useRef({value,onChange,onIdentityStateChange});
  current.current={value,onChange,onIdentityStateChange};
  const mounted=useRef(true);
  const setIdentityState=(state:IdentityState)=>{if(mounted.current){setLegalState(state);current.current.onIdentityStateChange?.(state);}};
  const applyIdentity=(result:SellerLegalIdentity)=>{
    setIdentityState({kind:result.status,value:result});
    setLegalName(result.legal_name??'');setCountry(result.jurisdiction??'');setEditingLegal(false);
    const selection=current.current.value;
    const version=result.status==='known'?result.version:undefined;
    if(selection.identity_version!==version)
      current.current.onChange({...selection,identity_version:version,seller_acceptance:{...selection.seller_acceptance,authority_confirmed:false}});
  };
  async function checkIdentity(){
    setIdentityState({kind:'checking'});setLegalError('');
    try {
      let refreshFailed:unknown;
      try {await refreshSellerLegalIdentity();} catch(error){refreshFailed=error;}
      // GET is authoritative even when refresh failed: a stored row remains usable during a Stripe outage.
      const result=await getSellerLegalIdentity();
      if(refreshFailed && result.status!=='known') throw refreshFailed;
      applyIdentity(result);
      if(refreshFailed) setLegalError('We could not refresh your Stripe details right now. Your saved legal details are still available.');
    } catch(error){
      const kind=legalIdentityFailure(error);
      setIdentityState({kind:kind==='conflict'?'conflict':'unavailable'});
    }
  }
  useEffect(()=>{mounted.current=true;if(legalIdentityEnabled)void checkIdentity();return()=>{mounted.current=false;};},[legalIdentityEnabled]);
  async function saveLegal(){
    if(legalState.kind!=='required'&&legalState.kind!=='known')return;
    if(!legalName.trim()||!country||legalName.trim().length>255)return;
    setSavingLegal(true);setLegalError('');
    try {
      await saveSellerLegalIdentity(legalName.trim(),country,legalState.value.version);
      applyIdentity(await getSellerLegalIdentity());
    } catch(error){
      const kind=legalIdentityFailure(error);
      if(kind==='conflict')setIdentityState({kind:'conflict'});
      else if(kind==='unavailable')setIdentityState({kind:'unavailable'});
      else {
        const detail=(error as {response?:{data?:{detail?:{message?:unknown}}}})?.response?.data?.detail;
        const reason=typeof detail?.message==='string'&&detail.message.length<=200?detail.message:null;
        setLegalError(reason??(kind==='required'?'Your legal name and country are not saved. Check them and try again.':'Your legal details could not be changed. They may already be used in a licence acceptance. Contact support if they need correction.'));
      }
    } finally {setSavingLegal(false);}
  }
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [licenseOpened, setLicenseOpened] = useState(false);
  const [covenantOpened, setCovenantOpened] = useState(false);
  const [lockedHint,setLockedHint]=useState(false);
  const [customPreview,setCustomPreview]=useState<{id:string;title:string;text:string}|null>(null);
  const verifiedTitles = useRef(new Map<string, string>());
  const submissionVersion = useRef(0);
  const identity = value.seller_acceptance;
  const updateIdentity = (field: 'signer_name' | 'signer_title' | 'authority_confirmed', next: string | boolean) =>
    onChange({...value, seller_acceptance: {...identity, [field]: next}});
  const invalidateCustom = (changes: Partial<LicenseSelection> = {}) => {
    submissionVersion.current += 1;
    setLicenseOpened(false);
    setCustomPreview(null);
    setSubmitError('');
    onChange({...value, ...changes, license_document_id: null, license_sha256: '',
      seller_acceptance: {...identity, authority_confirmed: false}});
  };
  const chooseKind = (kind: LicenseSelection['kind']) => {
    submissionVersion.current += 1;
    setLicenseOpened(false);
    setCustomPreview(null);
    setSubmitError('');
    const invalidatedIdentity={...identity,authority_confirmed:false};
    if (kind === 'standard') onChange({...createStandardSelection(value.ai_training), seller_acceptance: invalidatedIdentity});
    else onChange({...value, kind: 'custom', version: '1.0', license_document_id: null, license_sha256: '',
      rider_sha256: LICENSE_HASHES.rider[String(value.ai_training) as 'true' | 'false'],seller_acceptance:invalidatedIdentity});
  };
  const setAiTraining = (aiTraining: boolean) => {
    if (value.kind === 'standard') onChange({...value, ai_training: aiTraining,
      license_sha256: LICENSE_HASHES.standard[String(aiTraining) as 'true' | 'false'],seller_acceptance:{...identity,authority_confirmed:false}});
    else invalidateCustom({ai_training: aiTraining, rider_sha256: LICENSE_HASHES.rider[String(aiTraining) as 'true' | 'false']});
    setLicenseOpened(false);
  };
  async function submit() {
    const version = ++submissionVersion.current;
    setSubmitting(true); setSubmitError(''); setLicenseOpened(false); setCustomPreview(null);
    const submittedTitle = title;
    const submittedText = text;
    const submittedTraining = value.ai_training;
    try {
      const result = await submitCustomLicenseText(submittedTitle, submittedText, submittedTraining);
      if (version !== submissionVersion.current) return;
      setCustomPreview({id:result.id,title:result.title,text:result.text});
      verifiedTitles.current.set(JSON.stringify([result.text, submittedTraining]), result.title);
      onChange({...value, kind: 'custom', version: '1.0', license_document_id: result.id,
        license_sha256: result.license_sha256, rider_sha256: LICENSE_HASHES.rider[String(value.ai_training) as 'true' | 'false'],
        covenant_sha256: LICENSE_HASHES.covenant, seller_acceptance: {...identity, authority_confirmed: false}});
    } catch (error) {
      if (version !== submissionVersion.current) return;
      const code = (error as {response?: {data?: {detail?: {code?: string}}}})?.response?.data?.detail?.code ??
        (error instanceof Error ? error.message : undefined);
      const storedTitle = verifiedTitles.current.get(JSON.stringify([canonicalizeCustomText(submittedText), submittedTraining]));
      const messages: Record<string,string> = {
        LICENSE_SIZE_INVALID: 'Enter nonempty terms of at most 65,536 Unicode characters.',
        LICENSE_DOCUMENT_INVALID: `The licence was refused. Check the title and characters.${storedTitle && storedTitle !== submittedTitle.trim() ? ` A previously verified submission used title “${storedTitle}” for the same terms and training choice.` : ''}`,
        LICENSE_LANGUAGE_NOT_ENGLISH: 'Use English terms with at least 200 letters.',
        LICENSE_SECRET_DETECTED: 'Remove secrets or credentials from the terms.',
        LICENSE_PROHIBITED_TERMS: 'Remove terms that conflict with marketplace rules.',
        LICENSE_TEXT_INVALID_UTF8: 'The licence text is not valid UTF-8.',
      };
      setSubmitError(messages[code ?? ''] ?? 'The custom licence could not be submitted or verified. Please try again.');
    } finally { if (version === submissionVersion.current) setSubmitting(false); }
  }
  const knownLegal=legalState.kind==='known'&&legalState.value.status==='known'?legalState.value:null;
  const known=!legalIdentityEnabled||knownLegal!==null;
  const legalChanged=legalState.kind==='required'||Boolean(knownLegal&&(legalName.trim()!==knownLegal.legal_name||country!==knownLegal.jurisdiction));
  return <div className="space-y-4">
    {legalIdentityEnabled&&<section aria-label="Legal details for the licence" className="space-y-3 rounded-xl border border-gray-200 bg-white p-5">
      {legalState.kind==='checking'&&<p role="status">Checking your legal details…</p>}
      {knownLegal&&<><p>Legal name on the licence: {knownLegal.legal_name} ({knownLegal.jurisdiction})</p><p className="text-sm text-gray-600">{knownLegal.source==='stripe_connect'?'from your Stripe account':'saved by you'}</p></>}
      {knownLegal?.source==='seller_typed'&&!editingLegal&&<button type="button" className="text-sm text-indigo-700 underline" onClick={()=>setEditingLegal(true)}>Edit legal details</button>}
      {(legalState.kind==='required'||knownLegal&&editingLegal)&&<div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">Legal name<input aria-label="Legal name" value={legalName} maxLength={255} onChange={event=>setLegalName(event.target.value)} className="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
        <label className="text-sm font-medium">Country<select aria-label="Country" value={country} onChange={event=>setCountry(event.target.value)} className="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2"><option value="">Choose a country</option>{SELLER_COUNTRIES.map(item=><option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
        <div className="sm:col-span-2"><button type="button" disabled={savingLegal||disabled||!legalChanged||!legalName.trim()||!country} onClick={()=>void saveLegal()} className="rounded-lg bg-indigo-700 px-4 py-2 text-sm text-white disabled:opacity-50">{savingLegal?'Saving legal details…':'Save legal details'}</button></div>
      </div>}
      {legalState.kind==='required'&&<p role="status" className="text-sm text-amber-900">Your legal name and country are not saved. Save them before saving the licence choice or publishing.</p>}
      {legalState.kind==='conflict'&&<p role="alert">Your legal details need a quick check by our support team before you can publish. <a className="underline" href={LEGAL_IDENTITY_SUPPORT_PATH}>Contact support</a></p>}
      {legalState.kind==='unavailable'&&<p role="alert">We could not check your legal details right now. <button type="button" className="underline" onClick={()=>void checkIdentity()}>Retry</button></p>}
      {legalError&&<p role="alert" className="text-sm text-red-800">{legalError}</p>}
    </section>}
  <fieldset disabled={disabled || submitting || !known} className="space-y-5 rounded-xl border border-gray-200 bg-white p-5">
    <legend className="px-1 text-lg font-semibold text-gray-900">How can buyers use this data?</legend>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className={`rounded-xl border p-4 ${value.kind === 'standard' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'}`}>
        <span className="flex items-center gap-2 font-semibold"><input type="radio" name="listing-license-kind" checked={value.kind === 'standard'} onChange={() => chooseKind('standard')} />Standard <span className="text-xs font-medium text-indigo-700">Recommended</span><a href={licenseDocumentPath('standard',value.ai_training)} target="_blank" rel="noreferrer" onClick={event=>{event.stopPropagation();if(value.kind==='standard')setLicenseOpened(true);}} className="text-xs text-indigo-700 underline">Read licence</a></span>
        <span className="mt-2 block text-sm text-gray-600">Balanced ai.market terms. Buyers may not redistribute or resell the dataset.</span>
      </label>
      <label className={`rounded-xl border p-4 ${value.kind === 'custom' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'}`}>
        <span className="flex items-center gap-2 font-semibold"><input type="radio" name="listing-license-kind" checked={value.kind === 'custom'} onChange={() => chooseKind('custom')} />My own licence</span>
        <span className="mt-2 block text-sm text-gray-600">Type or paste your own English licence terms.</span>
      </label>
    </div>
    <label className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 p-4 text-sm font-medium text-gray-900">
      <span>Allow AI/ML training <span className="block text-xs font-normal text-gray-500">{value.ai_training ? 'Allow' : 'Do not allow'}</span></span>
      <input aria-label="Allow AI/ML training" type="checkbox" checked={value.ai_training} onChange={event => setAiTraining(event.target.checked)} className="h-5 w-5 accent-indigo-700" />
    </label>
    {value.kind === 'custom' && <div className="space-y-3">
      <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">{CUSTOM_NOTICE}</p>
      <label className="block text-sm font-medium text-gray-900">Licence title
        <input aria-label="Licence title" value={title} onChange={event => {setTitle(event.target.value); invalidateCustom();}} className="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2" />
      </label>
      <label className="block text-sm font-medium text-gray-900">Your licence text
        <textarea aria-label="Your licence text" value={text} onChange={event => {setText(event.target.value); invalidateCustom();}} rows={12} className="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm" />
      </label>
      <p role="status" className="text-xs text-gray-600">{(text ? Array.from(canonicalizeCustomText(text)).length : 0).toLocaleString()} / {MAX_CUSTOM_LICENSE_CODEPOINTS.toLocaleString()} Unicode characters after normalization</p>
      <p className="text-xs text-gray-600">Use English terms with at least 200 letters. Do not include passwords, private keys or terms that conflict with marketplace rules. Your text is stored as plain text.</p>
      <button type="button" disabled={!title.trim() || !text.trim() || Array.from(canonicalizeCustomText(text)).length > MAX_CUSTOM_LICENSE_CODEPOINTS || customPreview?.title===title && customPreview.text===canonicalizeCustomText(text)} onClick={() => void submit()} className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Save custom licence text</button>
      {!title.trim()||!text.trim()?<p className="text-xs text-gray-600">Enter a title and licence text to save it.</p>:Array.from(canonicalizeCustomText(text)).length>MAX_CUSTOM_LICENSE_CODEPOINTS?<p className="text-xs text-red-800">Shorten the licence text before saving.</p>:customPreview?.title===title&&customPreview.text===canonicalizeCustomText(text)?<p className="text-xs text-green-800">Custom licence text saved.</p>:null}
      {customPreview?.id === value.license_document_id && <section aria-label="Verified custom licence preview" className="rounded-lg border border-green-300 p-4"><h3 className="font-medium">{customPreview.title}</h3><p role="status" className="text-sm text-green-800">Custom licence text saved and verified.</p><pre dir="auto" className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words [tab-size:4] text-sm">{customPreview.text}</pre></section>}
      {submitError && <p role="alert" className="text-sm text-red-800">{submitError}</p>}
    </div>}
    <details onToggle={event => {if (event.currentTarget.open){if(value.kind==='standard'||customPreview?.id===value.license_document_id)setLicenseOpened(true);setCovenantOpened(true);}}} className="rounded-lg border border-gray-200 p-4">
      <summary className="cursor-pointer font-medium text-indigo-700">Read the summary and full terms</summary>
      <p className="mt-3 whitespace-pre-line text-sm leading-6 text-gray-700">{value.kind === 'standard' ? STANDARD_SELLER_SUMMARY : CUSTOM_NOTICE}</p>
      {value.kind==='custom'&&customPreview?.id===value.license_document_id&&<pre dir="auto" className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words text-sm">{customPreview.text}</pre>}
      <div className="mt-3 flex flex-wrap gap-4 text-sm">{value.kind === 'standard' ? <><a className="text-indigo-700 underline" href={licenseDocumentPath('standard', value.ai_training)} target="_blank" rel="noreferrer" onClick={()=>setLicenseOpened(true)}>Read full licence</a><a className="text-indigo-700 underline" href={`${licenseDocumentPath('standard', value.ai_training)}?download=1`} target="_blank" rel="noreferrer" onClick={()=>setLicenseOpened(true)}>Open full licence</a></> : <span className="text-gray-500">Save the text to review the verified full licence above.</span>}{value.kind === 'custom' && <><a className="text-indigo-700 underline" href={licenseDocumentPath('rider', value.ai_training)} target="_blank" rel="noreferrer">Read AI-Training Rider</a><a className="text-indigo-700 underline" href={`${licenseDocumentPath('rider', value.ai_training)}?download=1`} target="_blank" rel="noreferrer">Open AI-Training Rider</a></>}<a className="text-indigo-700 underline" href={licenseDocumentPath('covenant')} target="_blank" rel="noreferrer" onClick={()=>setCovenantOpened(true)}>Read Marketplace Listing Covenant</a><a className="text-indigo-700 underline" href={`${licenseDocumentPath('covenant')}?download=1`} target="_blank" rel="noreferrer" onClick={()=>setCovenantOpened(true)}>Open Marketplace Listing Covenant</a></div>
    </details>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-medium text-gray-900">Signer full name<input aria-label="Signer full name" value={identity.signer_name} onChange={event => updateIdentity('signer_name', event.target.value)} className="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
      <label className="text-sm font-medium text-gray-900">Signer title<input aria-label="Signer title" value={identity.signer_title} onChange={event => updateIdentity('signer_title', event.target.value)} className="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
    </div>
    <label onClick={()=>{if(!licenseOpened||!covenantOpened)setLockedHint(true);}} className="flex items-start gap-3 text-sm leading-6 text-gray-700"><input aria-label="Confirm covenant and authority" type="checkbox" checked={identity.authority_confirmed} disabled={!licenseOpened || !covenantOpened || (value.kind === 'custom' && !value.license_document_id)} onChange={event => updateIdentity('authority_confirmed', event.target.checked)} className="mt-1 h-4 w-4 accent-indigo-700" /><span>I have read the selected licence and Marketplace Listing Covenant. I confirm the covenant facts and that I am authorised to accept them for the seller.</span></label>
    {(!licenseOpened||!covenantOpened) && <p role={lockedHint?'alert':undefined} className="text-xs text-gray-500">{!licenseOpened&&!covenantOpened?'Open the selected licence and Marketplace Listing Covenant first.':!licenseOpened?'Open the selected licence first.':'Open the Marketplace Listing Covenant first.'}</p>}
    {licenseOpened&&covenantOpened&&value.kind==='custom'&&!value.license_document_id&&<p className="text-xs text-gray-600">Save your custom licence text before confirming.</p>}
  </fieldset></div>;
}
