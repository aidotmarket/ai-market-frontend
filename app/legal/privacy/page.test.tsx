// @vitest-environment jsdom

import { createHash } from 'node:crypto';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import PrivacyNoticePage from './page';

describe('PrivacyNoticePage', () => {
  afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

  it('adds exactly the approved UTF-8 paragraph under information use when released', () => {
    vi.stubEnv('NEXT_PUBLIC_BUYER_REQUEST_ANONYMIZATION_ENABLED', '');
    const held = render(<PrivacyNoticePage />);
    expect(held.container.textContent).not.toContain('When you prepare a data request');
    vi.stubEnv('NEXT_PUBLIC_BUYER_REQUEST_ANONYMIZATION_ENABLED', 'true');
    const released = render(<PrivacyNoticePage />);
    const paragraph = released.getByText(/^When you prepare a data request/);
    expect(paragraph.tagName).toBe('P');
    expect(createHash('sha256').update(paragraph.textContent!, 'utf8').digest('hex'))
      .toBe('964398c4f9cb50e14fc2645becdf1eb0104f9482696eac6f31b1e5031dfa4131');
    expect(paragraph.nextElementSibling?.textContent).toBe('AI assistants and connectors');
    expect(paragraph.previousElementSibling?.previousElementSibling?.previousElementSibling?.textContent)
      .toBe('How We Use Your Information');
    paragraph.remove();
    expect(released.container.innerHTML).toBe(held.container.innerHTML);
  });

  it('publishes the AI assistants section after information use with the approved retention period', () => {
    const { container } = render(<PrivacyNoticePage />);
    const heading = screen.getByRole('heading', { name: 'AI assistants and connectors' });

    expect(heading.id).toBe('ai-assistants');
    const headings = screen.getAllByRole('heading', { level: 2 });
    const index = headings.indexOf(heading);
    expect(headings[index - 1].textContent).toBe('How We Use Your Information');
    expect(headings[index + 1].textContent).toBe('How We Share Your Information');
    expect(screen.getByText('Last Updated: October 1, 2026')).toBeTruthy();
    expect(heading.nextElementSibling?.textContent?.trim()).toBe('You can connect your ai.market account to an AI assistant such as Claude. You sign in on ai.market and approve what the assistant may access. You can revoke that access at any time under Connected apps in your account settings, or in the assistant.');
    expect(heading.nextElementSibling?.nextElementSibling?.textContent?.trim()).toBe('When the assistant uses ai.market on your behalf, we process your account details, organization membership, marketplace listings, your activity notices and your data requests, only to answer that request. We do not receive your conversation with the assistant.');
    expect(screen.getByText(/We keep these records for 12 months, then delete them\./).textContent?.trim()).toBe('For security and abuse prevention we keep a record of each request: the time, which tool was used, whether it succeeded, the app and approval it came through, your account and organization, and one-way fingerprints of the request contents, the response and your browser details. We do not store the request text or the response. If a connection attempt fails authentication, we also record the IP address it came from. We keep these records for 12 months, then delete them.');
    expect(container.textContent).not.toContain('sample, license');
    expect(container.textContent).not.toContain('your IP address, and one-way');
    const providerParagraph = headings[index + 1].previousElementSibling;
    expect(providerParagraph?.textContent?.trim()).toBe('The assistant provider handles your conversation under its own privacy terms. Questions: privacy@ai.market.');
    expect(providerParagraph?.querySelector('a')?.getAttribute('href')).toBe('mailto:privacy@ai.market');
  });
});
