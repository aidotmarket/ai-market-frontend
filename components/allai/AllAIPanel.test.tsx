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

  it('exposes the existing locale selector in the legacy panel', () => {
    mocks.context.anonymousSurfaceActive = false;
    render(<AllAIPanel />);
    expect(screen.getByRole('dialog', { name: 'allAI' })).not.toBeNull();
    expect(screen.getByRole('combobox', { name: 'Language' })).not.toBeNull();
    expect(screen.getByPlaceholderText('Ask allAI anything…')).not.toBeNull();
  });

  it.each([390, 1024])('keeps the localized selector usable at %s pixels', (width) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    mocks.context.anonymousSurfaceActive = false;
    mocks.context.locale = 'es';
    const view = render(<AllAIPanel />);
    const selector = screen.getByRole('combobox', { name: 'Idioma' });
    expect(screen.getAllByRole('option').map((item) => item.textContent)).toEqual(['English', 'Español', '简体中文']);
    fireEvent.mouseDown(selector);
    expect(document.body.style.cursor).not.toBe('grabbing');
    fireEvent.change(selector, { target: { value: 'zh-Hans' } });
    expect(mocks.context.setLocale).toHaveBeenCalledWith('zh-Hans');
    mocks.context.locale = 'zh-Hans';
    view.rerender(<AllAIPanel />);
    expect(screen.getByRole('combobox', { name: '语言' })).not.toBeNull();
    expect(screen.getByRole('button', { name: '关闭 allAI · AI 助手' })).not.toBeNull();
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
