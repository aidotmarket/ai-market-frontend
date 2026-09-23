import type { Metadata } from 'next';
import { createHash } from 'node:crypto';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import StaticTerms from './StaticTerms';

export const metadata: Metadata = {
  title: 'Terms and Conditions — ai.market',
  description: 'Terms and Conditions — ai.market',
  alternates: { canonical: '/legal/terms' },
};

export default async function TermsAndConditionsPage() {
  const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) throw new Error('API_URL is required for the terms page');
  const response = await fetch(`${apiUrl.replace(/\/$/, '')}/api/v1/legal/terms/current`, { cache: 'no-store' });
  if (response.status === 404) return <StaticTerms />;
  if (!response.ok) throw new Error('Current terms are unavailable');
  const config: unknown = await response.json();
  if (!isTermsConfig(config)) throw new Error('Invalid current terms response');
  const document = await fetch(`${apiUrl.replace(/\/$/, '')}${config.text_url}`, { cache: 'no-store' });
  if (!document.ok) throw new Error('Current terms document is unavailable');
  const markdown = await document.text();
  if (createHash('sha256').update(markdown, 'utf8').digest('hex') !== config.terms_hash_sha256) {
    throw new Error('Current terms document hash mismatch');
  }
  if (!markdown.startsWith(`# ai.market — Terms and Conditions\n\nEffective date: ${config.effective_at} · Version 1.1\n`)) {
    throw new Error('Invalid current terms document');
  }

  return <main className="mx-auto max-w-3xl px-6 py-16 lg:py-24">
    <article className="prose max-w-none text-gray-700">
      <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{markdown}</ReactMarkdown>
    </article>
  </main>;
}

function isTermsConfig(value: unknown): value is {
  terms_version: '1.1';
  terms_hash_sha256: string;
  effective_at: string;
  text_url: '/api/v1/legal/terms/document';
} {
  if (!value || typeof value !== 'object') return false;
  const config = value as Record<string, unknown>;
  return config.terms_version === '1.1' &&
    typeof config.terms_hash_sha256 === 'string' && /^[a-f0-9]{64}$/.test(config.terms_hash_sha256) &&
    typeof config.effective_at === 'string' && config.effective_at.length > 0 &&
    config.text_url === '/api/v1/legal/terms/document';
}
