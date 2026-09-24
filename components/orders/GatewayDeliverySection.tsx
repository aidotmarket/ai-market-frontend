'use client';

import { useEffect, useRef, useState } from 'react';
import { getGatewayDelivery, gatewayErrorCode, reissueGatewayPermission, reportGatewayProblem } from '@/api/gatewayDelivery';
import type { GatewayBlockedCode, GatewayDelivery, GatewayDeliveryFile, GatewayPermission } from '@/types/gatewayDelivery';

export const BLOCKED_MESSAGES: Record<GatewayBlockedCode, string> = {
  complete: 'Delivery is complete.',
  rate_limited: 'You have used all five re-issues for this file in the last 24 hours. Try again later.',
  gateway_unavailable: 'The gateway is unavailable. Try again later.',
  gateway_revoked: 'The gateway is no longer available. Report a problem.',
  coverage_exhausted: 'This file cannot be downloaded again. Report a problem.',
  order_not_deliverable: 'This order is no longer eligible for delivery.',
};

function errorMessage(code: string | null): string {
  switch (code) {
    case 'restart_unavailable': return 'Restart is unavailable. Choose Resume download for a new download link and copyable resume command, or report a problem.';
    case 'delivery_complete': return 'Delivery is complete.';
    case 'reissue_rate_limited': return BLOCKED_MESSAGES.rate_limited;
    case 'gateway_unavailable': return BLOCKED_MESSAGES.gateway_unavailable;
    case 'gateway_revoked': return BLOCKED_MESSAGES.gateway_revoked;
    case 'coverage_exhausted': return BLOCKED_MESSAGES.coverage_exhausted;
    case 'order_not_deliverable': return BLOCKED_MESSAGES.order_not_deliverable;
    case 'problem_window_closed': return 'The time to report a problem has ended.';
    case 'file_not_in_order': return 'Choose a file from this order.';
    default: return 'Could not complete this action. Try again.';
  }
}

function formatBytes(bytes: number) {
  return `${new Intl.NumberFormat().format(bytes)} bytes`;
}

function shellQuote(value: string) {
  return `'${value.replace(/[\x00-\x1f\x7f]/g, '').replaceAll("'", "'\\''")}'`;
}

