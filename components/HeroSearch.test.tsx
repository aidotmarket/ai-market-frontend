// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { HeroSearch } from './HeroSearch';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

afterEach(cleanup);

it('prompts buyers to search for datasets', () => {
  render(<HeroSearch />);

  expect(screen.getByRole('searchbox').getAttribute('placeholder'))
    .toBe('Search datasets by topic, industry, or use case');
});
