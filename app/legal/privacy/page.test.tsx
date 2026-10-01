// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import PrivacyNoticePage from './page';

describe('PrivacyNoticePage', () => {
  it('publishes the AI assistants section after information use with the approved retention period', () => {
    render(<PrivacyNoticePage />);
    const heading = screen.getByRole('heading', { name: 'AI assistants and connectors' });

    expect(heading.id).toBe('ai-assistants');
    const headings = screen.getAllByRole('heading', { level: 2 });
    const index = headings.indexOf(heading);
    expect(headings[index - 1].textContent).toBe('How We Use Your Information');
    expect(headings[index + 1].textContent).toBe('How We Share Your Information');
    expect(screen.getByText('Last Updated: October 1, 2026')).toBeTruthy();
    expect(heading.nextElementSibling?.textContent?.trim()).toBe('You can connect your ai.market account to an AI assistant such as Claude. You sign in on ai.market and approve what the assistant may access. You can revoke that access at any time under Connected apps in your account settings, or in the assistant.');
    expect(heading.nextElementSibling?.nextElementSibling?.textContent?.trim()).toBe('When the assistant uses ai.market on your behalf, we process your account details, organization membership, marketplace listings, your activity notices and your data requests, only to answer that request. We do not receive your conversation with the assistant.');
    expect(screen.getByText(/We keep these records for 12 months, then delete them\./).textContent?.trim()).toBe('For security and abuse prevention we keep a record of each request: the time, which tool was used, the result, the app and approval it came through, your account and organization, your IP address, and one-way fingerprints of the request contents and your browser details. We do not store the request text or the results. We keep these records for 12 months, then delete them.');
    const providerParagraph = headings[index + 1].previousElementSibling;
    expect(providerParagraph?.textContent?.trim()).toBe('The assistant provider handles your conversation under its own privacy terms. Questions: privacy@ai.market.');
    expect(providerParagraph?.querySelector('a')?.getAttribute('href')).toBe('mailto:privacy@ai.market');
  });
});
