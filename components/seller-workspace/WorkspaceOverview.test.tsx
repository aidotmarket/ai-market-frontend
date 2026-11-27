// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { WorkspaceOverview } from './WorkspaceOverview';

afterEach(cleanup);
it('uses allAI casing in the workspace introduction', () => {
  render(<WorkspaceOverview connections={[]} view="manage" onViewChange={vi.fn()} />);
  expect(screen.getByText('Choose what to sell. allAI helps describe it and add the right tags. Your data stays in your cloud account. You approve what becomes public.')).toBeTruthy();
});
