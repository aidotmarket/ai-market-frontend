import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

type Props = { params: Promise<{ parts: string[] }> };
type StockDocument = {
  code: string;
  version: string;
  variant: string | null;
  summary: string[];
  full_text: string;
  sha256: string;
};
type CustomNotice = { code: 'custom'; sha256: string; notice: string };

const hashPattern = /^[a-f0-9]{64}$/;
const stockPaths = new Set([
  'standard/1.0/ai-training',
  'standard/1.0/no-ai-training',
  'marketplace-listing/1.0',
  'ai-training-rider/1.0/permitted',
  'ai-training-rider/1.0/not-permitted',
]);

async function getDocument(parts: string[]): Promise<StockDocument | CustomNotice> {
  const path = parts.join('/');
  const custom = parts.length === 2 && parts[0] === 'custom' && hashPattern.test(parts[1]);
  if (!custom && !stockPaths.has(path)) notFound();
  const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) throw new Error('API_URL is required for public licence pages');
  const suffix = custom ? '' : '?format=json';
  const response = await fetch(`${apiUrl}/api/v1/licenses/${path}${suffix}`, { next: { revalidate: 3600 } });
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error('The licence document is unavailable');
  const data: unknown = await response.json();
  if (custom) {
    if (!isRecord(data) || data.code !== 'custom' || data.sha256 !== parts[1] || typeof data.notice !== 'string') {
      throw new Error('Invalid custom licence notice response');
    }
    return data as CustomNotice;
  }
  if (!isRecord(data) || data.code !== parts[0] || data.version !== parts[1] ||
      data.variant !== (parts[2] ?? null) || !Array.isArray(data.summary) ||
      !data.summary.every((line: unknown) => typeof line === 'string') ||
      typeof data.full_text !== 'string' || typeof data.sha256 !== 'string' || !hashPattern.test(data.sha256)) {
    throw new Error('Invalid licence document response');
  }
  return data as StockDocument;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { parts } = await params;
  const document = await getDocument(parts);
  const title = 'notice' in document ? "Seller's own licence notice" : `${document.code === 'standard' ? 'Standard Data Licence' : document.code === 'marketplace-listing' ? 'Marketplace Listing Covenant' : 'AI-Training Rider'} v${document.version}`;
  return { title: `${title} — ai.market`, alternates: { canonical: `https://ai.market/licenses/${parts.join('/')}` } };
}

export default async function LicencePage({ params }: Props) {
  const { parts } = await params;
  const document = await getDocument(parts);
  if ('notice' in document) {
    return <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold text-gray-900">Seller&apos;s own licence</h1>
      <p className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-5 text-amber-950">{document.notice}</p>
      <p className="mt-6 break-all text-sm text-gray-600">SHA-256: <code>{document.sha256}</code></p>
      <p className="mt-4 text-sm text-gray-700">Read the full document from the listing, subject to its visibility and access rules.</p>
    </main>;
  }
  const title = document.code === 'standard' ? 'ai.market Standard Data Licence' : document.code === 'marketplace-listing' ? 'ai.market Marketplace Listing Covenant' : 'ai.market AI-Training Rider';
  return <main className="mx-auto max-w-3xl px-6 py-16">
    <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
    <p className="mt-2 text-sm text-gray-600">Version {document.version}{document.variant ? ` · ${document.variant.replaceAll('-', ' ')}` : ''}</p>
    <section className="mt-8 rounded-xl border border-gray-200 bg-gray-50 p-6" aria-label="Licence summary">
      <h2 className="text-xl font-semibold text-gray-900">Major points</h2>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-gray-700">{document.summary.map((line) => <li key={line}>{line}</li>)}</ul>
    </section>
    <section className="mt-10" aria-label="Full licence text">
      <h2 className="text-xl font-semibold text-gray-900">Full text</h2>
      <pre className="mt-4 whitespace-pre-wrap break-words font-sans leading-7 text-gray-700">{document.full_text}</pre>
    </section>
    <p className="mt-8 break-all text-sm text-gray-600">SHA-256: <code>{document.sha256}</code></p>
    <a className="mt-4 inline-block text-indigo-700 underline" href={`${process.env.NEXT_PUBLIC_API_URL || process.env.API_URL}/api/v1/licenses/${parts.join('/')}?download=1`}>Download exact document</a>
  </main>;
}
