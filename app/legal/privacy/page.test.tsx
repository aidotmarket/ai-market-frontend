// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import PrivacyNoticePage from './page';

it('shows the connector privacy notice and updated date', () => {
  const { container } = render(<PrivacyNoticePage />);
  expect(screen.getByRole('heading', { name: 'AI assistants and the ai.market connector' })).toBeTruthy();
  expect(container.textContent).toContain('Last Updated: September 29, 2026');
  expect(container.textContent).toContain('keyed hashes, not as readable text');
  expect(container.textContent).toContain('Settings under Connected apps');
});
