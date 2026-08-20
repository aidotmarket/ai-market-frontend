// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  context: {
    toggle: vi.fn(),
    isOpen: false,
    locale: 'en' as const,
    anonymousSurfaceActive: true,
    anonymousAvailable: true,
  },
}));

vi.mock('./AllAIContext', () => ({ useAllAI: () => mocks.context }));

import AllAIFab from './AllAIFab';

describe('AllAIFab anonymous visitor entry point', () => {
  beforeEach(() => {
    mocks.context.isOpen = false;
    mocks.context.anonymousSurfaceActive = true;
    mocks.context.anonymousAvailable = true;
  });

  afterEach(cleanup);

  it('shows a visible AI label when the approved anonymous mode is active', () => {
    render(<AllAIFab />);

    const launcher = screen.getByRole('button', { name: 'Open allAI · AI assistant' });
    expect(launcher.textContent).toContain('allAI · AI assistant');
    expect(launcher.getAttribute('aria-controls')).toBe('allai-assistant-dialog');
    expect(launcher.classList.contains('h-12')).toBe(true);
  });

  it('preserves the icon-only signed-in presentation', () => {
    mocks.context.anonymousSurfaceActive = false;
    render(<AllAIFab />);

    const launcher = screen.getByRole('button', { name: 'Open allAI assistant' });
    expect(launcher.textContent).not.toContain('AI assistant');
    expect(launcher.classList.contains('w-12')).toBe(true);
  });

  it('keeps the existing icon-only control outside the approved routes', () => {
    mocks.context.anonymousSurfaceActive = false;
    render(<AllAIFab />);

    expect(screen.getByRole('button', { name: 'Open allAI assistant' }).textContent).not.toContain(
      'AI assistant'
    );
  });

  it('removes the anonymous launcher when backend readiness is unavailable', () => {
    mocks.context.anonymousAvailable = false;
    render(<AllAIFab />);
    expect(screen.queryByTestId('allai-launcher')).toBeNull();
  });
});
