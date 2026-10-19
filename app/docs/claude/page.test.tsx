// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ClaudeDocsPage, { metadata } from './page';

describe('ClaudeDocsPage', () => {
  it('renders all seven sections with the approved copy and links', () => {
    const { container } = render(<ClaudeDocsPage />);
    const sections = Array.from(container.querySelectorAll('section'));

    expect(screen.getByRole('heading', { name: 'Use ai.market in Claude' })).toBeTruthy();
    expect(sections.map((section) => section.textContent)).toEqual([
      'Use ai.market in Claude. Use ai.market from Claude in plain language. Buyers can find and inspect data. Sellers can manage their listings. Claude works with your own ai.market account and only does what you approve.',
      'Connect. In Claude, open Settings, then Connectors, find ai.market and choose Connect. You sign in on ai.market, see exactly what Claude is asking for, and approve. If you sell for a company, choose the company account on that screen.',
      "What Claude can do. For buyers. Search published listings. Look at a listing's description, columns, row count, update frequency and price. Show your account, your recent activity and your data requests. For sellers. Show your listings and drafts. Create a new draft or update one. Add a better description and other details to a listing draft. Tell you what is still missing before a listing can go live. Update several listings at once. Publish a listing that is ready, or take one down. To publish or take down several listings at once, ai.market sends you a link to confirm on the website first. Read and answer buyer questions and data requests through ai.market. Show your orders and mark an order as delivered. Some actions take effect straight away, like replying to a buyer or marking an order delivered, so be clear about what you ask Claude to do.",
      'What Claude cannot do. Claude cannot buy or pay for you in this version. Some steps, like accepting the licence terms for a listing, happen on the ai.market website. Claude cannot upload sample files. Use the website for those. Claude never sees your dataset files, and buyers and sellers never get each other\'s contact details.',
      'Your data. We record each tool call for security, with a one-way fingerprint instead of what you asked. We do not get your Claude conversation. See the privacy notice for details.',
      'Disconnect. Remove ai.market under Connectors in Claude, or revoke it under Connected apps in your ai.market account settings. Either one ends access right away.',
      'Help. support@ai.market or ai.market/support.',
    ]);
    expect(container.textContent).toContain('For sellers. Show your listings and drafts.');
    expect(container.textContent).not.toContain('asks you before it changes anything');
    expect(container.textContent).toContain('If you sell for a company, choose the company account on that screen.');
    expect(container.textContent).not.toMatch(/cannot[^.]*\bsell\b/i);
    expect(container.textContent).toContain('Claude cannot buy or pay for you in this version. Some steps, like accepting the licence terms for a listing, happen on the ai.market website.');
    expect(container.textContent).toContain('Claude never sees your dataset files');
    expect(container.textContent).not.toContain('never holds them');
    expect(container.textContent).not.toContain('sample, license');
    expect(container.textContent).not.toContain('your IP address, and one-way');
    expect(sections.every((section) => section.querySelector('strong'))).toBe(true);
    expect(screen.getByRole('link', { name: 'privacy notice' }).getAttribute('href')).toBe('/legal/privacy#ai-assistants');
    expect(screen.getByRole('link', { name: 'ai.market/support' }).getAttribute('href')).toBe('/support');
    for (const link of screen.getAllByRole('link', { name: 'support@ai.market' })) {
      expect(link.getAttribute('href')).toBe('mailto:support@ai.market');
    }
    expect(metadata.title).toBe('Use ai.market in Claude');
    expect(metadata.description).toBe('Use ai.market from Claude in plain language.');
    expect(metadata.alternates?.canonical).toBe('/docs/claude');
  });
});
