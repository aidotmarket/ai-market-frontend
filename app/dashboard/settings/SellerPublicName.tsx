'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useSectionRecoveryRead } from '@/hooks/useSectionRecoveryRead';
import { getSellerPublicProfile, updateSellerPublicProfile, updateSellerCompanyName, SellerProfileError, type SellerPublicProfile } from '@/api/sellerProfile';
import { COMPANY_NAME_FORM_LABEL, COMPANY_NAME_TOGGLE_LABEL, COMPANY_NAME_TOGGLE_NOTE, COMPANY_NAME_SAVE, COMPANY_NAME_SAVING, COMPANY_NAME_SAVED } from '@/components/listings/publisherStrings';

export default function SellerPublicName({ ownOperation }: { ownOperation: () => () => boolean }) {
  const loaded = useRef(false);
  const [saved, setSaved] = useState<SellerPublicProfile | null>(null);
  const [name, setName] = useState('');
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<SellerProfileError | null>(null);
  const [success, setSuccess] = useState(false);
  const [companyName, setCompanyName] = useState(false);
  const [companySaving, setCompanySaving] = useState(false);
  const [companyError, setCompanyError] = useState<SellerProfileError | null>(null);
  const [companySuccess, setCompanySuccess] = useState(false);
  const companySaveRequest = useRef<AbortController | null>(null);
  // No seller profile yet (404): there is nothing to name, so the panel stays hidden.
  const [noProfile, setNoProfile] = useState(false);
  const saveRequest = useRef<AbortController | null>(null);

  const retry = useSectionRecoveryRead(useCallback(async (current: () => boolean, signal: AbortSignal) => {
    // Preserve an already loaded draft through healthy token rotation.
    if (loaded.current) return;
    const isCurrent = ownOperation();
    if (!isCurrent()) return;
    setLoading(true);
    setError(null);
    try {
      const profile = await getSellerPublicProfile(signal);
      if (!current() || !isCurrent()) return;
      loaded.current = true;
      setNoProfile(false);
      setSaved(profile);
      setCompanyName(profile.show_company_name ?? false);
      setName(profile.public_display_name ?? '');
      setVisible(profile.show_public_display_name);
    } catch (error) {
      if (!current() || !isCurrent()) return;
      const failure = error as SellerProfileError;
      if (failure.status === 404) setNoProfile(true);
      else setError(failure);
      throw error;
    } finally {
      if (current() && isCurrent()) setLoading(false);
    }
  }, [ownOperation]));

  useEffect(() => () => { saveRequest.current?.abort(); companySaveRequest.current?.abort(); }, [ownOperation]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const isCurrent = ownOperation();
    if (!isCurrent() || !saved || saving) return;
    setSuccess(false);
    setError(null);
    if (visible && !name.trim()) {
      setError(new SellerProfileError('Enter a public business name.', 422, { public_display_name: 'Enter a name before turning visibility on.' }));
      return;
    }
    const controller = new AbortController();
    saveRequest.current = controller;
    setSaving(true);
    try {
      const profile = await updateSellerPublicProfile({ public_display_name: name.trim() || null, show_public_display_name: visible }, controller.signal);
      if (controller.signal.aborted || !isCurrent()) return;
      setSaved(previous => previous && ({ ...previous,
        public_display_name: profile.public_display_name,
        show_public_display_name: profile.show_public_display_name,
      }));
      setName(profile.public_display_name ?? '');
      setVisible(profile.show_public_display_name);
      setSuccess(true);
    } catch (failure) {
      if (!controller.signal.aborted && isCurrent()) {
        if ((failure as SellerProfileError).status === 404) setNoProfile(true);
        else setError(failure as SellerProfileError);
      }
    } finally {
      if (!controller.signal.aborted && isCurrent()) setSaving(false);
    }
  };

  const saveCompanyName = async (event: FormEvent) => {
    event.preventDefault();
    const isCurrent = ownOperation();
    if (!isCurrent() || typeof saved?.show_company_name !== 'boolean' || companySaving) return;
    const controller = new AbortController();
    companySaveRequest.current = controller;
    setCompanySaving(true);
    setCompanyError(null);
    setCompanySuccess(false);
    try {
      const profile = await updateSellerCompanyName(companyName, controller.signal);
      if (controller.signal.aborted || !isCurrent()) return;
      setSaved(previous => previous && ({ ...previous, show_company_name: profile.show_company_name }));
      setCompanyName(profile.show_company_name ?? false);
      setCompanySuccess(true);
    } catch (failure) {
      if (!controller.signal.aborted && isCurrent()) {
        const error = failure as SellerProfileError;
        if (error.status === 404) setNoProfile(true);
        else {
          setCompanyError(error);
          if (error.status === 422) setCompanyName(saved.show_company_name);
        }
      }
    } finally {
      if (!controller.signal.aborted && isCurrent()) setCompanySaving(false);
    }
  };

  if (noProfile) return null;
  const disabled = loading || saving || !saved;
  const dirty = !!saved && (name !== (saved.public_display_name ?? '') || visible !== saved.show_public_display_name);
  const fieldErrors = error?.fieldErrors ?? {};
  return (
    <>
      <form onSubmit={save} className="mt-6 border-t border-gray-200 pt-6 space-y-3" aria-label="Public business name settings">
        <div>
          <label htmlFor="publicBusinessName" className="block text-sm font-medium text-gray-700 mb-1">Public business name</label>
          <input id="publicBusinessName" type="text" maxLength={255} value={name} disabled={disabled}
            aria-invalid={!!fieldErrors.public_display_name} aria-describedby={`publicNameExplanation${fieldErrors.public_display_name ? ' publicNameError' : ''}`}
            onChange={(event) => { if (ownOperation()()) { setName(event.target.value); setSuccess(false); setError(null); } }}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-50" />
          {fieldErrors.public_display_name && <p id="publicNameError" role="alert" className="mt-1 text-sm text-red-700">{fieldErrors.public_display_name}</p>}
        </div>
        <p id="publicNameExplanation" className="text-sm text-gray-600">Business name supplied by the seller. ai.market does not certify company affiliation.</p>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" role="switch" checked={visible} disabled={disabled}
            aria-invalid={!!fieldErrors.show_public_display_name} aria-describedby={`publicNameOptOut${fieldErrors.show_public_display_name ? ' publicVisibilityError' : ''}`}
            onChange={(event) => { if (ownOperation()()) { setVisible(event.target.checked); setSuccess(false); setError(null); } }} />
          Show public business name
        </label>
        {fieldErrors.show_public_display_name && <p id="publicVisibilityError" role="alert" className="text-sm text-red-700">{fieldErrors.show_public_display_name}</p>}
        <p id="publicNameOptOut" className="text-sm text-gray-600">Saving with visibility off stops ai.market showing your business name from now on. It cannot recall copies others already saved.</p>
        {loading && <p role="status" className="text-sm text-gray-600">Loading public business name settings...</p>}
        {error && Object.keys(fieldErrors).length === 0 && <p role="alert" className="text-sm text-red-700">{saved ? error.message : 'Could not load public business name settings. Please try again.'}</p>}
        {!loading && !saved && <button type="button" onClick={() => { if (ownOperation()()) retry(); }} className="text-sm underline">Try again: public business name settings</button>}
        <button type="submit" disabled={disabled || companySaving || !dirty} className="rounded-lg bg-[#3F51B5] px-4 py-2 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed">
          {saving ? 'Saving public business name...' : 'Save public business name'}
        </button>
        {success && <p role="status" className="text-sm text-gray-600">Public business name saved.</p>}
      </form>
      {typeof saved?.show_company_name === 'boolean' && <form onSubmit={saveCompanyName}
        aria-label={COMPANY_NAME_FORM_LABEL} className="mt-6 border-t border-gray-200 pt-6 space-y-3">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" role="switch" checked={companyName} disabled={companySaving}
            aria-describedby="companyNameNote" aria-invalid={!!companyError?.fieldErrors.show_company_name}
            onChange={(event) => { if (ownOperation()()) { setCompanyName(event.target.checked); setCompanyError(null); setCompanySuccess(false); } }} />
          {COMPANY_NAME_TOGGLE_LABEL}
        </label>
        <p id="companyNameNote" className="text-sm text-gray-600">{COMPANY_NAME_TOGGLE_NOTE}</p>
        {companyError && <p role="alert" className="text-sm text-red-700">{companyError.message}</p>}
        <button type="submit" disabled={saving || companySaving || companyName === saved.show_company_name}
          className="rounded-lg bg-[#3F51B5] px-4 py-2 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed">
          {companySaving ? COMPANY_NAME_SAVING : COMPANY_NAME_SAVE}
        </button>
        {companySuccess && <p role="status" className="text-sm text-gray-600">{COMPANY_NAME_SAVED}</p>}
      </form>}
    </>
  );
}
