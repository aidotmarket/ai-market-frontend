// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnonymousAllAILocale } from '@/lib/i18n/anonymous-allai';

const mocks = vi.hoisted(() => ({
  context: {
    toggle: vi.fn(),
    isOpen: false,
    isSignedIn: false,
    locale: 'en' as AnonymousAllAILocale,
    anonymousSurfaceActive: true,
    anonymousAvailable: true,
    page: '/',
  },
}));

vi.mock('./AllAIContext', () => ({ useAllAI: () => mocks.context }));

import AllAIFab from './AllAIFab';

describe('AllAIFab', () => {
  beforeEach(() => {
    mocks.context.toggle.mockClear();
    mocks.context.isOpen = false;
    mocks.context.isSignedIn = false;
    mocks.context.locale = 'en';
    mocks.context.anonymousSurfaceActive = true;
    mocks.context.anonymousAvailable = true;
    mocks.context.page = '/';
  });

  afterEach(cleanup);

  it('keeps allAI visibly named throughout the seller workspace', () => {
    mocks.context.isSignedIn = true;
    mocks.context.anonymousSurfaceActive = false;
    mocks.context.page = '/dashboard/seller-workspace';
    render(<AllAIFab />);
    expect(screen.getByRole('button', { name: 'Open allAI, here to help' }).textContent).toContain('allAI · Here to help');
  });

  it('shows a visible AI label when the approved anonymous mode is active', () => {
    render(<AllAIFab />);

    const launcher = screen.getByRole('button', { name: 'Open allAI · AI assistant' });
    expect(launcher.textContent).toContain('allAI · AI assistant');
    expect(launcher.getAttribute('aria-controls')).toBe('allai-assistant-dialog');
    expect(launcher.classList.contains('h-12')).toBe(true);
  });

  it('preserves the localized anonymous label', () => {
    mocks.context.locale = 'es';
    render(<AllAIFab />);

    const launcher = screen.getByRole('button', { name: 'Abrir allAI · Asistente de IA' });
    expect(launcher.textContent).toBe('allAI · Asistente de IA');
    expect(screen.getByText('allAI · Asistente de IA').classList.contains('hidden')).toBe(false);
  });

  it.each(['/', '/support'])('shows the allAI pill at desktop widths on signed-in %s', (page) => {
    mocks.context.isSignedIn = true;
    mocks.context.anonymousSurfaceActive = false;
    mocks.context.page = page;
    const { rerender } = render(<AllAIFab />);

    const launcher = screen.getByRole('button', { name: 'Open allAI assistant' });
    expect([...screen.getByText('allAI').classList]).toEqual(expect.arrayContaining(['hidden', 'sm:inline']));
    expect([...launcher.classList]).toEqual(
      expect.arrayContaining(['w-12', 'sm:w-auto', 'sm:min-w-11', 'sm:gap-2', 'sm:px-4'])
    );
    expect(launcher.getAttribute('aria-controls')).toBe('allai-assistant-dialog');
    expect(launcher.getAttribute('aria-expanded')).toBe('false');
    expect(mocks.context.toggle).not.toHaveBeenCalled();
    fireEvent.click(launcher);
    expect(mocks.context.toggle).toHaveBeenCalledTimes(1);

    mocks.context.isOpen = true;
    rerender(<AllAIFab />);
    expect(screen.queryByTestId('allai-launcher')).toBeNull();

    mocks.context.isOpen = false;
    rerender(<AllAIFab />);
    expect(screen.getByRole('button', { name: 'Open allAI assistant' }).textContent).toBe('allAI');
  });

  it.each([
    ['/find-data', true],
    ['/pricing', true],
    ['/support/other', true],
    ['/support', false],
  ] as const)('keeps the icon-only control on %s with signed-in state %s', (page, isSignedIn) => {
    mocks.context.isSignedIn = isSignedIn;
    mocks.context.anonymousSurfaceActive = false;
    mocks.context.page = page;
    render(<AllAIFab />);

    const launcher = screen.getByRole('button', { name: 'Open allAI assistant' });
    expect(launcher.textContent).toBe('');
    expect(launcher.classList.contains('w-12')).toBe(true);
    expect(launcher.classList.contains('sm:w-auto')).toBe(false);
  });

  it('removes the anonymous launcher when backend readiness is unavailable', () => {
    mocks.context.anonymousAvailable = false;
    render(<AllAIFab />);
    expect(screen.queryByTestId('allai-launcher')).toBeNull();
  });

  it('uses an unlayered reduced-motion override for the global pulse animation', () => {
    const css = readFileSync('app/globals.css', 'utf8');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toMatch(/\.allai-fab-pulse\s*{\s*animation:\s*none;/);
  });
});
