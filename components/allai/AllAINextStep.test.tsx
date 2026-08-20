// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('./AllAIContext', async () => {
  const actual = await vi.importActual<typeof import('./AllAIContext')>('./AllAIContext');
  return { ...actual, useAllAI: () => ({ locale: 'en' }) };
});

import AllAINextStep from './AllAINextStep';

afterEach(cleanup);

it('routes account-required actions through registration', () => {
  render(
    <AllAINextStep
      nextStep={{
        action: 'buy_listing',
        label: 'Buy this listing',
        url: '/listings/example',
        requires_account: true,
      }}
    />
  );

  expect(screen.getByText('An account is required for this step.')).not.toBeNull();
  expect(screen.getByRole('link', { name: 'Buy this listing' }).getAttribute('href')).toBe(
    '/register?redirect=%2Flistings%2Fexample'
  );
});

it('keeps public next steps ungated', () => {
  render(
    <AllAINextStep
      nextStep={{
        action: 'browse_listings',
        label: 'Browse listings',
        url: '/listings',
        requires_account: false,
      }}
    />
  );

  expect(screen.queryByText('An account is required for this step.')).toBeNull();
  expect(screen.getByRole('link', { name: 'Browse listings' }).getAttribute('href')).toBe(
    '/listings'
  );
});
