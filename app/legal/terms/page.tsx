import type { Metadata } from 'next';
import { createHash } from 'node:crypto';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';

export const metadata: Metadata = {
  title: 'Terms and Conditions — ai.market',
  description: 'Terms and Conditions — ai.market',
  alternates: { canonical: '/legal/terms' },
};

export default async function TermsAndConditionsPage() {
  const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) throw new Error('API_URL is required for the terms page');
  const response = await fetch(`${apiUrl}/api/v1/legal/terms/current`, { cache: 'no-store' });
  if (!response.ok) throw new Error('Current terms are unavailable');
  const config: unknown = await response.json();
  if (!isTermsConfig(config)) throw new Error('Invalid current terms response');

  let markdown: string;
  if ('markdown' in config) {
    markdown = config.markdown;
  } else {
    if (config.text_url !== '/api/v1/legal/terms/document') throw new Error('Invalid terms document URL');
    const document = await fetch(`${apiUrl}${config.text_url}`, { cache: 'no-store' });
    if (!document.ok) throw new Error('Current terms document is unavailable');
    markdown = await document.text();
  }
  if (createHash('sha256').update(markdown, 'utf8').digest('hex') !== config.terms_hash_sha256) {
    throw new Error('Current terms document hash mismatch');
  }

  return <main className="mx-auto max-w-3xl px-6 py-16 lg:py-24">
    <h1 className="mb-2 text-3xl font-bold text-gray-900">ai.market — Terms and Conditions</h1>
    <p className="mb-6 text-sm text-gray-500">
      Version {config.terms_version}
      {config.effective_at && ` · Effective ${config.effective_at}`}
    </p>
    <article className="prose max-w-none text-gray-700">
      <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{markdown}</ReactMarkdown>
    </article>
  </main>;
}

function isTermsConfig(value: unknown): value is {
  terms_version: string;
  terms_hash_sha256: string;
  effective_at: string | null;
} & ({ markdown: string } | { text_url: string }) {
  if (!value || typeof value !== 'object') return false;
  const config = value as Record<string, unknown>;
  return typeof config.terms_version === 'string' &&
    typeof config.terms_hash_sha256 === 'string' && /^[a-f0-9]{64}$/.test(config.terms_hash_sha256) &&
    (config.effective_at === null || typeof config.effective_at === 'string') &&
    (typeof config.markdown === 'string' || typeof config.text_url === 'string');
}
