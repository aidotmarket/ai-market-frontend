'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { getSellerPublicProfile, updateSellerPublicProfile, SellerProfileError, type SellerPublicProfile } from '@/api/sellerProfile';

export default function SellerPublicName({ ownOperation }: { ownOperation: () => () => boolean }) {
  const [saved, setSaved] = useState<SellerPublicProfile | null>(null);
  const [name, setName] = useState('');
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<SellerProfileError | null>(null);
  const [success, setSuccess] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const saveRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const isCurrent = ownOperation();
    if (!isCurrent()) return;
    setLoading(true);
    setError(null);
    getSellerPublicProfile(controller.signal).then((profile) => {
      if (controller.signal.aborted || !isCurrent()) return;
      setSaved(profile);
      setName(profile.public_display_name ?? '');
      setVisible(profile.show_public_display_name);
    }).catch((failure: SellerProfileError) => {
      if (!controller.signal.aborted && isCurrent()) setError(failure);
    }).finally(() => {
      if (!controller.signal.aborted && isCurrent()) setLoading(false);
    });
    return () => {
      controller.abort();
      saveRequest.current?.abort();
    };
  }, [ownOperation, attempt]);

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
      setSaved(profile);
      setName(profile.public_display_name ?? '');
      setVisible(profile.show_public_display_name);
      setSuccess(true);
    } catch (failure) {
      if (!controller.signal.aborted && isCurrent()) setError(failure as SellerProfileError);
    } finally {
      if (!controller.signal.aborted && isCurrent()) setSaving(false);
    }
  };

  const disabled = loading || saving || !saved;
  const dirty = !!saved && (name !== (saved.public_display_name ?? '') || visible !== saved.show_public_display_name);
  const fieldErrors = error?.fieldErrors ?? {};
  return (
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
      {!loading && !saved && <button type="button" onClick={() => { if (ownOperation()()) setAttempt((value) => value + 1); }} className="text-sm underline">Retry public business name settings</button>}
      <button type="submit" disabled={disabled || !dirty} className="rounded-lg bg-[#3F51B5] px-4 py-2 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed">
        {saving ? 'Saving public business name...' : 'Save public business name'}
      </button>
      {success && <p role="status" className="text-sm text-gray-600">Public business name saved.</p>}
    </form>
  );
}
