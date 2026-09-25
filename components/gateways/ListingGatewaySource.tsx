'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { gatewayErrorCode } from '@/api/gatewayDelivery';
import { listGatewayFiles, listSellerGateways, saveGatewayListingSource } from '@/api/sellerGateways';
import { blockerMessage } from './presentation';
import type { GatewayFile, SellerGateway } from '@/types/sellerGateway';

const saveErrors: Record<string, string> = {
  invalid_gateway_source: 'Choose a gateway and 1 to 200 different files.',
  gateway_not_found: 'This gateway is no longer available. Choose another gateway.',
  listing_not_found: 'This listing is no longer available. Return to your listings.',
  file_not_found: 'A selected file is no longer available. Refresh the gateway files.',
  listing_not_draft: 'Only a draft listing can change its gateway source.',
};

function fileBlocker(file: GatewayFile) {
  if (!file.present) return { code: 'file_missing', file_id: file.file_id };
  if (file.description.state === 'stale') return { code: 'file_stale', file_id: file.file_id };
  return { code: 'file_not_described', file_id: file.file_id };
}

export default function ListingGatewaySource({ listingId, onSourceSaved, onGatewayChosen }: {
  listingId: string;
  onSourceSaved: (gateway: SellerGateway, files: GatewayFile[]) => void;
  onGatewayChosen: (gateway: SellerGateway | null) => void;
}) {
  const [gateways, setGateways] = useState<SellerGateway[] | null>(null);
  const [gatewayId, setGatewayId] = useState('');
  const [files, setFiles] = useState<GatewayFile[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [saving, setSaving] = useState(false);
  const gateway = gateways?.find(item => item.gateway_id === gatewayId);

  useEffect(() => {
    let active = true;
    listSellerGateways().then(items => { if (active) setGateways(items); }).catch(() => { if (active) setGateways(null); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    onGatewayChosen(gateway ?? null);
  }, [gateway, onGatewayChosen]);

  useEffect(() => {
    if (!gatewayId || !gateway) return;
    let active = true;
    setFiles([]); setCursor(null); setLoadingFiles(true); setError(null);
    listGatewayFiles(gatewayId).then(page => {
      if (!active) return;
      setFiles(page.files); setCursor(page.next_cursor);
    }).catch(() => { if (active) setError('We could not load this gateway’s files. Try again.'); })
      .finally(() => { if (active) setLoadingFiles(false); });
    return () => { active = false; };
  }, [gatewayId, gateway]);

  if (!gateways) return null;
  const selectedFiles = files.filter(file => selected.includes(file.file_id));
  const gatewayLink = `/dashboard/gateways/${encodeURIComponent(gatewayId)}`;

  async function loadMore() {
    if (!cursor) return;
    setLoadingFiles(true); setError(null);
    try {
      const page = await listGatewayFiles(gatewayId, cursor);
      setFiles(current => [...current, ...page.files]); setCursor(page.next_cursor);
    } catch { setError('We could not load more files. Try again.'); }
    finally { setLoadingFiles(false); }
  }

  async function save() {
    if (!gateway || selected.length < 1 || selected.length > 200) {
      setError(saveErrors.invalid_gateway_source); return;
    }
    setSaving(true); setError(null);
    try {
      await saveGatewayListingSource(listingId, { type: 'gateway', gateway_id: gatewayId, file_ids: selected });
      setSaved(true);
      onSourceSaved(gateway, selectedFiles);
    } catch (cause) {
      setError(saveErrors[gatewayErrorCode(cause) ?? ''] ?? 'We could not save the gateway source. Try again.');
    } finally { setSaving(false); }
  }

  return <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-6">
    <h2 className="text-lg font-semibold">Deliver from a gateway</h2>
    <label className="block">Gateway
      <select aria-label="Gateway" className="mt-1 block w-full rounded border p-2" value={gatewayId} disabled={saving || loadingFiles} onChange={event => {
        setGatewayId(event.target.value); setSelected([]); setSaved(false); setFiles([]); setCursor(null); setError(null);
      }}>
        <option value="">Choose a gateway</option>
        {gateways.map(item => <option key={item.gateway_id} value={item.gateway_id}>{item.name}</option>)}
      </select>
    </label>
    {gateway && <>
      <p>Gateway status: {gateway.status}. {gateway.can_publish ? 'Ready to publish.' : 'Publishing needs attention.'} <Link className="text-indigo-700 underline" href={gatewayLink}>Open gateway</Link></p>
      {gateway.blockers.filter(blocker => !blocker.file_id).length > 0 && <ul className="list-disc pl-6">{gateway.blockers.filter(blocker => !blocker.file_id).map((blocker, index) => <li key={`${blocker.code}-${index}`}>{blockerMessage(blocker, files)}</li>)}</ul>}
      <div className="space-y-2">
        <h3 className="font-medium">Files</h3>
        {files.map(file => <label key={file.file_id} className="flex gap-2 rounded border p-2">
          <input type="checkbox" checked={selected.includes(file.file_id)} disabled={saving} onChange={() => {
            setSelected(current => current.includes(file.file_id) ? current.filter(id => id !== file.file_id) : [...current, file.file_id]); setSaved(false);
          }} />
          <span><strong>{file.display_name}</strong> · {file.size_bytes.toLocaleString()} bytes · {file.media_type} · Description: {file.description.state} · Offerable: {file.offerable ? 'Yes' : 'No'}
            {selected.includes(file.file_id) && !file.offerable && <span className="block text-amber-800">{blockerMessage(fileBlocker(file), files)} <Link className="underline" href={gatewayLink}>Review gateway file</Link></span>}
          </span>
        </label>)}
        {cursor && <button type="button" className="rounded border px-3 py-2" disabled={loadingFiles || saving} onClick={loadMore}>Load more files</button>}
        {loadingFiles && <p>Loading files…</p>}
      </div>
      <button type="button" className="rounded border px-3 py-2" disabled={saving || selected.length === 0 || selected.length > 200} onClick={save}>Save gateway source</button>
      {saved && <p role="status">Gateway source saved. This selection is shown only during this session because listing details do not return the saved gateway source.</p>}
    </>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
  </section>;
}
