'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AxiosError } from 'axios';
import { getOrganization, reconcileOrganizationLegalIdentity, type OrganizationLegalIdentity } from '@/api/organizations';

function OrganizationLegalIdentityContent() {
  const organizationId = useSearchParams().get('org');
  const [organization, setOrganization] = useState<OrganizationLegalIdentity | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading');
  const [legalName, setLegalName] = useState('');
  const [jurisdiction, setJurisdiction] = useState('');
  const [reason, setReason] = useState('Resolve checkout identity conflict');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!organizationId) { setState('forbidden'); return; }
    getOrganization(organizationId).then((value) => {
      if (cancelled) return;
      setOrganization(value);
      if (value.current_user_role !== 'owner') { setState('forbidden'); return; }
      setLegalName(value.legal_name ?? '');
      setJurisdiction(value.jurisdiction ?? '');
      setState('ready');
    }).catch((error: unknown) => { if (!cancelled) setState(error instanceof AxiosError && error.response?.status === 403 ? 'forbidden' : 'error'); });
    return () => { cancelled = true; };
  }, [organizationId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId || !organization) return;
    setSaving(true);
    setMessage('');
    try {
      const updated = await reconcileOrganizationLegalIdentity(organizationId, {
        legal_name: legalName.trim(), jurisdiction: jurisdiction.trim().toUpperCase(), reason: reason.trim(),
      });
      setOrganization({ ...organization, ...updated });
      setMessage('Legal identity reconciled. Return to the listing and try checkout again.');
    } catch (error) {
      const detail = error instanceof AxiosError ? error.response?.data?.detail : null;
      setMessage(typeof detail === 'string' ? detail : 'Legal identity could not be reconciled.');
    } finally {
      setSaving(false);
    }
  }

  if (state === 'loading') return <main className="mx-auto max-w-2xl p-8"><p>Loading organisation legal identity…</p></main>;
  if (state === 'forbidden') return <main className="mx-auto max-w-2xl p-8"><h1 className="text-2xl font-bold">Organisation owner required</h1><p className="mt-3 text-gray-700">Only the organisation owner can reconcile its legal identity.</p></main>;
  if (state === 'error' || !organization) return <main className="mx-auto max-w-2xl p-8"><p role="alert" className="rounded-lg bg-red-50 p-4 text-red-800">Organisation legal identity is unavailable.</p></main>;

  return (
    <main className="mx-auto max-w-2xl p-8">
      <Link href="/dashboard/settings" className="text-sm text-indigo-700 underline">← Back to settings</Link>
      <h1 className="mt-4 text-2xl font-bold text-gray-900">Reconcile organisation legal identity</h1>
      <p className="mt-2 text-sm text-gray-600">Confirm the legal business name and two-letter jurisdiction used for signed licence records.</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block text-sm font-medium">Legal business name<input required maxLength={255} value={legalName} onChange={(event) => setLegalName(event.target.value)} className="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
        <label className="block text-sm font-medium">Jurisdiction (2-letter country code)<input required minLength={2} maxLength={2} value={jurisdiction} onChange={(event) => setJurisdiction(event.target.value.toUpperCase().slice(0, 2))} className="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2 uppercase" /></label>
        <label className="block text-sm font-medium">Reason<input required maxLength={255} value={reason} onChange={(event) => setReason(event.target.value)} className="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
        <button type="submit" disabled={saving} className="rounded-lg bg-[#3F51B5] px-4 py-2 font-medium text-white disabled:opacity-50">{saving ? 'Saving…' : 'Reconcile legal identity'}</button>
      </form>
      {message && <p role="status" className="mt-4 rounded-lg bg-gray-100 p-4 text-sm text-gray-800">{message}</p>}
    </main>
  );
}

export default function OrganizationLegalIdentityPage() {
  return <Suspense fallback={<main className="mx-auto max-w-2xl p-8">Loading organisation legal identity…</main>}><OrganizationLegalIdentityContent /></Suspense>;
}
