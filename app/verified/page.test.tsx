// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import VerifiedPage from './page';

afterEach(cleanup);

describe('VerifiedPage', () => {
  it('renders the explainer sections in order with pricing and seller entry point', () => {
    render(<VerifiedPage />);

    const headings = [
      'What the verified label means',
      'Where the check runs',
      'How it works, step by step',
      'What it costs',
      'What buyers see, and what it does not mean',
      'Your data stays with you',
      'How to start (for sellers)',
    ];
    expect(screen.getAllByRole('region').map((section) => {
      const headingId = section.getAttribute('aria-labelledby') ?? '';
      return document.getElementById(headingId)?.textContent?.trim();
    })).toEqual(headings);
    headings.forEach((name, index) => {
      expect(screen.getByRole('heading', { name, level: index === 0 ? 1 : 2 })).toBeTruthy();
    });
    for (const name of ['AIM Data gateway', 'AWS S3', 'Cloudflare R2']) {
      expect(screen.getByRole('heading', { name, level: 3 })).toBeTruthy();
    }
    expect(screen.getByText(
      'The final charge is twice the measured cloud AI cost, with a $1 minimum, and is never more than the hold or $25.',
    )).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Listings in your dashboard' }).getAttribute('href'))
      .toBe('/dashboard/listings');
  });

  it('does not describe the retired desktop scanner', () => {
    const { container } = render(<VerifiedPage />);

    expect(container.textContent).not.toMatch(
      /desktop app|AIM Data desktop|installed on the seller['’]s machine/i,
    );
  });
});
