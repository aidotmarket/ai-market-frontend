'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { confirmLicenseRecordDeletion, downloadLicenseRecordPdf, getLicenseRecord } from '@/api/licenseRecords';
import { formatDate } from '@/lib/format';
import type { LicenseRecord, LicenseRecordDocument } from '@/types';

function RecordDocument({ document }: { document: LicenseRecordDocument }) {
  return (
    <section className="rounded-lg border border-gray-200 p-4">
      <h2 className="font-semibold text-gray-900">{document.title}</h2>
      <p className="mt-2 break-all font-mono text-xs text-gray-600">SHA-256: {document.sha256}</p>
      {document.text && <details className="mt-3"><summary className="cursor-pointer text-sm font-medium text-indigo-700">Read exact recorded text</summary><pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap text-xs leading-5 text-gray-800">{document.text}</pre></details>}
      {document.download_url && <a href={document.download_url} className="mt-3 inline-block text-sm font-medium text-indigo-700 underline">Download recorded document</a>}
    </section>
  );
}

export default function LicenseRecordPage() {
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
    try { setRecord(await confirmLicenseRecordDeletion(id)); }
    finally { setActionPending(false); }
  }

  if (state === 'loading') return <p className="text-sm text-gray-600">Loading licence record…</p>;
  if (state === 'error' || !record) return <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-800">The licence record is unavailable.</p>;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/orders" className="text-sm text-indigo-700 underline">← Back to purchases</Link>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div><h1 className="text-2xl font-bold text-gray-900">Licence record</h1><p className="mt-1 text-sm text-gray-600">{record.listing_title}</p></div>
          <button type="button" disabled={actionPending} onClick={downloadPdf} className="rounded-lg bg-[#3F51B5] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Download PDF</button>
        </div>
      </div>
      <dl className="grid gap-4 rounded-lg border border-gray-200 p-5 text-sm sm:grid-cols-2">
        <div><dt className="text-gray-500">Order</dt><dd className="mt-1 break-all font-mono text-gray-900">{record.order_id}</dd></div>
        <div><dt className="text-gray-500">Accepted</dt><dd className="mt-1 text-gray-900">{formatDate(record.accepted_at)}</dd></div>
        <div><dt className="text-gray-500">Buyer</dt><dd className="mt-1 text-gray-900">{record.buyer.legal_name} ({record.buyer.jurisdiction})</dd></div>
        <div><dt className="text-gray-500">Seller</dt><dd className="mt-1 text-gray-900">{record.seller.legal_name} ({record.seller.jurisdiction})</dd></div>
        <div><dt className="text-gray-500">Signature</dt><dd className="mt-1 text-gray-900">{record.typed_name ?? record.principal_ref ?? record.channel}{record.signer_title ? `, ${record.signer_title}` : ''}</dd></div>
        <div><dt className="text-gray-500">Status</dt><dd className={`mt-1 font-semibold ${record.status === 'active' ? 'text-green-800' : 'text-red-800'}`}>{record.status === 'active' ? 'Active' : 'Terminated'}</dd></div>
      </dl>
      {record.status === 'terminated' && (
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-5 text-sm text-amber-950">
          <h2 className="font-semibold">Deletion duty</h2>
          <p className="mt-2">The licence is terminated. Delete the dataset and all copies under your control{record.deletion_due_at ? ` by ${formatDate(record.deletion_due_at)}` : ' within the recorded deadline'}.</p>
          {record.deletion_confirmed_at ? <p className="mt-2 font-medium">Deletion confirmed {formatDate(record.deletion_confirmed_at)}.</p> : record.deletion_confirmation_available && <button type="button" disabled={actionPending} onClick={confirmDeletion} className="mt-3 rounded-lg bg-amber-900 px-4 py-2 font-medium text-white disabled:opacity-50">Confirm deletion</button>}
        </section>
      )}
      <RecordDocument document={record.license} />
      <RecordDocument document={record.covenant} />
      {record.rider && <RecordDocument document={record.rider} />}
      {record.delivered_versions && record.delivered_versions.length > 0 && <section><h2 className="font-semibold text-gray-900">Delivered versions</h2><ul className="mt-2 list-disc pl-5 text-sm text-gray-700">{record.delivered_versions.map((version) => <li key={version.id}>{version.label ?? version.id}{version.delivered_at ? ` — ${formatDate(version.delivered_at)}` : ''}</li>)}</ul></section>}
    </div>
  );
}
