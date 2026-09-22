'use client';

import {useState} from 'react';
import {
  LICENSE_HASHES, createStandardSelection, uploadCustomLicense,
  type LicenseSelection,
} from '@/api/listingLicenses';

export const STANDARD_SELLER_SUMMARY = `Not the contract — read the full licence before choosing it.
You remain the owner and licensor of the delivered dataset version.
The buyer may use it internally and commercialise models, outputs and derived work that do not expose or reconstruct the raw data.
The buyer may not redistribute or resell the dataset itself, and AI/ML training follows your displayed switch.
You promise that you have the rights, sourced the data lawfully, stated the listing facts accurately and included no regulated personal or special-category data.
A material mismatch reported within seven days is remedied by fix or refund; liability is capped as the full licence states.
ai.market is not a party and gives no legal advice; New York law governs.`;

export const CUSTOM_NOTICE = "The seller's own terms. ai.market did not write these; review them before you accept. The separate ai.market AI-Training Rider and Marketplace Listing Covenant also form part of your record. ai.market is not a party and gives no legal advice.";

const STANDARD_FULL_TEXT_URL = (aiTraining: boolean) => `/licenses/standard/1.0/${aiTraining ? 'ai-training' : 'no-ai-training'}?download=1`;
const COVENANT_FULL_TEXT_URL = '/licenses/marketplace-listing/1.0?download=1';

