'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ListingLicenseDetails } from '@/types';
import { api } from '@/api/client';
import {hashLicenseComponentBytes, sha256, verifyCustomText} from '@/lib/customLicenseVerification';
export {hashLicenseComponentBytes} from '@/lib/customLicenseVerification';

const STANDARD_NOTICE = 'ai.market standard terms — the same balanced terms every seller on ai.market uses. ai.market is not a party and gives no legal advice.';
const CUSTOM_NOTICE = "The seller's own terms. ai.market did not write these; review them before you accept. The separate ai.market AI-Training Rider and Marketplace Listing Covenant also form part of your record. ai.market is not a party and gives no legal advice.";

type ComponentKind = 'license' | 'covenant' | 'rider';

interface DocumentReference {
  kind: ComponentKind;
  label: string;
  canonicalUrl: string;
  downloadUrl: string;
  sha256: string;
  code: string;
  version: string;
  params: Record<string, string | boolean>;
}

interface LoadedDocument extends DocumentReference {
  state: 'loading' | 'matched' | 'mismatch' | 'error';
  text: string | null;
  objectUrl?: string;
  verifiedMediaType?: 'text/plain' | 'application/pdf';
}

const CUSTOM_TEXT_CONTENT_TYPE = 'text/plain; charset=utf-8';

