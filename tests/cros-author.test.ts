import { expect, it } from 'vitest';
import { getPostBySlug } from '@/lib/blog';
import { generateMetadata } from '@/app/blog/[slug]/page';

it('attributes the CROs post and its OpenGraph author to Max Robbins', async () => {
  const post = getPostBySlug('CROs');
  expect(post?.author).toBe('Max Robbins');
  expect(post?.content).toContain('Max Robbins, CEO, ai.market');
  expect(post?.content).toContain('"Historically, enterprise data has been treated as an overhead expense, something to secure, archive, and manage. In an AI-native market, that same data can become a new asset class: discoverable, monetizable, and strategically valuable without ever leaving your control."');
  const metadata = await generateMetadata({ params: Promise.resolve({ slug: 'CROs' }) });
  expect(metadata.openGraph).toMatchObject({ authors: ['Max Robbins'] });
});