export default function SellerLicenseSelection({value, onChange, disabled = false}: {
  value: LicenseSelection; onChange: (value: LicenseSelection) => void; disabled?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [termsOpened, setTermsOpened] = useState(false);
  const identity = value.seller_acceptance;
  const updateIdentity = (field: 'signer_name' | 'signer_title' | 'authority_confirmed', next: string | boolean) =>
    onChange({...value, seller_acceptance: {...identity, [field]: next}});
  const chooseKind = (kind: LicenseSelection['kind']) => {
    setTermsOpened(false);
    const invalidatedIdentity={...identity,authority_confirmed:false};
    if (kind === 'standard') onChange({...createStandardSelection(value.ai_training), seller_acceptance: invalidatedIdentity});
    else onChange({...value, kind: 'custom', version: '1.0', license_document_id: null, license_sha256: '',
      rider_sha256: LICENSE_HASHES.rider[String(value.ai_training) as 'true' | 'false'],seller_acceptance:invalidatedIdentity});
  };
  const setAiTraining = (aiTraining: boolean) => {
    setTermsOpened(false);
    if (value.kind === 'standard') onChange({...value, ai_training: aiTraining,
      license_sha256: LICENSE_HASHES.standard[String(aiTraining) as 'true' | 'false'],seller_acceptance:{...identity,authority_confirmed:false}});
    else onChange({...value, ai_training: aiTraining, license_document_id: null, license_sha256: '',
      rider_sha256: LICENSE_HASHES.rider[String(aiTraining) as 'true' | 'false'],
      seller_acceptance: {...identity, authority_confirmed: false}});
  };
  async function upload(file: File) {
    setUploading(true); setUploadError(''); setTermsOpened(false);
    try {
      const result = await uploadCustomLicense(file, value.ai_training);
      onChange({...value, kind: 'custom', version: '1.0', license_document_id: result.license_document_id,
        license_sha256: result.license_sha256, rider_sha256: result.rider_sha256,
        covenant_sha256: result.covenant_sha256, seller_acceptance: {...identity, authority_confirmed: false}});
    } catch { setUploadError('The custom licence could not be uploaded. Check that it is a clean English PDF or text file no larger than 1 MiB.'); }
    finally { setUploading(false); }
  }
  return <fieldset disabled={disabled || uploading} className="space-y-5 rounded-xl border border-gray-200 bg-white p-5">
    <legend className="px-1 text-lg font-semibold text-gray-900">How can buyers use this data?</legend>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className={`rounded-xl border p-4 ${value.kind === 'standard' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'}`}>
        <span className="flex items-center gap-2 font-semibold"><input type="radio" name="listing-license-kind" checked={value.kind === 'standard'} onChange={() => chooseKind('standard')} />Standard <span className="text-xs font-medium text-indigo-700">Recommended</span></span>
        <span className="mt-2 block text-sm text-gray-600">Balanced ai.market terms. Buyers may not redistribute or resell the dataset.</span>
      </label>
      <label className={`rounded-xl border p-4 ${value.kind === 'custom' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'}`}>
        <span className="flex items-center gap-2 font-semibold"><input type="radio" name="listing-license-kind" checked={value.kind === 'custom'} onChange={() => chooseKind('custom')} />My own licence</span>
        <span className="mt-2 block text-sm text-gray-600">Upload your own English PDF or text terms.</span>
      </label>
    </div>
    <label className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 p-4 text-sm font-medium text-gray-900">
      <span>Allow AI/ML training <span className="block text-xs font-normal text-gray-500">{value.ai_training ? 'Allow' : 'Do not allow'}</span></span>
      <input aria-label="Allow AI/ML training" type="checkbox" checked={value.ai_training} onChange={event => setAiTraining(event.target.checked)} className="h-5 w-5 accent-indigo-700" />
    </label>
    {value.kind === 'custom' && <div className="space-y-3">
      <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">{CUSTOM_NOTICE}</p>
      <label className="block text-sm font-medium text-gray-900">Upload your licence
        <input aria-label="Upload your licence" type="file" accept=".txt,text/plain,.pdf,application/pdf" className="mt-2 block w-full text-sm" onChange={event => {const file = event.target.files?.[0]; if (file) void upload(file);}} />
      </label>
      {value.license_document_id && <p role="status" className="text-sm text-green-800">Custom licence uploaded and verified.</p>}
      {uploadError && <p role="alert" className="text-sm text-red-800">{uploadError}</p>}
    </div>}
    <details onToggle={event => {if (event.currentTarget.open) setTermsOpened(true);}} className="rounded-lg border border-gray-200 p-4">
      <summary className="cursor-pointer font-medium text-indigo-700">Read the summary and full terms</summary>
      <p className="mt-3 whitespace-pre-line text-sm leading-6 text-gray-700">{value.kind === 'standard' ? STANDARD_SELLER_SUMMARY : CUSTOM_NOTICE}</p>
      <div className="mt-3 flex flex-wrap gap-4 text-sm">{value.kind === 'standard' || value.license_document_id ? <a className="text-indigo-700 underline" href={value.kind === 'standard' ? STANDARD_FULL_TEXT_URL(value.ai_training) : `/licenses/custom/${encodeURIComponent(value.license_document_id!)}`} target="_blank" rel="noreferrer">Open full licence</a> : <span className="text-gray-500">Upload your licence to open the full document.</span>}<a className="text-indigo-700 underline" href={COVENANT_FULL_TEXT_URL} target="_blank" rel="noreferrer">Open Marketplace Listing Covenant</a></div>
    </details>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-medium text-gray-900">Signer full name<input aria-label="Signer full name" value={identity.signer_name} onChange={event => updateIdentity('signer_name', event.target.value)} className="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
      <label className="text-sm font-medium text-gray-900">Signer title<input aria-label="Signer title" value={identity.signer_title} onChange={event => updateIdentity('signer_title', event.target.value)} className="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
    </div>
    <label className="flex items-start gap-3 text-sm leading-6 text-gray-700"><input aria-label="Confirm covenant and authority" type="checkbox" checked={identity.authority_confirmed} disabled={!termsOpened || (value.kind === 'custom' && !value.license_document_id)} onChange={event => updateIdentity('authority_confirmed', event.target.checked)} className="mt-1 h-4 w-4 accent-indigo-700" /><span>I have read the selected licence and Marketplace Listing Covenant. I confirm the covenant facts and that I am authorised to accept them for the seller.</span></label>
    {!termsOpened && <p className="text-xs text-gray-500">Open the summary and full terms before confirming.</p>}
  </fieldset>;
}
