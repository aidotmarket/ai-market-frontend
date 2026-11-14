'use client';

import { useEffect, useRef, useState } from 'react';
import { getAcceptedLicenseDocument, NO_RECORDED_LICENSE_DOCUMENT, type AcceptedLicenseDocument as Document } from '@/api/licenseRecords';
import LicenseReadingDialog from '@/components/LicenseReadingDialog';

export default function AcceptedLicenseDocument({ orderId }: { orderId: string }) {
  const [document, setDocument] = useState<Document | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(false);
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => {
    const request = new AbortController();
    lifetime.current = request;
    getAcceptedLicenseDocument(orderId, false, request.signal).then(value => {
      if (!request.signal.aborted) { setDocument(value); setState(value === null ? 'missing' : 'ready'); }
    }).catch(() => { if (!request.signal.aborted) setState('error'); });
    return () => { request.abort(); lifetime.current = null; };
  }, [orderId]);
  useEffect(() => {
    if (document?.contentType !== 'application/pdf') return;
    const url = URL.createObjectURL(document.blob);
    setPdfUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [document]);

  async function download() {
    const request = lifetime.current;
    if (!request || request.signal.aborted || downloading) return;
    setDownloading(true); setDownloadError(false);
    try {
      const value = await getAcceptedLicenseDocument(orderId, true, request.signal);
      request.signal.throwIfAborted();
      if (!value) { setState('missing'); return; }
      const url = URL.createObjectURL(value.blob);
      const anchor = window.document.createElement('a');
      anchor.href = url; anchor.download = `order-${orderId}-licence.${value.contentType === 'application/pdf' ? 'pdf' : 'txt'}`;
      window.document.body.append(anchor);
      try { anchor.click(); } finally { anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
    } catch { if (!request.signal.aborted) setDownloadError(true); }
    finally { if (!request.signal.aborted) setDownloading(false); }
  }

  return <section aria-label="Accepted licence document" className="space-y-3 rounded-lg border border-gray-200 p-6">
    <h2 className="font-semibold">Accepted licence document</h2>
    {state === 'loading' && <p role="status">Loading accepted licence document…</p>}
    {state === 'missing' && <p role="status">{NO_RECORDED_LICENSE_DOCUMENT}</p>}
    {state === 'error' && <p role="status">Licence document unavailable. Contact support through your order.</p>}
    {state === 'ready' && <>
      {document?.text !== null && <pre className="whitespace-pre-wrap break-words text-sm">{document?.text}</pre>}
      {pdfUrl && <LicenseReadingDialog label="Read accepted licence PDF" href={pdfUrl} pdf />}
      <button type="button" disabled={downloading} onClick={download} className="text-indigo-700 underline disabled:opacity-50">{downloading ? 'Downloading licence…' : 'Download accepted licence'}</button>
    </>}
    {downloadError && <p role="alert">Licence document unavailable. Contact support through your order.</p>}
  </section>;
}
