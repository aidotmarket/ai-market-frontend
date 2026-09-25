'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { confirmLicenseRecordDeletion, downloadLicenseRecordPdf, getLicenseRecord } from '@/api/licenseRecords';
import { formatDate } from '@/lib/format';
import type { LicenseRecord, LicenseRecordCovenantDocument, LicenseRecordIdentifiedParty, LicenseRecordLicenseDocument, LicenseRecordReferencedParty, LicenseRecordRiderDocument } from '@/types';

type RecordDocument = LicenseRecordLicenseDocument | LicenseRecordCovenantDocument | LicenseRecordRiderDocument;
type RecordParty = LicenseRecordIdentifiedParty | LicenseRecordReferencedParty;

function partyLabel(value: RecordParty, isViewer: boolean): string {
  if (isViewer && 'legal_name' in value) return `${value.legal_name} (${value.jurisdiction})`;
  if ('reference' in value) return value.reference;
  return 'Identified to ai.market for this order';
}

function DocumentSection({ document, title }: { document: RecordDocument; title: string }) {
  return (
    <section className="rounded-lg border border-gray-200 p-4">
      <h2 className="font-semibold text-gray-900">{title}</h2>
      <p className="mt-2 break-all font-mono text-xs text-gray-600">SHA-256: {document.sha256}</p>
      {document.text && <details className="mt-3"><summary className="cursor-pointer text-sm font-medium text-indigo-700">Read exact recorded text</summary><pre dir="auto" className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words [tab-size:4] text-xs leading-5 text-gray-800">{document.text}</pre></details>}
    </section>
  );
}

export default function LicenseRecordView({ party }: { party: 'buyer' | 'seller' }) {
  const { id } = useParams<{ id: string }>();
  const [record, setRecord] = useState<LicenseRecord | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [actionPending, setActionPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getLicenseRecord(id).then((value) => {
      if (!cancelled) { setRecord(value); setState('ready'); }
    }).catch(() => { if (!cancelled) setState('error'); });
    return () => { cancelled = true; };
  }, [id]);

  async function downloadPdf() {
    setActionPending(true);
    try {
      const blob = await downloadLicenseRecordPdf(id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `licence-record-${id}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setActionPending(false);
    }
  }

  async function confirmDeletion() {
    setActionPending(true);
    try {
      const confirmation = await confirmLicenseRecordDeletion(id);
      setRecord((current) => current ? {
        ...current,
        lifecycle_events: [...current.lifecycle_events, {
          event_type: 'deletion_confirmed', reason: null, actor_type: 'buyer',
          occurred_at: confirmation.occurred_at,
          deletion_due_at: null, metadata: null,
        }],
      } : current);
    } finally {
      setActionPending(false);
    }
  }

  if (state === 'loading') return <p className="text-sm text-gray-600">Loading licence record…</p>;
  if (state === 'error' || !record) return <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-800">The licence record is unavailable.</p>;

  const termination = record.lifecycle_events.find((event) => event.event_type === 'terminated');
  const deletionConfirmation = record.lifecycle_events.find((event) => event.event_type === 'deletion_confirmed');
  const canConfirmDeletion = party === 'buyer' && record.status === 'terminated' && !deletionConfirmation;
  const backHref = party === 'seller' ? '/dashboard/sales' : '/dashboard/orders';
  const backLabel = party === 'seller' ? 'sales' : 'purchases';

  return (
    <div className="space-y-6">
      <div>
        <Link href={backHref} className="text-sm text-indigo-700 underline">← Back to {backLabel}</Link>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div><h1 className="text-2xl font-bold text-gray-900">Licence record</h1><p className="mt-1 text-sm text-gray-600">{record.listing.title}</p></div>
          <button type="button" disabled={actionPending} onClick={downloadPdf} className="rounded-lg bg-[#3F51B5] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Download PDF</button>
        </div>
      </div>
      <dl className="grid gap-4 rounded-lg border border-gray-200 p-5 text-sm sm:grid-cols-2">
        <div><dt className="text-gray-500">Order</dt><dd className="mt-1 break-all font-mono text-gray-900">{record.order.number ?? record.order.id}</dd></div>
        <div><dt className="text-gray-500">Accepted</dt><dd className="mt-1 text-gray-900">{formatDate(record.signature.accepted_at)}</dd></div>
        <div><dt className="text-gray-500">Buyer</dt><dd className="mt-1 text-gray-900">{partyLabel(record.buyer, party === 'buyer')}</dd></div>
        <div><dt className="text-gray-500">Seller</dt><dd className="mt-1 text-gray-900">{partyLabel(record.seller, party === 'seller')}</dd></div>
        <div><dt className="text-gray-500">Signature</dt><dd className="mt-1 text-gray-900">{party === 'buyer' && 'typed_name' in record.signature ? (record.signature.typed_name ?? record.signature.principal_ref ?? record.signature.channel) : record.signature.channel}{party === 'buyer' && 'signer_title' in record.signature && record.signature.signer_title ? `, ${record.signature.signer_title}` : ''}</dd></div>
        <div><dt className="text-gray-500">Status</dt><dd className={`mt-1 font-semibold ${record.status === 'active' ? 'text-green-800' : 'text-red-800'}`}>{record.status === 'active' ? 'Active' : 'Terminated'}</dd></div>
      </dl>
      <p className="text-sm text-gray-700">{record.identity_notice}</p>
      {record.status === 'terminated' && (
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-5 text-sm text-amber-950">
          <h2 className="font-semibold">Deletion duty</h2>
          <p className="mt-2">The licence is terminated. Delete the dataset and all copies under your control{termination?.deletion_due_at ? ` by ${formatDate(termination.deletion_due_at)}` : ' within the recorded deadline'}.</p>
          {deletionConfirmation ? <p className="mt-2 font-medium">Deletion confirmed {formatDate(deletionConfirmation.occurred_at)}.</p> : canConfirmDeletion && <button type="button" disabled={actionPending} onClick={confirmDeletion} className="mt-3 rounded-lg bg-amber-900 px-4 py-2 font-medium text-white disabled:opacity-50">Confirm deletion</button>}
        </section>
      )}
      <DocumentSection document={record.license} title={`${record.license.code} licence v${record.license.version}`} />
      <DocumentSection document={record.covenant} title={`${record.covenant.code} covenant v${record.covenant.version}`} />
      {record.rider && <DocumentSection document={record.rider} title="AI-Training Rider" />}
      {record.fulfilment_history.length > 0 && <section><h2 className="font-semibold text-gray-900">Fulfilment history</h2><ul className="mt-2 list-disc pl-5 text-sm text-gray-700">{record.fulfilment_history.map((event, index) => <li key={`${event.event_type}-${event.created_at}-${index}`}>{event.event_type.replaceAll('_', ' ')} — {formatDate(event.created_at)}</li>)}</ul></section>}
    </div>
  );
}
