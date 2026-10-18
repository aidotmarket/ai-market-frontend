// @vitest-environment jsdom

import { cleanup, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AllAIChatInput from './AllAIChatInput';
import AllAIPanel from './AllAIPanel';

const context = vi.hoisted(() => ({
  page: '/', messages: [], locale: 'en', isOpen: true,
  close: vi.fn(), setLocale: vi.fn(), sendMessage: vi.fn(),
  isStreaming: false, anonymousSurfaceActive: true, anonymousAvailable: true,
}));

vi.mock('./AllAIContext', () => ({
  useAllAI: () => context,
}));
vi.mock('./WizardAllAIBridge', () => ({ useWizardBridge: () => null }));

const draft = '  candidate text  ';
const send = context.sendMessage;
const fetchDenied = vi.fn(() => { throw new Error('Unexpected network request'); });

function prepare(disabled = false, text = draft) {
  const view = render(<AllAIChatInput onSend={send} disabled={disabled} />);
  const box = screen.getByRole<HTMLTextAreaElement>('textbox');
  fireEvent.change(box, { target: { value: text } });
  return { box, ...view };
}

function enter(box: HTMLTextAreaElement, flags: KeyboardEventInit = {}) {
  const event = createEvent.keyDown(box, {
    key: 'Enter', code: 'Enter', bubbles: true, cancelable: true, ...flags,
  }) as KeyboardEvent;
  fireEvent(box, event);
  return event;
}

// Synthetic English text and event flags test React handling, not a native OS/browser IME.
describe('AllAIChatInput composition and send controls', () => {
  beforeEach(() => {
    send.mockReset();
    context.isStreaming = false;
    context.anonymousAvailable = true;
    fetchDenied.mockClear();
    vi.stubGlobal('fetch', fetchDenied);
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000000');
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    expect(fetchDenied).not.toHaveBeenCalled();
  });

  const compositionFlags = [
    { name: 'native isComposing', flags: { isComposing: true } },
    { name: 'legacy keyCode 229', flags: { isComposing: false, keyCode: 229 } },
  ];

  it.each(compositionFlags)('preserves text and browser confirmation for $name', ({ flags }) => {
    const { box } = prepare();
    fireEvent.compositionStart(box);
    const event = enter(box, flags);

    expect(event.isComposing).toBe(flags.isComposing);
    if ('keyCode' in flags) expect(event.keyCode).toBe(229);
    expect(send).not.toHaveBeenCalled();
    expect(box.value).toBe(draft);
    expect(event.defaultPrevented).toBe(false);
  });

  it.each(compositionFlags)('sends once on a separate Enter after $name ends', ({ flags }) => {
    const { box } = prepare();
    fireEvent.compositionStart(box);
    enter(box, flags);
    fireEvent.compositionEnd(box);
    expect(send).not.toHaveBeenCalled();
    expect(box.value).toBe(draft);

    const event = enter(box, { isComposing: false, keyCode: 13 });
    expect(event.defaultPrevented).toBe(true);
    expect(send).toHaveBeenCalledExactlyOnceWith('candidate text');
    expect(box.value).toBe('');
  });

  it('sends one trimmed message and clears the input on ordinary Enter', () => {
    const { box } = prepare();
    expect(enter(box).defaultPrevented).toBe(true);
    expect(send).toHaveBeenCalledExactlyOnceWith('candidate text');
    expect(box.value).toBe('');
  });

  it('leaves Shift Enter to the browser without sending or clearing', () => {
    const { box } = prepare();
    expect(enter(box, { shiftKey: true }).defaultPrevented).toBe(false);
    expect(send).not.toHaveBeenCalled();
    expect(box.value).toBe(draft);
  });

  it('keeps explicit Send working', () => {
    const { box } = prepare();
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(send).toHaveBeenCalledExactlyOnceWith('candidate text');
    expect(box.value).toBe('');
  });

  it.each(['', '   '])('does not send empty or whitespace-only text (%j)', (text) => {
    const { box } = prepare(false, text);
    const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Send message' });
    expect(button.disabled).toBe(true);
    enter(box);
    fireEvent.click(button);
    expect(send).not.toHaveBeenCalled();
    expect(box.value).toBe(text);
  });

  it('preserves a draft and blocks Enter and Send when disabled', () => {
    const { box, rerender } = prepare();
    rerender(<AllAIChatInput onSend={send} disabled />);
    const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Send message' });
    expect(box.disabled).toBe(true);
    expect(button.disabled).toBe(true);
    enter(box);
    fireEvent.click(button);
    expect(send).not.toHaveBeenCalled();
    expect(box.value).toBe(draft);
  });

  it.each(['streaming', 'unavailable'])('keeps the mounted panel input disabled while %s', async (reason) => {
    const view = render(<AllAIPanel />);
    const box = screen.getByRole<HTMLTextAreaElement>('textbox');
    await waitFor(() => expect(document.activeElement).toBe(box));
    fireEvent.change(box, { target: { value: draft } });
    if (reason === 'streaming') context.isStreaming = true;
    else context.anonymousAvailable = false;
    view.rerender(<AllAIPanel />);

    expect(box.disabled).toBe(true);
    const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Send message' });
    expect(button.disabled).toBe(true);
    enter(box);
    fireEvent.click(button);
    expect(send).not.toHaveBeenCalled();
    expect(box.value).toBe(draft);
  });

  it('keeps suggestion clicks working', () => {
    prepare(false, '');
    fireEvent.click(screen.getByRole('button', { name: 'What kind of data can I find here?' }));
    expect(send).toHaveBeenCalledExactlyOnceWith('What kind of data can I find here?');
  });

  it('blocks suggestions when disabled', () => {
    prepare(true, '');
    const button = screen.getByRole<HTMLButtonElement>('button', {
      name: 'What kind of data can I find here?',
    });
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(send).not.toHaveBeenCalled();
  });
});
