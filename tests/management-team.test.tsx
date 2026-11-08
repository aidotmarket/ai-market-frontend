// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ManagementTeamPage, { metadata } from '@/app/management-team/page';
import profiles from '@/content/management-team/profiles.json';
import page from '@/content/management-team/page.json';

afterEach(cleanup);

it('renders the four approved profiles with their roles and exact experience text', () => {
  render(<ManagementTeamPage />);
  const expected = [
    ['Max Robbins', 'Chief Executive Officer', 'Founder of ai.market, the non-custodial B2B data marketplace.'],
    ['Claude Opus', 'Executive Vice President', 'Supported a 680,000-line code migration in under a day in an early customer test reported by Anthropic.'],
    ['GPT Sol', 'Chief Financial Officer', 'Released for complex professional work with near-Astra performance at a lower cost, according to OpenAI.'],
    ['Claude Fable', 'Chief Technology Officer', 'Found the cause of a rare crash that had eluded Millennium’s engineers for years, according to its published early-access report.'],
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

it('publishes safe JSON-LD with one human founder and three AI applications', () => {
  const { container } = render(<ManagementTeamPage />);
  const scripts = container.querySelectorAll('script[type="application/ld+json"]');
  expect(scripts).toHaveLength(1);
  const raw = scripts[0].textContent!;
  expect(raw).not.toMatch(/<\/script/i);
  const data = JSON.parse(raw);
  expect(data['@context']).toBe('https://schema.org');
  const graph = data['@graph'];
  const people = graph.filter((node: Record<string, unknown>) => node['@type'] === 'Person');
  expect(people).toHaveLength(1);
  expect(people[0]).toMatchObject({
    name: 'Max Robbins', jobTitle: profiles[0].role, description: profiles[0].lead,
  });
  const organization = graph.find((node: Record<string, unknown>) => node['@type'] === 'Organization');
  expect(organization).toMatchObject({ name: 'ai.market', url: 'https://ai.market', founder: { '@id': people[0]['@id'] } });
  const aboutPage = graph.find((node: Record<string, unknown>) => node['@type'] === 'AboutPage');
  expect(organization.subjectOf).toEqual({ '@id': aboutPage['@id'] });
  expect(aboutPage).toMatchObject({ name: page.title, description: page.description, about: { '@id': organization['@id'] } });
  const applications = graph.filter((node: Record<string, unknown>) => node['@type'] === 'SoftwareApplication');
  expect(applications).toHaveLength(3);
  const expectedCreators = ['Anthropic', 'OpenAI', 'Anthropic'];
  for (const [index, profile] of profiles.slice(1).entries()) {
    const application = applications.find((node: Record<string, unknown>) => node.name === profile.name);
    expect(application).toMatchObject({
      applicationCategory: 'AI model', description: profile.lead,
      creator: { '@type': 'Organization', name: expectedCreators[index] },
      disambiguatingDescription: `Serves as ${profile.role} at ai.market`,
    });
    expect(aboutPage.mentions).toContainEqual({ '@id': application['@id'] });
  }
  // Count types recursively so nested nodes cannot silently introduce AI people.
  const types: string[] = [];
  const visit = (value: unknown) => {
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (key === '@type') types.push(String(child));
        visit(child);
      }
    }
  };
  visit(data);
  expect(types.filter((type) => type === 'Person')).toHaveLength(1);
  expect(types.filter((type) => type === 'SoftwareApplication')).toHaveLength(3);
  expect(raw).not.toContain('"employee"');
});

it('safely serializes script-closing text in the source JSON', async () => {
  const lead = '</script><script>alert("test")</script>';
  vi.resetModules();
  vi.doMock('@/content/management-team/profiles.json', () => ({
    default: profiles.map((profile, index) => index === 1 ? { ...profile, lead } : profile),
  }));
  try {
    const { default: Page } = await import('@/app/management-team/page');
    const { container } = render(<Page />);
    const scripts = container.querySelectorAll('script[type="application/ld+json"]');
    expect(scripts).toHaveLength(1);
    const raw = scripts[0].textContent!;
    expect(raw).not.toContain('<');
    const data = JSON.parse(raw);
    expect(data['@graph'].find((node: Record<string, unknown>) => node.name === 'Claude Opus').description).toBe(lead);
  } finally {
    vi.doUnmock('@/content/management-team/profiles.json');
    vi.resetModules();
  }
});
