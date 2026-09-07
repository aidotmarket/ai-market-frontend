'use client';

import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import type { SourceRead } from '@/api/sellerListingSource';
import {
  cancelWorkspaceProfileJob, createIdempotencyKey, getWorkspaceProfileEvidence,
  listWorkspaceObjects, listWorkspaceProfileJobs,
  type SellerWorkspaceConnection, type WorkspaceObject,
  type WorkspaceProfileEvidence, type WorkspaceProfileJob,
} from '@/api/sellerWorkspace';

const buttonClass = 'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3F51B5] disabled:cursor-not-allowed disabled:opacity-50';
const objectIdentity = (object: WorkspaceObject) => JSON.stringify([object.key, object.version_id, object.etag, object.size]);

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return 'Unknown';
  if (bytes < 1024) return `${bytes} B`;
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 4);
  return `${(bytes / 1024 ** exponent).toLocaleString('en', { maximumFractionDigits: 1 })} ${['B', 'KB', 'MB', 'GB', 'TB'][exponent]}`;
}

export function WorkspaceNotice({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-xl border border-gray-200 bg-white p-6 sm:p-8"><h2 className="text-lg font-semibold text-gray-900">{title}</h2><div className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">{children}</div></div>;
}

type SaveSelection = (connection: SellerWorkspaceConnection, objects: WorkspaceObject[]) => Promise<void>;
export function WorkspaceData({ connections, enabled, savedSource, onSaveSelection }: { connections: SellerWorkspaceConnection[]; enabled: boolean; savedSource?: SourceRead | null; onSaveSelection?: SaveSelection }) {
  const verified = connections.filter((connection) => connection.status === 'verified');
  const [selectedId, setSelectedId] = useState(savedSource?.content.connection_id ?? '');
  const selected = verified.find((connection) => connection.id === selectedId) ?? verified[0];
  if (!enabled) return <WorkspaceNotice title="File browsing is not available yet">Your storage connections are saved. File browsing still needs to be connected in this Workspace. You do not need to run a data analysis or request marketplace verification to prepare a listing.</WorkspaceNotice>;
  if (!selected) return <WorkspaceNotice title="Connect storage to see your data">Add and verify an AWS connection in Storage connections. Only files inside the folder you authorize will be available here.</WorkspaceNotice>;
  return (
    <section className="space-y-5" aria-label="Choose what to sell">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h2 className="text-xl font-semibold text-gray-900">Choose what to sell</h2><p className="mt-1 text-sm text-gray-600">Browse file names, formats, and sizes in your connected folder. File contents stay in your cloud account.</p></div>
        <label className="text-sm font-medium text-gray-700">Storage connection
          <select value={selected.id} onChange={(event) => setSelectedId(event.target.value)} className="mt-1 block w-full max-w-sm rounded-lg border border-gray-300 bg-white px-3 py-2">
            {verified.map((connection) => <option key={connection.id} value={connection.id}>{connection.bucket} / {connection.prefix}</option>)}
          </select>
        </label>
      </div>
      {savedSource && (!savedSource.connection_current || !verified.some(item => item.id === savedSource.content.connection_id && item.version === savedSource.content.connection_version)) && <p role="alert" className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">The connection for your saved selection has changed. Choose files from a current connection and save them again.</p>}
      <ObjectBrowser key={`${selected.id}:${selected.version}`} connection={selected} onSaveSelection={onSaveSelection} initialSelection={savedSource?.connection_current && savedSource.content.connection_id === selected.id && savedSource.content.connection_version === selected.version ? savedSource.content.objects.map(item => ({...item, last_modified: '', format_candidate: 'unknown'})) : undefined} />
    </section>
  );
}

function ObjectBrowser({ connection, initialSelection, onSaveSelection }: { connection: SellerWorkspaceConnection; initialSelection?: WorkspaceObject[]; onSaveSelection?: SaveSelection }) {
  const initial = useRef(initialSelection ?? []);
  const [savedSelection, setSavedSelection] = useState(JSON.stringify((initialSelection ?? []).map(objectIdentity)));
  const [savingSelection, setSavingSelection] = useState(false);
  const saving = useRef(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [objects, setObjects] = useState<WorkspaceObject[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<WorkspaceObject[]>(initial.current);
  const [retry, setRetry] = useState(0);
  const mounted = useRef(true);
  const pending = useRef(false);

  useEffect(() => {
    let cancelled = false;
    mounted.current = true;
    setLoading(true);
    setError(false);
    setObjects([]);
    setSelected(initial.current);
    setCursor(null);
    listWorkspaceObjects(connection.id, connection.prefix ?? '')
      .then((result) => { if (!cancelled) { setObjects(result.objects); setCursor(result.next_cursor); } })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; mounted.current = false; };
  }, [connection.id, connection.prefix, retry]);

  const loadMore = async () => {
    if (!cursor || pending.current) return;
    pending.current = true;
    setLoading(true);
    setError(false);
    try {
      const result = await listWorkspaceObjects(connection.id, connection.prefix ?? '', cursor);
      if (mounted.current) {
        setObjects((current) => {
          const unique = new Map(current.map((object) => [JSON.stringify([object.key, object.version_id]), object]));
          result.objects.forEach((object) => unique.set(JSON.stringify([object.key, object.version_id]), object));
          return [...unique.values()];
        });
        setCursor(result.next_cursor);
      }
    } catch { if (mounted.current) setError(true); }
    finally { pending.current = false; if (mounted.current) setLoading(false); }
  };
  const selectionSnapshot = JSON.stringify(selected.map(objectIdentity));
  const saveSelection = async () => {
    if (!onSaveSelection || saving.current || selected.length === 0) return;
    saving.current = true; setSavingSelection(true); setSelectionError(null);
    const submitted = selectionSnapshot;
    try {
      await onSaveSelection(connection, [...selected]);
      if (mounted.current) setSavedSelection(submitted);
    } catch (error) {
      if (mounted.current) setSelectionError(axios.isAxiosError(error) && error.response?.status === 409
        ? 'The files, connection or saved selection changed. Your choices are still here. Reload the Workspace and choose the current files before saving again.'
        : 'Saving could not be confirmed. Your choices are still here. Try saving again.');
    } finally { saving.current = false; if (mounted.current) setSavingSelection(false); }
  };
  const filtered = objects.filter((object) => object.key.toLowerCase().includes(query.toLowerCase()));
  const toggleSelection = (object: WorkspaceObject) => {
    setSelected((current) => current.some((item) => objectIdentity(item) === objectIdentity(object))
      ? current.filter((item) => objectIdentity(item) !== objectIdentity(object))
      : current.length < 10 ? [...current, object] : current);
  };
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 p-5">
        <div className="min-w-0"><p className="break-all text-sm font-semibold text-gray-900">{connection.bucket} / {connection.prefix}</p><p className="mt-1 text-xs text-gray-500">{objects.length} files loaded · Files stay in your cloud account</p></div>
        <label className="text-sm text-gray-600"><span className="sr-only">Search loaded files</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search loaded files" className="w-full rounded-lg border border-gray-300 px-3 py-2 sm:w-60" /></label>
      </div>
      {error && <div role="alert" className="m-5 rounded-lg bg-red-50 p-4 text-sm text-red-800">Files could not be loaded. Check that the connection is still available.<button type="button" disabled={loading} onClick={() => cursor ? void loadMore() : setRetry((value) => value + 1)} className={`${buttonClass} ml-3`}>Try again</button></div>}
      {objects.length > 0 && <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Files in the selected storage connection</caption><thead className="bg-gray-50 text-xs text-gray-500"><tr><th scope="col" className="px-5 py-3">File</th><th scope="col" className="px-5 py-3">Format</th><th scope="col" className="px-5 py-3 text-right">Size</th></tr></thead><tbody className="divide-y divide-gray-100">{filtered.map((object) => <tr key={objectIdentity(object)}><th scope="row" className="max-w-md break-all px-5 py-4 font-medium text-gray-900"><label className="flex items-start gap-3"><input type="checkbox" aria-label={`Select ${object.key}`} disabled={selected.length >= 10 && !selected.some(item => objectIdentity(item) === objectIdentity(object))} checked={selected.some((item) => objectIdentity(item) === objectIdentity(object))} onChange={() => toggleSelection(object)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#3F51B5]" /><span>{object.key}</span></label></th><td className="px-5 py-4 text-xs uppercase text-gray-600">{object.format_candidate === 'unknown' ? 'Unrecognized' : object.format_candidate}</td><td className="whitespace-nowrap px-5 py-4 text-right text-gray-600">{formatBytes(object.size)}</td></tr>)}</tbody></table></div>}
      {!loading && !error && filtered.length === 0 && <p className="p-8 text-center text-sm text-gray-500">{query ? 'No loaded files match your search.' : 'No files found in this connected folder.'}</p>}
      {loading && <p role="status" className="p-5 text-sm text-gray-600">Loading files…</p>}
      {cursor && !error && <div className="border-t border-gray-200 p-4 text-center"><button type="button" disabled={loading} onClick={loadMore} className={buttonClass}>Load more files</button></div>}
      <div className="border-t border-gray-200 bg-gray-50 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><p role="status" className="text-sm font-medium text-gray-900">{selected.length} {selected.length === 1 ? 'file' : 'files'} selected · {formatBytes(selected.reduce((total, object) => total + object.size, 0))}</p>{selected.length > 0 && <button type="button" onClick={() => setSelected([])} className={buttonClass}>Clear selection</button>}</div>
        {onSaveSelection ? <div className="mt-3 space-y-3"><button type="button" disabled={savingSelection || selected.length === 0 || selectionSnapshot === savedSelection} onClick={saveSelection} className={buttonClass}>{savingSelection ? 'Saving selection…' : 'Save selected files'}</button><p role="status" className="text-sm text-gray-600">{selectionSnapshot === savedSelection && selected.length > 0 ? 'File selection saved to your account.' : 'Your file choices have not been saved.'} Saving does not publish or analyze your data.</p>{selected.length > 0 && <ul aria-label="Selected files" className="space-y-1 text-xs text-gray-600">{selected.map(item => <li key={objectIdentity(item)} className="break-all">{item.key}</li>)}</ul>}{selectionError && <p role="alert" className="text-sm text-red-800">{selectionError}</p>}<p className="text-xs text-gray-600">Choose up to 10 files. Your file choices are saved privately; the files stay in your cloud account.</p></div> : <p className="mt-2 text-xs leading-5 text-gray-600">Choosing files does not read or analyze their contents. Your selection stays when you switch Workspace sections. Changing the storage connection, reloading, or leaving the Workspace clears it. Saving it to a listing is not available yet.</p>}
      </div>
    </div>
  );
}

const JOB_LABELS: Record<WorkspaceProfileJob['state'], string> = {
  queued: 'Queued', starting: 'Starting', running: 'Profiling', validating_result: 'Checking results',
  cancel_requested: 'Cancellation requested', succeeded: 'Completed', failed: 'Failed', cancelled: 'Cancelled', expired: 'Expired',
};
const CANCELLABLE = new Set(['queued', 'starting', 'running', 'validating_result']);

export function WorkspaceActivity({ enabled, connections }: { enabled: boolean; connections: SellerWorkspaceConnection[] }) {
  if (!enabled) return <WorkspaceNotice title="Profiling activity is not available yet">When profiling becomes available, this screen will show progress, results, and any actions needed. Connecting storage does not start a profile.</WorkspaceNotice>;
  return <ProfileActivity connections={connections} />;
}

function ProfileActivity({ connections }: { connections: SellerWorkspaceConnection[] }) {
  const [jobs, setJobs] = useState<WorkspaceProfileJob[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<WorkspaceProfileEvidence | null>(null);
  const mounted = useRef(true);
  const actionPending = useRef(false);
  const cancelKeys = useRef(new Map<string, string>());
  useEffect(() => {
    let cancelled = false;
    mounted.current = true;
    setLoading(true); setError(null); setJobs([]); setCursor(null); setEvidence(null); setConfirmId(null);
    listWorkspaceProfileJobs().then((result) => {
      if (!cancelled) { setJobs(result.jobs); setCursor(result.next_cursor); }
    }).catch(() => { if (!cancelled) setError('Profiling activity could not be loaded. Try refreshing.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; mounted.current = false; };
  }, [retry]);

  const act = async (job: WorkspaceProfileJob, cancel: boolean) => {
    if (actionPending.current) return;
    actionPending.current = true;
    setBusy(job.id); setError(null); setEvidence(null);
    try {
      if (cancel) {
        const fingerprint = `${job.id}:${job.version}`;
        const key = cancelKeys.current.get(fingerprint) ?? createIdempotencyKey('cancel-profile');
        cancelKeys.current.set(fingerprint, key);
        const result = await cancelWorkspaceProfileJob(job, key);
        if (mounted.current) { setJobs((current) => current.map((item) => item.id === result.id ? result : item)); setConfirmId(null); }
        cancelKeys.current.delete(fingerprint);
      } else if (job.evidence_ref) {
        const result = await getWorkspaceProfileEvidence(job.evidence_ref);
        if (mounted.current) setEvidence(result);
      }
    } catch { if (mounted.current) setError(cancel ? 'Cancellation could not be confirmed. Refresh the activity before trying again.' : 'This result could not be loaded. Try again.'); }
    finally { actionPending.current = false; if (mounted.current) setBusy(null); }
  };
  const more = async () => {
    if (!cursor || actionPending.current) return;
    actionPending.current = true; setLoading(true); setError(null);
    try {
      const result = await listWorkspaceProfileJobs(cursor);
      if (mounted.current) {
        setJobs((current) => [...new Map([...current, ...result.jobs].map((job) => [job.id, job])).values()]);
        setCursor(result.next_cursor);
      }
    } catch { if (mounted.current) setError('More activity could not be loaded. Try again.'); }
    finally { actionPending.current = false; if (mounted.current) setLoading(false); }
  };
  return (
    <section className="space-y-5" aria-label="Profiling activity">
      <div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-semibold text-gray-900">Profiling activity</h2><p className="mt-1 text-sm text-gray-600">Review progress and results. Refresh to see the latest status.</p></div><button type="button" disabled={loading || busy !== null} onClick={() => setRetry((value) => value + 1)} className={buttonClass}>Refresh</button></div>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-800">{error}</p>}
      {jobs.map((job, index) => <article key={job.id} className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><h3 className="break-all font-semibold text-gray-900">{connections.find((connection) => connection.id === job.connection_id)?.bucket ?? `Data profile ${index + 1}`}</h3><p className="mt-1 text-xs text-gray-500">Attempt {job.attempt}</p></div><span className={`rounded-full px-3 py-1 text-xs font-medium ${job.state === 'succeeded' ? 'bg-green-100 text-green-800' : job.state === 'failed' ? 'bg-red-100 text-red-800' : 'bg-indigo-50 text-indigo-800'}`}>{JOB_LABELS[job.state]}</span></div>
        <dl className="my-5 grid grid-cols-2 gap-4 sm:grid-cols-4">{[['Files examined', job.objects_completed], ['Rows examined', job.rows_examined.toLocaleString('en')], ['Data read', formatBytes(job.source_bytes_read)], ['Fields reported', job.field_records_emitted]].map(([label, value]) => <div key={label}><dt className="text-xs text-gray-500">{label}</dt><dd className="mt-1 text-lg font-semibold text-gray-900">{value}</dd></div>)}</dl>
        {job.state === 'failed' && <p className="mb-4 text-sm text-red-800">This profile did not complete. No listing was published.</p>}
        {job.state === 'succeeded' && job.evidence_ref && <button type="button" disabled={busy !== null || loading} onClick={() => act(job, false)} className={buttonClass}>{busy === job.id ? 'Loading result…' : 'View result'}</button>}
        {CANCELLABLE.has(job.state) && (confirmId === job.id ? <div className="rounded-lg bg-amber-50 p-4"><p className="text-sm text-amber-900">Request cancellation of this profile? Work already performed may still incur AWS charges.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy !== null || loading} onClick={() => act(job, true)} className={buttonClass}>{busy === job.id ? 'Requesting…' : 'Confirm cancellation'}</button><button type="button" disabled={busy !== null} onClick={() => setConfirmId(null)} className={buttonClass}>Keep running</button></div></div> : <button type="button" disabled={busy !== null || loading} onClick={() => setConfirmId(job.id)} className={buttonClass}>Cancel profile</button>)}
      </article>)}
      {loading && <p role="status" className="p-5 text-sm text-gray-600">Loading activity…</p>}
      {!loading && !error && jobs.length === 0 && <WorkspaceNotice title="No profiles yet">Your profiling jobs will appear here once started. Your data remains private until you explicitly approve a public sample and listing.</WorkspaceNotice>}
      {cursor && <button type="button" disabled={loading || busy !== null} onClick={more} className={buttonClass}>Load more activity</button>}
      {evidence && <ProfileResult evidence={evidence} onClose={() => setEvidence(null)} />}
    </section>
  );
}

function ProfileResult({ evidence, onClose }: { evidence: WorkspaceProfileEvidence; onClose: () => void }) {
  const semantics = evidence.result.semantic_evidence;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [evidence.id]);
  return (
    <section aria-label="Profile result" className="rounded-xl border border-indigo-200 bg-white p-5 sm:p-6">
      <div className="flex items-center justify-between gap-4"><h2 ref={heading} tabIndex={-1} className="text-xl font-semibold text-gray-900">Profile result</h2><button type="button" className={buttonClass} onClick={onClose}>Close result</button></div>
      <p className="mt-2 text-sm leading-6 text-gray-600">{semantics.observed.rows_examined.toLocaleString('en')} rows examined across {semantics.observed.objects_completed} files. These observations describe the data examined, not necessarily every row in the source.</p>
      <p className="mt-2 text-sm text-gray-600">Original field names and cell values stay in your cloud account. Fields are identified by position here.</p>
      {semantics.observed.truncated && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">This result is partial because a profiling limit was reached.</p>}
      {semantics.objects.map((object, index) => <div key={object.object_ref} className="mt-6"><h3 className="font-semibold text-gray-900">File {index + 1} <span className="ml-2 text-xs font-normal uppercase text-gray-500">{object.format} · {formatBytes(object.size)}</span></h3>{object.warning_codes.length > 0 && <p className="mt-2 text-sm text-amber-800">This file has {object.warning_codes.length} profiling warnings.</p>}<div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Observed fields for file {index + 1}</caption><thead className="bg-gray-50 text-xs text-gray-500"><tr>{['Field position', 'Type', 'Present', 'Missing', 'Findings'].map((label) => <th key={label} scope="col" className="px-3 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-gray-100">{object.fields.map((field) => <tr key={field.position}><th scope="row" className="px-3 py-3 font-medium text-gray-900">{field.position}</th><td className="px-3 py-3 text-gray-700">{field.physical_type}</td><td className="px-3 py-3 text-gray-700">{field.non_null_count.toLocaleString('en')}</td><td className="px-3 py-3 text-gray-700">{field.null_count.toLocaleString('en')}</td><td className="px-3 py-3 text-gray-700">{[...field.pii_classes.map((value) => `Possible ${value.replaceAll('_', ' ')}`), ...field.quality_flags.map((value) => value.replaceAll('_', ' '))].join(', ') || 'None reported'}</td></tr>)}</tbody></table></div></div>)}
    </section>
  );
}
