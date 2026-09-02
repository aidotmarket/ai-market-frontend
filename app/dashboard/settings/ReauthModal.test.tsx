// @vitest-environment jsdom

import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReauthResponse } from '@/types';

const auth = vi.hoisted(() => ({
  submitReauth: vi.fn(),
}));

vi.mock('@/api/auth', () => auth);

import ReauthModal from './ReauthModal';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function successResponse(token = 'fresh-token'): ReauthResponse {
  return {
    token,
    expires_in: 60,
    token_type: 'reauth',
    message: null,
    method: 'totp',
  };
}

function expectEnabledFocusInside(dialog: HTMLElement) {
  const focused = document.activeElement as HTMLInputElement | HTMLButtonElement | null;
  expect(focused).not.toBeNull();
  expect(dialog.contains(focused)).toBe(true);
  expect(focused?.disabled).toBe(false);
  return focused as HTMLElement;
}

function expectTabAndShiftTabContained(dialog: HTMLElement) {
  const focused = expectEnabledFocusInside(dialog);
  fireEvent.keyDown(focused, { key: 'Tab' });
  expectEnabledFocusInside(dialog);
  fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Tab', shiftKey: true });
  expectEnabledFocusInside(dialog);
}

function describedByIds(element: HTMLElement) {
  return element.getAttribute('aria-describedby')?.split(/\s+/) ?? [];
}

describe('ReauthModal backend contract and accessibility', () => {
  beforeEach(() => {
    auth.submitReauth.mockResolvedValue(successResponse());
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('asks for the current authenticator code without starting an obsolete challenge', async () => {
    render(<ReauthModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: 'Re-authenticate' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(
      screen.getByText('Enter the current code from your authenticator app to continue.')
    ).not.toBeNull();
    expect(screen.queryByText(/verification challenge/i)).toBeNull();

    const codeInput = screen.getByRole('textbox', { name: 'Verification code' });
    await waitFor(() => expect(document.activeElement).toBe(codeInput));

    const first = screen.getByRole('button', { name: 'Close re-authentication dialog' });
    const last = screen.getByRole('button', { name: 'Cancel' });
    first.focus();
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    expect(auth.submitReauth).not.toHaveBeenCalled();
  });

  it('cancels on Escape and restores focus to the opening control', async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open re-authentication
          </button>
          <ReauthModal isOpen={open} onClose={() => setOpen(false)} onSuccess={vi.fn()} />
        </>
      );
    }

    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open re-authentication' });
    opener.focus();
    fireEvent.click(opener);
    const dialog = await screen.findByRole('dialog', { name: 'Re-authenticate' });
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('textbox', { name: 'Verification code' })
      )
    );

    fireEvent.keyDown(dialog, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(opener);
  });

  it('forwards the deployed backend token and guards focus through setup work', async () => {
    const submission = deferred<ReauthResponse>();
    const success = deferred<void>();
    auth.submitReauth.mockReturnValueOnce(submission.promise);
    const onClose = vi.fn();
    const onSuccess = vi.fn(() => success.promise);
    render(<ReauthModal isOpen onClose={onClose} onSuccess={onSuccess} />);

    const dialog = screen.getByRole('dialog', { name: 'Re-authenticate' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Verification code' }), {
      target: { value: '123456' },
    });
    const continueButton = screen.getByRole('button', { name: 'Continue' });
    continueButton.focus();
    fireEvent.click(continueButton);

    expect(auth.submitReauth).toHaveBeenCalledWith('123456');
    expect((continueButton as HTMLButtonElement).disabled).toBe(true);
    expectEnabledFocusInside(dialog);
    expectTabAndShiftTabContained(dialog);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => submission.resolve(successResponse()));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('fresh-token'));
    expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(
      true
    );
    await act(async () => success.resolve());
  });

  it('announces submission failure and associates it with the focused code field', async () => {
    const submission = deferred<ReauthResponse>();
    auth.submitReauth.mockReturnValueOnce(submission.promise);
    render(<ReauthModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);

    const input = screen.getByRole('textbox', { name: 'Verification code' });
    fireEvent.change(input, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(document.activeElement).toBe(input);

    await act(async () => submission.reject(new Error('private submission detail')));

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('Failed to verify the re-authentication code.');
    expect(describedByIds(input)).toContain(alert.id);
    expect(describedByIds(screen.getByRole('dialog'))).toContain(alert.id);
    expect(document.activeElement).toBe(input);
  });

  it('fails closed when a successful response has no reauthentication token', async () => {
    auth.submitReauth.mockResolvedValueOnce({
      ...successResponse(),
      token: null,
    });
    const onSuccess = vi.fn();
    render(<ReauthModal isOpen onClose={vi.fn()} onSuccess={onSuccess} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Verification code' }), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Failed to verify the re-authentication code.'
    );
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
