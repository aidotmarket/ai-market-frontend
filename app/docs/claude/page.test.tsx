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
      'Use ai.market in Claude. Ask Claude to find and inspect data on ai.market in plain language. Claude works with your own ai.market account and only sees what you allow.',
      'Connect. In Claude, open Settings, then Connectors, find ai.market and choose Connect. You sign in on ai.market, see exactly what Claude is asking for, and approve. During early access your account has to be on our early-access list. Write to support@ai.market to join.',
      "What Claude can do. Search published listings. Look at a listing's description, fields, sample, license and price. Show your account details, your recent activity and your data requests.",
      'What Claude cannot do. Claude cannot buy, sell, pay, publish or message anyone for you in this version. It never sees dataset files, because ai.market never holds them. When you want to buy, Claude gives you the link and you finish on ai.market.',
      'Your data. We record each tool call for security, with a one-way fingerprint instead of what you asked. We do not get your Claude conversation. See the privacy notice for details.',
      'Disconnect. Remove ai.market under Connectors in Claude, or revoke it under Connected apps in your ai.market account settings. Either one ends access right away.',
      'Help. support@ai.market or ai.market/support.',
    ]);
    expect(sections.every((section) => section.querySelector('strong'))).toBe(true);
    expect(screen.getByRole('link', { name: 'privacy notice' }).getAttribute('href')).toBe('/legal/privacy#ai-assistants');
    expect(screen.getByRole('link', { name: 'ai.market/support' }).getAttribute('href')).toBe('/support');
    for (const link of screen.getAllByRole('link', { name: 'support@ai.market' })) {
      expect(link.getAttribute('href')).toBe('mailto:support@ai.market');
    }
    expect(metadata.title).toBe('Use ai.market in Claude');
    expect(metadata.alternates?.canonical).toBe('/docs/claude');
  });
});
