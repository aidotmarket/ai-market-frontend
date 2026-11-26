'use client';

import {useId, useLayoutEffect, useRef, useState} from 'react';
import BackendListingHtml from '@/components/BackendListingHtml';
import {selectListingDocumentation} from '@/lib/listingDocumentation';
import type {ListingDocument} from '@/types/listingDocuments';

function TechnicalDocument({document}: {document: ListingDocument}) {
  const uid = useId();
  const content = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [long, setLong] = useState(false);
  useLayoutEffect(() => {
    const element = content.current;
    if (!element) return;
    const measure = () => setLong(element.scrollHeight > 600);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <article id="technical-documentation" className="scroll-mt-24 space-y-3">
    <h3 className="text-lg font-semibold">{document.title}</h3>
    <div id={uid} ref={content} className={expanded ? '' : 'max-h-[600px] overflow-hidden'}>
      <BackendListingHtml description={document.body_markdown ?? ''} descriptionHtml={document.body_html}/>
    </div>
    {long && <button type="button" aria-controls={uid} aria-expanded={expanded} onClick={() => setExpanded(value => !value)} className="text-sm font-medium text-indigo-700 underline">{expanded ? 'Show less documentation' : 'Show full documentation'}</button>}
  </article>;
}

export default function ListingDocumentation({documents}: {documents: ListingDocument[]}) {
  const {technical, pdf} = selectListingDocumentation(documents);
  if (!technical && !pdf) return null;
  return <section id="listing-documentation" aria-label="Documentation" className="scroll-mt-24 space-y-5">
    <h2 className="text-xl font-semibold text-gray-900">Documentation</h2>
    {technical && <TechnicalDocument key={technical.revision} document={technical}/>}
    {pdf && <article className="space-y-3 rounded-xl border border-gray-200 p-5">
      <h3 className="font-semibold">{pdf.title}</h3>
      <p className="text-sm">Data sheet (PDF, {Number(((pdf.pdf_size_bytes ?? 0) / 1024).toFixed(1)) < 1024 ? `${((pdf.pdf_size_bytes ?? 0) / 1024).toFixed(1)} KB` : `${((pdf.pdf_size_bytes ?? 0) / 1024 / 1024).toFixed(1)} MB`}) — hosted by the seller, not ai.market</p>
      <p className="break-words text-sm">{pdf.pdf_filename} · {pdf.pdf_size_bytes?.toLocaleString('en-US')} bytes</p>
      <details className="text-sm"><summary className="cursor-pointer font-medium">Check this file</summary><p className="mt-2 break-all">SHA-256: {pdf.pdf_sha256}</p></details>
      <a href={pdf.pdf_url} target="_blank" rel="noopener noreferrer nofollow ugc" referrerPolicy="no-referrer" className="inline-block text-sm font-medium text-indigo-700 underline">Open data sheet (PDF, new tab)</a>
    </article>}
  </section>;
}
