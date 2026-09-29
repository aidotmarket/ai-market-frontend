// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
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
  const prompts = [
    'Find datasets on ai.market about vehicle collisions in New York City.',
    'Show me the AlphaFold protein structures listing on ai.market and what fields it includes.',
    'What competitive programming datasets are listed on ai.market?',
    'Which of my data requests on ai.market are still open?',
    "What's new on my ai.market account?",
  ];
  const promptSection = screen.getByRole('heading', { name: 'Try asking Claude' }).closest('section');
  expect(promptSection).not.toBeNull();
  expect(within(promptSection!).getAllByRole('listitem').map((item) => item.querySelector('q')?.textContent)).toEqual(prompts);
  expect(text).toContain('our assistant, allAI, handles communication between them');
  expect(text).toContain('https://connect.ai.market/mcp');
  expect(text).toContain('early access allowlist');
  expect(text).not.toContain('ask_allai');
  expect(metadata.openGraph).toMatchObject({ url: 'https://ai.market/docs/connector' });

  const article = JSON.parse(container.querySelector('script[type="application/ld+json"]')!.textContent!);
  expect(article).toMatchObject({ '@type': 'TechArticle', url: 'https://ai.market/docs/connector' });
});