export function customTextMetadataMatches(headers: Record<string, unknown>, reference: DocumentReference): boolean {
  // Cross-origin reads depend on the backend exposing Content-Disposition,
  // X-License-Sha256 and X-License-Source-Sha256 through CORS expose_headers.
  // Missing browser-visible headers must fail closed, even when bytes match.
  const listingId = reference.downloadUrl.match(/\/listings\/([^/?#]+)\/license-document\?download=1$/)?.[1];
  return headers['content-type'] === CUSTOM_TEXT_CONTENT_TYPE &&
    headers['x-content-type-options'] === 'nosniff' &&
    headers['cache-control'] === 'private, no-store' &&
    Boolean(listingId) &&
    headers['content-disposition'] === `attachment; filename="listing-${listingId}-licence.txt"` &&
    headers['x-license-source-sha256'] === reference.params.source_sha256 &&
    headers['x-license-sha256'] === reference.sha256;
}

function canonicalJson(value: Record<string, string | boolean>): string {
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key.normalize('NFC'))}:${JSON.stringify(
    typeof value[key] === 'string' ? value[key].normalize('NFC') : value[key],
  )}`).join(',')}}`;
}

export async function fetchedBytesMatch(
  bytes: Uint8Array,
  contentType: string,
  reference: DocumentReference,
): Promise<boolean> {
  let canonicalBytes = bytes;
  const mediaType = contentType.split(';')[0].trim().toLowerCase();
  const sourceSha256 = reference.params.source_sha256;
  if (reference.kind === 'license' && reference.code === 'custom' && mediaType === 'text/plain') {
    return typeof sourceSha256 === 'string' && typeof reference.params.ai_training === 'boolean' &&
      await verifyCustomText(bytes, sourceSha256, reference.sha256, reference.params.ai_training) !== null;
  }
  const pdfCanonicalBytes = typeof sourceSha256 === 'string' && /^[a-f0-9]{64}$/.test(sourceSha256)
    ? new TextEncoder().encode(`${canonicalJson({content_type: 'application/pdf', source_sha256: sourceSha256})}\n`)
    : null;
  const expectsPdf = reference.kind === 'license' && reference.code === 'custom' && pdfCanonicalBytes !== null &&
    await hashLicenseComponentBytes(pdfCanonicalBytes, reference) === reference.sha256;
  if (expectsPdf && mediaType === 'application/pdf') {
    if (typeof sourceSha256 !== 'string' ||
      await sha256(bytes) !== sourceSha256) return false;
    canonicalBytes = pdfCanonicalBytes!;
  } else if (expectsPdf || mediaType === 'application/pdf') {
    return false;
  }
  return await hashLicenseComponentBytes(canonicalBytes, reference) === reference.sha256;
}

function documentLocation(url: string): { href: string; apiPath?: string } {
  try {
    const parsed = new URL(url, 'https://ai.market');
    if (parsed.pathname.startsWith('/api/v1/') && (url.startsWith('/api/v1/') || parsed.origin === 'https://ai.market')) {
      return {
        href: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}${parsed.pathname}${parsed.search}`,
        apiPath: `${parsed.pathname.slice('/api/v1'.length)}${parsed.search}`,
      };
    }
    if (parsed.origin === 'https://ai.market' && parsed.pathname.startsWith('/licenses/')) {
      return { href: `${parsed.pathname}${parsed.search}` };
    }
  } catch {
    // The fetch below owns invalid URL handling and reports a verification error.
  }
  return { href: url };
}

function referencesFor(license: ListingLicenseDetails): DocumentReference[] {
  const aiTraining = license.params.ai_training;
  const references: DocumentReference[] = [{
    kind: 'license',
    label: license.code === 'standard' ? 'ai.market Standard Data Licence v1.0' : "Seller's own licence",
    canonicalUrl: license.full_text_url,
    downloadUrl: license.download_url,
    sha256: license.sha256,
    code: license.code,
    version: license.version,
    params: license.params,
  }, {
    kind: 'covenant',
    label: 'ai.market Marketplace Listing Covenant v1.0',
    canonicalUrl: '/licenses/marketplace-listing/1.0',
    downloadUrl: '/licenses/marketplace-listing/1.0?download=1',
    sha256: license.covenant_sha256,
    code: 'marketplace-listing',
    version: '1.0',
    params: {},
  }];
  if (license.rider_sha256) {
    const variant = aiTraining ? 'permitted' : 'not-permitted';
    references.push({
      kind: 'rider',
      label: `ai.market AI-Training Rider v1.0 — ${aiTraining ? 'Permitted' : 'Not permitted'}`,
      canonicalUrl: `/licenses/ai-training-rider/1.0/${variant}`,
      downloadUrl: `/licenses/ai-training-rider/1.0/${variant}?download=1`,
      sha256: license.rider_sha256,
      code: 'ai-training',
      version: '1.0',
      params: { ai_training: aiTraining },
    });
  }
  return references;
}

export default function ListingLicenseDisclosure({
  license,
  compact = false,
  onVerificationChange,
}: {
  license: ListingLicenseDetails;
  compact?: boolean;
  onVerificationChange?: (verified: boolean) => void;
}) {
  const references = useMemo(() => referencesFor(license), [license]);
  const [documents, setDocuments] = useState<LoadedDocument[]>(() => references.map((reference) => ({
    ...reference, state: 'loading', text: null,
  })));

  useEffect(() => {
    let cancelled = false;
    const objectUrls: string[] = [];
    setDocuments(references.map((reference) => ({ ...reference, state: 'loading', text: null })));
    onVerificationChange?.(false);
    void Promise.all(references.map(async (reference): Promise<LoadedDocument> => {
      try {
        const location = documentLocation(reference.downloadUrl);
        let bytes: Uint8Array;
        let contentType: string;
        let responseHeaders: Record<string, unknown>;
        if (location.apiPath) {
          const response = await api.get<ArrayBuffer>(location.apiPath, { responseType: 'arraybuffer', headers: { 'Cache-Control': 'no-store' } });
          bytes = new Uint8Array(response.data);
          responseHeaders = response.headers as Record<string, unknown>;
          contentType = String(responseHeaders['content-type'] ?? '');
        } else {
          const response = await fetch(location.href, { credentials: 'include', cache: 'no-store' });
          if (!response.ok) throw new Error('document fetch failed');
          bytes = new Uint8Array(await response.arrayBuffer());
          responseHeaders = Object.fromEntries(response.headers.entries());
          contentType = String(responseHeaders['content-type'] ?? '');
        }
        const customText = reference.kind === 'license' && reference.code === 'custom' && contentType !== 'application/pdf';
        const matched = (!customText || customTextMetadataMatches(responseHeaders, reference)) &&
          await fetchedBytesMatch(bytes, contentType, reference);
        const verifiedMediaType = matched && reference.kind === 'license' && reference.code === 'custom'
          ? contentType.split(';')[0].trim().toLowerCase() as 'text/plain' | 'application/pdf'
          : undefined;
        const objectUrl = matched && !cancelled && reference.kind === 'license' && reference.code === 'custom'
          ? URL.createObjectURL(new Blob([bytes.slice().buffer as ArrayBuffer], { type: contentType }))
          : undefined;
        if (objectUrl) objectUrls.push(objectUrl);
        return {
          ...reference,
          state: matched ? 'matched' : 'mismatch',
          text: matched && !contentType.toLowerCase().includes('application/pdf') ? new TextDecoder('utf-8', {fatal: true}).decode(bytes) : null,
          objectUrl,
          verifiedMediaType,
        };
      } catch {
        return { ...reference, state: 'error', text: null };
      }
    })).then((loaded) => {
      if (cancelled) return;
      setDocuments(loaded);
      onVerificationChange?.(loaded.every((document) => document.state === 'matched'));
    });
    return () => {
      cancelled = true;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [onVerificationChange, references]);

  const standard = license.code === 'standard';
  return (
    <section aria-label="Licence terms" className={`${compact ? 'space-y-3' : 'space-y-4 rounded-xl border border-gray-200 p-5'}`}>
      <div className={`rounded-lg p-4 text-sm ${standard ? 'bg-green-50 text-green-900' : 'bg-amber-50 text-amber-950'}`}>
        {standard ? STANDARD_NOTICE : CUSTOM_NOTICE}
      </div>
      <div>
        <h2 className={`${compact ? 'text-base' : 'text-lg'} font-semibold text-gray-900`}>Licence summary — not the contract</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-gray-700">
          {license.summary.map((line) => <li key={line}>{line}</li>)}
        </ul>
      </div>
      <p className={`rounded-lg border px-4 py-3 text-sm font-semibold ${license.params.ai_training ? 'border-green-300 bg-green-50 text-green-900' : 'border-amber-300 bg-amber-50 text-amber-950'}`}>
        AI/ML training is {license.params.ai_training ? 'permitted' : 'not permitted'} for this listing.
      </p>
      <div className="space-y-3">
        {documents.map((document) => {
          const customDocument = document.kind === 'license' && document.code === 'custom';
          const canonicalHref = customDocument ? document.objectUrl : documentLocation(document.canonicalUrl).href;
          const downloadHref = customDocument ? document.objectUrl : documentLocation(document.downloadUrl).href;
          return (
          <div key={document.kind} className="rounded-lg border border-gray-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-gray-900">{document.label}</h3>
                {canonicalHref
                  ? <a href={canonicalHref} target="_blank" rel="noreferrer" className="break-all text-xs text-indigo-700 underline">{document.canonicalUrl}</a>
                  : <span className="break-all text-xs text-gray-600">{document.canonicalUrl}</span>}
              </div>
              <span role="status" className={`text-xs font-medium ${document.state === 'matched' ? 'text-green-800' : document.state === 'loading' ? 'text-gray-500' : 'text-red-800'}`}>
                {document.state === 'matched' ? 'Fetched bytes match the server hash' : document.state === 'loading' ? 'Verifying fetched bytes…' : document.state === 'mismatch' ? 'Hash mismatch — do not accept' : 'Could not verify — do not accept'}
              </span>
            </div>
            <p className="mt-2 break-all font-mono text-[11px] text-gray-600">SHA-256: {document.sha256}</p>
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              {document.text && <details className="w-full rounded border border-gray-100 p-3"><summary className="cursor-pointer font-medium text-indigo-700">Read full text</summary><pre dir="auto" className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words [tab-size:4] text-xs leading-5 text-gray-800">{document.text}</pre></details>}
              {downloadHref
                ? <a href={downloadHref} download={customDocument ? `custom-licence.${document.verifiedMediaType === 'application/pdf' ? 'pdf' : 'txt'}` : true} className="font-medium text-indigo-700 underline">Download exact document</a>
                : <span className="font-medium text-gray-500">Download exact document</span>}
            </div>
          </div>
          );
        })}
      </div>
    </section>
  );
}
