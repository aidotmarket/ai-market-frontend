// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import ManagementTeamPage, { metadata } from '@/app/management-team/page';
import profiles from '@/content/management-team/profiles.json';
import page from '@/content/management-team/page.json';

afterEach(cleanup);

it('renders the four approved profiles with their roles and exact experience text', () => {
  render(<ManagementTeamPage />);
  const expected = [
    ['Max Robbins', 'Chief Executive Officer', 'Founder of ai.market, the non-custodial B2B data marketplace.'],
    ['Claude Opus 5.5', 'Executive Vice President', 'Supported a 680,000-line code migration in under a day in an early customer test reported by Anthropic.'],
    ['GPT-6.1 Sol', 'Chief Financial Officer', 'Released for complex professional work with near-Astra performance at a lower cost, according to OpenAI.'],
    ['Claude Fable 5.1', 'Chief Technology Officer', 'Found the cause of a rare crash that had eluded Millennium’s engineers for years, according to its published early-access report.'],
  ];
  expect(screen.getAllByRole('article')).toHaveLength(4);
  for (const [name, role, experience] of expected) {
    const card = screen.getByRole('heading', { name }).closest('article')!;
    expect(within(card).getByText(role).textContent).toBe(role);
    expect(within(card).getByText(experience).textContent).toBe(experience);
    expect(within(card).getByRole('img', { name }).getAttribute('alt')).toBe(name);
  }
  // Every editorial field remains intact, including punctuation and Unicode.
  for (const profile of profiles) {
    const card = within(screen.getByRole('heading', { name: profile.name }).closest('article')!);
    for (const text of [profile.lead, profile.bio, ...profile.experience, ...profile.education, ...profile.expertise]) {
      expect(card.getByText(text).textContent).toBe(text);
    }
  }
});

it('has no sources disclosure and no portrait caption', () => {
  const { container } = render(<ManagementTeamPage />);
  expect(container.querySelector('details')).toBeNull();
  expect(container.querySelector('figcaption')).toBeNull();
});

it('uses the approved hero description and canonical with an absolute title', () => {
  expect(metadata.alternates?.canonical).toBe('/management-team');
  expect(metadata.title).toEqual({ absolute: 'Management Team | ai.market' });
  expect(metadata.description).toBe(page.description);
  expect(metadata.robots).toBeUndefined();
});