function FileRow({ file, orderId, reload, report, disputable }: { file: GatewayDeliveryFile; orderId: string; reload: () => void; report: (fileId: string) => void; disputable: boolean }) {
  const [permission, setPermission] = useState<GatewayPermission | null>(file.permission);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [resumeAvailable, setResumeAvailable] = useState(false);
  const [verification, setVerification] = useState('');
  const worker = useRef<Worker | null>(null);

  useEffect(() => { setPermission(file.permission); }, [file.permission]);
  useEffect(() => { if (file.reissue.blocked_code || !file.reissue.allowed) setResumeAvailable(false); }, [file.reissue.allowed, file.reissue.blocked_code]);
  useEffect(() => () => worker.current?.terminate(), []);

  async function reissue(mode: 'restart' | 'resume') {
    setBusy(true);
    setMessage('');
    try {
      const next = await reissueGatewayPermission(orderId, file.file_id, mode);
      setPermission(next);
      setResumeAvailable(false);
      reload();
    } catch (error) {
      const code = gatewayErrorCode(error);
      if (code === 'restart_unavailable') setResumeAvailable(true);
      setMessage(errorMessage(code));
      reload();
    } finally { setBusy(false); }
  }

  function verify(picked: File | undefined) {
    if (!picked) return;
    worker.current?.terminate();
    setVerification('Checking 0%');
    let next: Worker;
    try { next = new Worker(new URL('./verifyGatewayFile.worker.ts', import.meta.url), { type: 'module' }); }
    catch { setVerification('Could not check this file.'); return; }
    worker.current = next;
    next.onmessage = (event: MessageEvent<{ progress?: number; result?: string }>) => {
      if (event.data.progress !== undefined) setVerification(`Checking ${event.data.progress}%`);
      if (event.data.result) {
        setVerification(event.data.result === 'match' ? 'File matches the committed SHA-256.' : event.data.result === 'mismatch' ? 'File does not match. Report a problem.' : 'Could not check this file.');
        next.terminate();
        if (worker.current === next) worker.current = null;
      }
    };
    next.onerror = () => { setVerification('Could not check this file.'); next.terminate(); };
    next.postMessage({ file: picked, expected: file.sha256 });
  }

  const command = permission && `curl -C - -H ${shellQuote(`Authorization: Bearer ${permission.token}`)} -o ${shellQuote(file.display_name)} ${shellQuote(permission.download_url)}`;
  return <li className="border-t border-gray-200 py-4" data-testid="gateway-file">
    <p className="font-medium">{file.display_name}</p>
    <p className="text-sm text-gray-600">{file.state === 'delivered' ? 'Delivered' : file.state === 'in_progress' ? 'In progress' : 'Not started'} · {formatBytes(file.transmitted_bytes)} sent of {formatBytes(file.size_bytes)}</p>
    <p className="break-all text-xs text-gray-600">SHA-256: {file.sha256}</p>
    {permission && file.state !== 'delivered' && <div className="mt-2 flex flex-wrap gap-2">
      <a href={permission.browser_url} referrerPolicy="no-referrer" className="rounded bg-indigo-700 px-3 py-2 text-sm text-white">Download file</a>
      {command && <button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => { if (!navigator.clipboard) { setMessage('Could not copy command.'); return; } void navigator.clipboard.writeText(command).then(() => setMessage('Command copied.')).catch(() => setMessage('Could not copy command.')); }}>Copy resume command</button>}
    </div>}
    {file.reissue.blocked_code && <p className="mt-2 text-sm">{BLOCKED_MESSAGES[file.reissue.blocked_code]}</p>}
    {file.reissue.allowed && !permission && !resumeAvailable && file.reissue.blocked_code !== 'coverage_exhausted' && <button type="button" disabled={busy} className="mt-2 rounded border px-3 py-2 text-sm disabled:opacity-50" onClick={() => reissue('restart')}>Restart download</button>}
    {resumeAvailable && file.reissue.allowed && !file.reissue.blocked_code && <button type="button" disabled={busy} className="ml-2 rounded border px-3 py-2 text-sm disabled:opacity-50" onClick={() => reissue('resume')}>Resume download</button>}
    {disputable && (file.reissue.blocked_code === 'coverage_exhausted' || resumeAvailable || file.reissue.blocked_code === 'gateway_revoked') && <button type="button" className="ml-2 text-sm text-indigo-700 underline" onClick={() => report(file.file_id)}>Report a problem</button>}
    <label className="mt-3 block text-sm">Verify file <input type="file" className="mt-1 block text-sm" onChange={(event) => { const picked = event.currentTarget.files?.[0]; event.currentTarget.value = ''; verify(picked); }} /></label>
    {verification && <p role="status" className="mt-1 text-sm">{verification}</p>}
    {message && <p role="alert" className="mt-1 text-sm text-red-700">{message}</p>}
  </li>;
}

