// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import SupportPage from './page';

it('offers a mailto link with a selectable, non-draggable support address', () => {
  render(<SupportPage />);

  const email = screen.getByRole('link', { name: 'support@ai.market' });
  expect(email.getAttribute('href')).toBe('mailto:support@ai.market');
  expect(email.textContent).toBe('support@ai.market');
  expect(email.classList.contains('select-text')).toBe(true);
  expect(email.getAttribute('draggable')).toBe('false');
});
