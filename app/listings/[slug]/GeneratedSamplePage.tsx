import Link from 'next/link';
import type { ListingDetail } from '@/types';
import {
  samplePresentation, sampleStandardDocument, STANDARD_DOCUMENTS,
  SAMPLE_DATA_COPY, SAMPLE_MODEL_COPY, SAMPLE_STANDARD_COPY,
} from '@/lib/generatedSample';

export default function GeneratedSamplePage({ listing, emitJsonLd }: { listing: ListingDetail; emitJsonLd: boolean }) {
  const safe = samplePresentation(listing);
  const valid = safe.state === 'sample';
  const document = valid ? sampleStandardDocument(listing.license) : null;
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'CreativeWork',
    name: safe.title, description: safe.description,
    url: `https://ai.market/listings/${listing.slug}`,
    ...(document ? { license: document } : {}),
  };
  return <>
    {emitJsonLd && !listing.noindex && <script type="application/ld+json" dangerouslySetInnerHTML={{__html: JSON.stringify(jsonld).replace(/</g, '\\u003c')}} />}
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <Link href="/listings" className="text-indigo-700">Listings</Link>
      <h1 className="text-3xl font-bold">{safe.title}</h1>
      <p role="status" className="rounded-lg bg-gray-50 p-4">{safe.description}</p>
      {valid && <>
        <p className="font-semibold">Not for sale</p>
        <p>{SAMPLE_DATA_COPY}</p>
        <p>{SAMPLE_MODEL_COPY}</p>
        <section className="space-y-3" aria-label="Illustrative content licence reference">
          <h2 className="font-semibold">{SAMPLE_STANDARD_COPY}</h2>
          <p>Standard applies only to our generated illustrative listing content. It does not relicense third-party data, model weights, APIs or trademarks.</p>
          {!document && <p>No contractual variant is established by viewing this example. These are document references for comparison.</p>}
          {(document ? [document] : STANDARD_DOCUMENTS).map(url => <p key={url}><Link href={url} className="text-indigo-700 underline">Standard 1.0 — {url.endsWith('/no-ai-training') ? 'no AI training' : 'AI training'}</Link></p>)}
        </section>
      </>}
    </main>
  </>;
}
