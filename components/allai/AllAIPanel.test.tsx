// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  context: {
    isOpen: true,
    close: vi.fn(),
    messages: [] as never[],
    isStreaming: false,
    sendMessage: vi.fn(),
    locale: 'en' as 'en' | 'es' | 'zh-Hans',
    setLocale: vi.fn(),
    anonymousSurfaceActive: true,
    anonymousAvailable: true,
    page: '/',
  },
}));

vi.mock('./AllAIContext', () => ({ useAllAI: () => mocks.context }));
vi.mock('./WizardAllAIBridge', () => ({ useWizardBridge: () => null }));

import AllAIPanel from './AllAIPanel';

describe('AllAIPanel accessibility and locale boundary', () => {
  beforeEach(() => {
    mocks.context.close.mockReset();
    mocks.context.setLocale.mockReset();
    mocks.context.locale = 'en';
    mocks.context.anonymousSurfaceActive = true;
    mocks.context.messages = [];
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

  it('preserves the legacy panel outside the active anonymous mode', () => {
    mocks.context.anonymousSurfaceActive = false;
    render(<AllAIPanel />);
    expect(screen.getByRole('dialog', { name: 'allAI' })).not.toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByPlaceholderText('Ask allAI anything...')).not.toBeNull();
  });

  it('exposes validated revision provenance in the rendered answer', () => {
    mocks.context.messages = [{
      id: 'answer-1',
      role: 'assistant',
      content: 'Validated answer',
      timestamp: 1,
      factRevisionSet: 'a'.repeat(64),
    }] as never[];
    render(<AllAIPanel />);

    expect(screen.getByText('Validated answer').closest('[data-fact-revision-set]')?.getAttribute(
      'data-fact-revision-set'
    )).toBe('a'.repeat(64));
  });
});
