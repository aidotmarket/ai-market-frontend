import type { Metadata } from 'next';
import { createHash } from 'node:crypto';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { MARKETPLACE_LISTING_COVENANT_PATH, STANDARD_DATA_LICENCE_PATH } from '@/lib/publicLegalDocuments';
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
  if (!markdown.startsWith(`# ai.market — Terms and Conditions\n\nEffective date: ${config.effective_at} · Version ${config.terms_version}\n`)) {
    throw new Error('Invalid current terms document');
  }

  return <main className="mx-auto max-w-3xl px-6 py-16 lg:py-24">
    <article className="prose max-w-none text-gray-700">
      <ReactMarkdown rehypePlugins={[rehypeSanitize]} components={{
        // Presentation only: keep the verified markdown and its acceptance hash intact.
        p: ({ children }) => {
          if (children === 'Listings without a chosen licence are offered under the ai.market Standard Data Licence with AI training permitted, and the seller accepts the ai.market Marketplace Listing Covenant for them.') {
            return <p>Listings without a chosen licence are offered under the ai.market <a href={STANDARD_DATA_LICENCE_PATH}>Standard Data Licence</a> with AI training permitted, and the seller accepts the ai.market <a href={MARKETPLACE_LISTING_COVENANT_PATH}>Marketplace Listing Covenant</a> for them.</p>;
          }
          return <p>{children}</p>;
        },
        h2: ({ children }) => children === '5. Commission, transaction costs, payment, and tax'
          ? <h2 id="fees" className="scroll-mt-24">{children}</h2>
          : <h2>{children}</h2>,
      }}>{markdown}</ReactMarkdown>
    </article>
    {config.terms_version === '1.2' && (
      <aside aria-labelledby="fee-explanation-heading" className="mt-8 space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-6 text-gray-700">
        <h2 id="fee-explanation-heading" className="text-lg font-semibold text-gray-900">Fees explained (not part of the Terms)</h2>
        <p><a className="text-indigo-700 underline" href="https://stripe.com/pricing" target="_blank" rel="noopener noreferrer">Stripe pricing</a></p>
        <p>Example: on a $1,000 sale, ai.market&apos;s 5% commission is $50 and the card fee is about 2.9% + 30¢ (about $29), so the seller receives about $921. This is an example; the actual card fee varies.</p>
      </aside>
    )}
  </main>;
}

function isTermsConfig(value: unknown): value is {
  terms_version: '1.1' | '1.2';
  terms_hash_sha256: string;
  effective_at: string;
  text_url: '/api/v1/legal/terms/document';
} {
  if (!value || typeof value !== 'object') return false;
  const config = value as Record<string, unknown>;
  return (config.terms_version === '1.1' || config.terms_version === '1.2') &&
    typeof config.terms_hash_sha256 === 'string' && /^[a-f0-9]{64}$/.test(config.terms_hash_sha256) &&
    typeof config.effective_at === 'string' && config.effective_at.length > 0 &&
    config.text_url === '/api/v1/legal/terms/document';
}
