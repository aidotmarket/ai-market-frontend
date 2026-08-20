// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: null as object | null,
  context: {
    isOpen: true,
    close: vi.fn(),
    messages: [] as never[],
    isStreaming: false,
    sendMessage: vi.fn(),
    locale: 'en' as 'en' | 'es' | 'zh-Hans',
    setLocale: vi.fn(),
    anonymousAvailable: true,
    page: '/',
  },
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: (selector: (state: { user: object | null }) => unknown) =>
    selector({ user: mocks.user }),
}));
vi.mock('./AllAIContext', () => ({ useAllAI: () => mocks.context }));
vi.mock('./WizardAllAIBridge', () => ({ useWizardBridge: () => null }));

import AllAIPanel from './AllAIPanel';

describe('AllAIPanel accessibility and locale boundary', () => {
  beforeEach(() => {
    mocks.user = null;
    mocks.context.close.mockReset();
    mocks.context.setLocale.mockReset();
    mocks.context.locale = 'en';
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
  });

  afterEach(cleanup);

  it('opens as a labelled dialog and moves focus to the input', async () => {
    render(<AllAIPanel />);

    const dialog = screen.getByRole('dialog', { name: 'allAI · AI assistant' });
    expect(dialog.getAttribute('id')).toBe('allai-assistant-dialog');
    expect(screen.getByRole('combobox', { name: 'Language' })).not.toBeNull();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByPlaceholderText('Ask allAI anything…'))
    );
  });

  it('closes on Escape', () => {
    render(<AllAIPanel />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(mocks.context.close).toHaveBeenCalledOnce();
  });

  it('preserves the signed-in header and hides anonymous locale controls', () => {
    mocks.user = { id: 'buyer' };
    render(<AllAIPanel />);
    expect(screen.getByRole('dialog', { name: 'allAI' })).not.toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
  });
});
