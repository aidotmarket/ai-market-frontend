// @vitest-environment jsdom

import { cleanup, render, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import InvestorsPage from './page';

const approvedCopy = {
  "Apex Meridian Partners": [
    "Apex Meridian Partners did not invest in ai.market and, in fact, does not exist.",
    "Its absence has spared us the familiar venture-capital exercise of turning a perfectly sensible business into an urgent attempt to return somebody else’s fund. Customers may want a reliable product at a fair price; investors may need a billion-dollar exit before their fund’s clock runs out. These are different business plans, however many times the board deck calls them “aligned.” Founders can end up hiring before there is work, expanding before there is demand, and subsidizing revenue to prove that people enjoy discounts. A sustainable company becomes a disappointing outcome because it failed to become an implausibly large one. Apex Meridian brings none of these pressures to ai.market. With no partners, no fund, and no capital, it has achieved an exceptional level of non-interference. Thank you for actually reading this far. In a world where most due diligence ends at the logo, that makes you an exceptional individual."
  ],
  "Northstar Vector Capital": [
    "Northstar Vector Capital did not invest in ai.market and, in fact, does not exist.",
    "Every dollar invested in ai.market came from its hardworking founder, Max Robbins. There was no funding round, no congratulatory photograph, and no partner offering strategic guidance between ski trips. There was an entrepreneur putting his own money behind a business, with one priority: the satisfaction of its customers. That makes the investment thesis unusually easy to explain. Build something useful. Charge fairly. Listen when it falls short. Make it better. Decisions do not have to flatter a valuation, fit a fund’s exit timetable, or turn a customer problem into a slide about total addressable market. The person paying the bills wants the same thing as the people using the product: a business that earns their trust by doing its job. Northstar’s contribution to this arrangement has been to remain entirely imaginary. We appreciate you taking the time to read the small print. Looking past an impressive name to see what is really behind it puts you in rather exceptional company."
  ]
};

afterEach(cleanup);

it('renders both complete approved About paragraphs for each firm', () => {
  const { container } = render(<InvestorsPage />);

  for (const [name, paragraphs] of Object.entries(approvedCopy)) {
    const article = within(container).getByRole('heading', { name }).closest('article');
    expect(article).not.toBeNull();
    const about = within(article!).getByRole('heading', { name: 'About the Firm' }).parentElement!;
    const rendered = Array.from(about.querySelectorAll('p'), (paragraph) => paragraph.textContent);
    expect(rendered).toEqual(paragraphs);
  }

  expect(container.textContent).toContain('that makes you an exceptional individual.');
  expect(container.textContent).toContain('puts you in rather exceptional company.');
});
