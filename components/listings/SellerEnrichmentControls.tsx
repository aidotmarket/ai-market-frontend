"use client";

import axios from 'axios';
import {useCallback, useEffect, useRef, useState} from 'react';
import {
  fetchListingEnrichment, saveListingEnrichment,
  type AggregateStatistics, type EnrichmentDictionaryField, type EnrichmentDictionaryWriteField, type EnrichmentView, type EnrichmentWrite,
} from '@/lib/api';

function requestId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function refusal(error: unknown): string | null {
  if (!axios.isAxiosError(error)) return null;
  const detail = typeof error.response?.data?.detail === 'string' ? error.response.data.detail : undefined;
  if (detail === 'verified_sample_unavailable_above_25_column_cap') {
    return 'A verified sample is not available for a dataset above the approved 25-column cap. This is a product limit, not an error in your dataset.';
  }
  if (detail === 'dictionary_must_match_committed_dataset_schema_republish_through_aim_data') {
    return 'The dictionary must match the committed dataset schema. Republish through AIM Data to restore agreement.';
  }
  if (detail === 'new_commitment_required') {
    return 'This would change the committed schema. Republish through AIM Data before changing these units.';
  }
  if (detail === 'idempotency_conflict') {
    return 'This save identifier was already used for different content. Review the current values and save again.';
  }
  if (detail === 'dictionary_field_unknown') {
    return 'A dictionary field no longer matches the listing. Reload the optional details; if it still differs, republish the dictionary through AIM Data.';
  }
  if (detail === 'dictionary_removal_forbidden') {
    return 'Dictionary fields cannot be removed here. Restore the field, or republish schema changes through AIM Data.';
  }
  if (detail === 'aggregate_column_unknown') {
    return 'An aggregate column no longer matches the listing. Republish the aggregate statistics through AIM Data, then reload the optional details.';
  }
  if (detail === 'generated_statement_not_guarded') {
    return 'This generated statement cannot be changed from this form. Regenerate or replace it through AIM Data, then reload the optional details.';
  }
  if (error.response?.status === 422) {
    return 'The optional details do not match the current listing contract. Reload them; if the problem remains, republish the affected metadata through AIM Data.';
  }
  return detail ? `The optional details were not saved: ${detail}. Review the values and try again.` : null;
}

function characters(value: string): number { return Array.from(value).length; }
function writableDictionary(fields: EnrichmentDictionaryField[]): fields is EnrichmentDictionaryWriteField[] {
  return fields.every(field => typeof field.description === 'string' && typeof field.nullable === 'boolean');
}

type Form = {
  origin: string; limitations: string[]; units: Record<string, string>;
  dictionary: EnrichmentDictionaryField[]; aggregate: AggregateStatistics | null; includeAggregate: boolean;
};

function formFrom(view: EnrichmentView): Form {
  const dictionary = view.schema_info?.fields ?? [];
  return {
    origin: view.values.dataset_origin_statement?.value ?? '',
    limitations: view.values.dataset_limitations?.value ?? [],
    units: Object.fromEntries(dictionary.map(field => [field.name, field.unit ?? ''])),
    dictionary, aggregate: view.aggregate_statistics ?? null, includeAggregate: view.aggregate_statistics != null,
  };
}