export default function GatewayDeliverySection({ orderId }: { orderId: string }) {
  const [delivery, setDelivery] = useState<GatewayDelivery | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [category, setCategory] = useState<'missing_data' | 'corrupted'>('missing_data');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = useRef<() => void>(() => {});

  useEffect(() => {
    let active = true;
    let generation = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastDelivery: GatewayDelivery | null = null;
    async function load(current: number) {
      try {
        const { delivery: next, retryAfter } = await getGatewayDelivery(orderId);
        if (!active || current !== generation) return;
        lastDelivery = next;
        setDelivery(next);
        const seconds = retryAfter ?? (next.files.some((file) => file.state === 'in_progress') ? 5 : 60);
        timer = setTimeout(() => { timer = undefined; void load(current); }, seconds * 1000);
      } catch (error) {
        if (!active || current !== generation) return;
        const response = (error as { response?: { status?: number; headers?: { get?: (name: string) => unknown; [name: string]: unknown } } })?.response;
        const code = gatewayErrorCode(error);
        if (response?.status === 401 || response?.status === 403 || (response?.status === 404 && ['gateway_disabled', 'not_a_gateway_order', 'order_not_found'].includes(code ?? ''))) {
          lastDelivery = null;
          setDelivery(null);
          return;
        }
        const headers = response?.headers;
        const retry = Number(headers?.get?.('retry-after') ?? headers?.['retry-after']);
        const seconds = Number.isFinite(retry) && retry > 0 ? retry : lastDelivery?.files.some((file) => file.state === 'in_progress') ? 5 : 60;
        timer = setTimeout(() => { timer = undefined; void load(current); }, seconds * 1000);
      }
    }
    refresh.current = () => { generation++; if (timer) clearTimeout(timer); timer = undefined; void load(generation); };
    refresh.current();
    return () => { active = false; generation++; if (timer) clearTimeout(timer); timer = undefined; refresh.current = () => {}; };
  }, [orderId]);

  if (!delivery) return null;
  const allDelivered = delivery.files.length > 0 && delivery.files.every((file) => file.state === 'delivered');

  async function submitProblem(event: React.FormEvent) {
    event.preventDefault();
    if (!selected.length) { setMessage('Choose at least one file.'); return; }
    setBusy(true);
    setMessage('');
    try {
      await reportGatewayProblem(orderId, { category, file_ids: selected, ...(note.trim() ? { note: note.trim() } : {}) });
      setFormOpen(false);
      setSelected([]);
      setNote('');
      refresh.current();
    } catch (error) { setMessage(errorMessage(gatewayErrorCode(error))); }
    finally { setBusy(false); }
  }

  return <section className="rounded-lg border border-gray-200 p-6" aria-label="Gateway delivery">
    <h2 className="text-lg font-semibold">Gateway delivery</h2>
    <p className="mt-1 text-sm text-gray-600">{allDelivered ? 'All files delivered.' : 'Download each file below.'}</p>
    <ul>{delivery.files.map((file) => <FileRow key={file.file_id} file={file} orderId={orderId} reload={() => refresh.current()} report={(fileId) => { setSelected([fileId]); setFormOpen(true); }} disputable={delivery.hold.disputable} />)}</ul>
    {delivery.problem && <p className="mt-3 text-sm" role="status">Problem {delivery.problem.state.replace('_', ' ')}. {delivery.problem.file_ids.length} file(s) reported.</p>}
    {delivery.hold.state === 'held_until' && delivery.hold.until && <p className="mt-2 text-sm">Problem window ends {new Date(delivery.hold.until).toLocaleString()}.</p>}
    {delivery.hold.disputable && <button type="button" className="mt-3 text-sm text-indigo-700 underline" onClick={() => setFormOpen(!formOpen)}>Report a problem</button>}
    {formOpen && delivery.hold.disputable && <form onSubmit={submitProblem} className="mt-3 space-y-3 border-t pt-3">
      <fieldset><legend className="text-sm font-medium">Files</legend>{delivery.files.map((file) => <label key={file.file_id} className="mt-1 block text-sm"><input type="checkbox" checked={selected.includes(file.file_id)} onChange={(event) => setSelected(event.target.checked ? [...selected, file.file_id] : selected.filter((id) => id !== file.file_id))} /> {file.display_name}</label>)}</fieldset>
      <label className="block text-sm">Problem <select value={category} onChange={(event) => setCategory(event.target.value as typeof category)} className="ml-2 border p-1"><option value="missing_data">Missing data</option><option value="corrupted">Corrupted file</option></select></label>
      <label className="block text-sm">Note (optional)<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} className="mt-1 block w-full rounded border p-2" /></label>
      <button type="submit" disabled={busy} className="rounded bg-indigo-700 px-3 py-2 text-sm text-white disabled:opacity-50">Send report</button>
    </form>}
    {message && <p role="alert" className="mt-2 text-sm text-red-700">{message}</p>}
  </section>;
}
