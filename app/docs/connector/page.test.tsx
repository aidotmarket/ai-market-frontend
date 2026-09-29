// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import ConnectorDocsPage, { metadata } from './page';

afterEach(cleanup);

it('renders the Claude guide and structured article data', () => {
  const { container } = render(<ConnectorDocsPage />);
  const text = container.textContent ?? '';

  expect(screen.getByRole('heading', { name: 'Use ai.market in Claude' })).toBeTruthy();
  for (const name of ['Get my account', 'Search data listings', 'Inspect a data listing', 'View my activity', 'List my data requests']) {
    expect(text).toContain(name);
  }
  expect(text).toContain('https://connect.ai.market/mcp');
  expect(text).toContain('early access allowlist');
  expect(text).not.toContain('ask_allai');
  expect(metadata.openGraph).toMatchObject({ url: 'https://ai.market/docs/connector' });

  const article = JSON.parse(container.querySelector('script[type="application/ld+json"]')!.textContent!);
  expect(article).toMatchObject({ '@type': 'TechArticle', url: 'https://ai.market/docs/connector' });
});