export default function SellerEnrichmentControls({listingId, active = true, onSaved}: {
  listingId: string; active?: boolean; onSaved?: () => void;
}) {
  const [view, setView] = useState<EnrichmentView | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const request = useRef<AbortController | null>(null);
  const retry = useRef<{signature: string; requestId: string} | null>(null);

  const load = useCallback(async (controller: AbortController) => {
    const current = await fetchListingEnrichment(listingId, controller.signal);
    if (!controller.signal.aborted) {setView(current); setForm(formFrom(current));}
  }, [listingId]);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController(); request.current = controller; setBusy(true); setError(''); setMessage('');
    load(controller).catch(() => {if (!controller.signal.aborted) setError('Optional listing details could not be loaded. Try again.');})
      .finally(() => {if (!controller.signal.aborted) {setBusy(false); request.current = null;}});
    return () => {controller.abort(); request.current = null;};
  }, [active, load]);

  async function save() {
    if (!view || !form || request.current || !active) return;
    const initial = formFrom(view), changes: Partial<EnrichmentWrite> = {};
    if (form.origin !== initial.origin) {
      if (form.origin && characters(form.origin) > 2_000) {setError('The origin statement can contain up to 2,000 characters.'); return;}
      changes.dataset_origin_statement = form.origin ? {text: form.origin, attribution: 'seller_entered'} : null;
    }
    const limitations = form.limitations.filter(value => value.length > 0);
    if (JSON.stringify(limitations) !== JSON.stringify(initial.limitations)) {
      if (limitations.length > 10 || limitations.some(value => characters(value) > 500)) {
        setError('Use no more than ten limitations, with up to 500 characters in each.'); return;
      }
      changes.dataset_limitations = limitations.length ? {statements: limitations, attribution: 'seller_entered'} : null;
    }
    if (form.dictionary.length && form.dictionary.some(field => (form.units[field.name] ?? '') !== (initial.units[field.name] ?? ''))) {
      if (!writableDictionary(form.dictionary)) {
        setError('Units cannot be changed here because this dictionary is missing required write fields. Republish the dictionary through AIM Data, then reload the optional details.');
        return;
      }
      const fields = form.dictionary.map(field => ({...field, unit: form.units[field.name] || null}));
      if (fields.some(field => field.unit && characters(field.unit) > 80)) {setError('A field unit can contain up to 80 characters.'); return;}
      changes.schema_info = {profile: 'aim-data-dictionary-v2', fields};
    }
    if (form.aggregate && form.includeAggregate !== initial.includeAggregate) {
      if (!form.includeAggregate && !window.confirm('Remove these aggregate statistics from the listing? They will disappear for all readers. To restore them, republish the statistics through AIM Data.')) {
        setError('');
        setMessage('Aggregate statistics were not removed. Nothing was sent.');
        return;
      }
      changes.aggregate_statistics = form.includeAggregate ? form.aggregate : null;
    }
    if (Object.keys(changes).length === 0) {setError(''); setMessage('No optional detail changes to save.'); return;}

    const signature = JSON.stringify({source_revision: view.source_revision, ...changes});
    if (retry.current?.signature !== signature) retry.current = {signature, requestId: requestId()};
    const payload: EnrichmentWrite = {
      profile: 'aim-listing-enrichment-profile-v2', source_revision: view.source_revision,
      request_id: retry.current.requestId, ...changes,
    };
    const controller = new AbortController(); request.current = controller; setBusy(true); setError(''); setMessage('');
    try {
      const result = await saveListingEnrichment(listingId, payload, controller.signal);
      retry.current = null;
      if (result.changed && !controller.signal.aborted) onSaved?.();
      try {
        await load(controller);
      } catch {
        if (!controller.signal.aborted) setError('Optional details were saved, but the current values could not be reloaded. Reload the page before making more changes.');
        return;
      }
      if (!controller.signal.aborted) {
        setMessage('Optional details saved. The buyer bundle now needs a fresh approval.');
      }
    } catch (failure) {
      if (controller.signal.aborted) return;
      if (axios.isAxiosError(failure) && failure.response?.status === 409 && failure.response?.data?.detail === 'stale_source_revision') {
        retry.current = null;
        try {
          await load(controller);
          if (!controller.signal.aborted) setMessage('The source changed. Current optional details were reloaded for review; your edit was not retried.');
        } catch {if (!controller.signal.aborted) setError('The source changed, but current optional details could not be reloaded. Try again.');}
      } else setError(refusal(failure) ?? 'The optional detail save could not be confirmed. Try again to send the identical save safely.');
    } finally {if (!controller.signal.aborted) {setBusy(false); request.current = null;}}
  }

  return <details className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-4">
    <summary className="cursor-pointer text-sm font-medium text-indigo-900">Optional listing details</summary>
    <div className="mt-4 space-y-5">
      <p className="text-sm text-gray-700">These details are optional. You can approve At a glance without adding or changing them.</p>
      {busy && !form && <p role="status" className="text-sm text-gray-600">Loading optional details…</p>}
      {form && <>
        {form.dictionary.length > 0 && <fieldset className="space-y-3"><legend className="text-sm font-semibold text-gray-900">Dictionary units</legend>
          <p className="text-xs text-gray-600">Units attach to the existing field names. Schema fields are set by AIM Data.</p>
          {!writableDictionary(form.dictionary) && <p className="text-xs text-amber-800">Units cannot be changed here because this dictionary is missing required write fields. Republish the dictionary through AIM Data, then reload the optional details.</p>}
          {form.dictionary.map(field => <label key={field.name} className="block text-sm text-gray-700"><span className="font-mono">{field.name}</span>
            <input value={form.units[field.name] ?? ''} onChange={event => setForm(current => current ? {...current, units: {...current.units, [field.name]: event.target.value}} : current)}
              aria-label={`Unit for ${field.name}`} disabled={busy || !active || !writableDictionary(form.dictionary)} className="mt-1 block w-full rounded border border-gray-300 bg-white px-3 py-2" />
          </label>)}</fieldset>}
        <label className="block text-sm font-semibold text-gray-900">Dataset origin statement
          <textarea value={form.origin} onChange={event => setForm(current => current ? {...current, origin: event.target.value} : current)} rows={4} disabled={busy || !active}
            className="mt-1 block w-full rounded border border-gray-300 bg-white px-3 py-2 font-normal" />
          <span className="mt-1 block text-xs font-normal text-gray-600">Optional seller statement. {characters(form.origin).toLocaleString('en-US')} / 2,000 characters.</span>
        </label>
        <fieldset className="space-y-3"><legend className="text-sm font-semibold text-gray-900">Dataset limitations</legend>
          {form.limitations.map((value, index) => <div key={index} className="flex items-start gap-2">
            <textarea aria-label={`Limitation ${index + 1}`} value={value} rows={2} disabled={busy || !active}
              onChange={event => setForm(current => current ? {...current, limitations: current.limitations.map((item, itemIndex) => itemIndex === index ? event.target.value : item)} : current)}
              className="block min-w-0 flex-1 rounded border border-gray-300 bg-white px-3 py-2 text-sm" />
            <button type="button" disabled={busy || !active} onClick={() => setForm(current => current ? {...current, limitations: current.limitations.filter((_, itemIndex) => itemIndex !== index)} : current)} className="text-sm text-indigo-700 underline">Remove</button>
          </div>)}
          {form.limitations.length < 10 && <button type="button" disabled={busy || !active} onClick={() => setForm(current => current ? {...current, limitations: [...current.limitations, '']} : current)} className="text-sm text-indigo-700 underline">Add a limitation</button>}
        </fieldset>
        {form.aggregate && <label className="flex items-start gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={form.includeAggregate} disabled={busy || !active} onChange={event => setForm(current => current ? {...current, includeAggregate: event.target.checked} : current)} className="mt-1" />
          <span>Keep the exact AIM Data aggregate statistics on this listing. Unchecking removes them for all readers; restoring them requires republishing through AIM Data. Buckets and groups are read-only here.</span>
        </label>}
        <button type="button" onClick={save} disabled={busy || !active} className="rounded-lg border border-indigo-700 bg-white px-4 py-2 text-sm font-medium text-indigo-700 disabled:opacity-50">{busy ? 'Saving…' : 'Save optional details'}</button>
      </>}
      {message && <p role="status" className="text-sm text-gray-700">{message}</p>}
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    </div>
  </details>;
}
