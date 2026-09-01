// @vitest-environment jsdom

import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  generateReauthToken: vi.fn(),
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

describe('ReauthModal accessibility and working guard', () => {
  beforeEach(() => {
    auth.generateReauthToken.mockResolvedValue({});
    auth.submitReauth.mockResolvedValue({ reauth_token: 'fresh-token' });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('is a named modal dialog, initially focuses the code field, and contains Tab focus', async () => {
    render(<ReauthModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: 'Re-authenticate' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const codeInput = screen.getByRole('textbox', { name: 'Verification code' });
    await waitFor(() => expect(document.activeElement).toBe(codeInput));

    const first = screen.getByRole('button', { name: 'Close re-authentication dialog' });
    const last = screen.getByRole('button', { name: 'Cancel' });
    first.focus();
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
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

  it('moves focus off disabled close/resend controls and contains it during a deferred challenge', async () => {
    const challenge = deferred<void>();
    const onClose = vi.fn();
    render(<ReauthModal isOpen onClose={onClose} onSuccess={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: 'Re-authenticate' });
    await screen.findByText('Verification challenge sent. Use the latest code to continue.');
    const close = screen.getByRole('button', { name: 'Close re-authentication dialog' });
    const resend = screen.getByRole('button', { name: 'Resend code' });
    close.focus();

    auth.generateReauthToken.mockReturnValueOnce(challenge.promise);
    fireEvent.click(resend);

    expect((close as HTMLButtonElement).disabled).toBe(true);
    expect((resend as HTMLButtonElement).disabled).toBe(true);
    expectEnabledFocusInside(dialog);
    expectTabAndShiftTabContained(dialog);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => challenge.resolve());
  });

  it('moves focus off Continue and contains it through deferred submission and onSuccess work', async () => {
    const submission = deferred<{ reauth_token: string }>();
    const success = deferred<void>();
    auth.submitReauth.mockReturnValueOnce(submission.promise);
    const onClose = vi.fn();
    const onSuccess = vi.fn(() => success.promise);
    render(<ReauthModal isOpen onClose={onClose} onSuccess={onSuccess} />);

    const dialog = screen.getByRole('dialog', { name: 'Re-authenticate' });
    await screen.findByText('Verification challenge sent. Use the latest code to continue.');
    fireEvent.change(screen.getByRole('textbox', { name: 'Verification code' }), {
      target: { value: '123456' },
    });
    const continueButton = screen.getByRole('button', { name: 'Continue' });
    continueButton.focus();
    fireEvent.click(continueButton);

    expect((continueButton as HTMLButtonElement).disabled).toBe(true);
    expectEnabledFocusInside(dialog);
    expectTabAndShiftTabContained(dialog);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => submission.resolve({ reauth_token: 'fresh-token' }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('fresh-token'));
    expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(
      true
    );
    expectTabAndShiftTabContained(dialog);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => success.resolve());
  });

  it('renders requesting on the initial open and shows Unable to start only after rejection', async () => {
    const challenge = deferred<void>();
    auth.generateReauthToken.mockReturnValueOnce(challenge.promise);
    render(<ReauthModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);

    const status = screen.getByRole('status');
    expect(status.textContent).toBe('Sending verification challenge...');
    expect(screen.queryByText('Unable to start the verification challenge.')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();

    await act(async () => challenge.reject(new Error('private challenge detail')));

    expect(status.textContent).toBe('Unable to start the verification challenge.');
    expect(screen.getByRole('alert').textContent).toBe(
      'Failed to verify the re-authentication code.'
    );
    expect(document.body.textContent).not.toContain('private challenge detail');
  });

  it.each([
    ['success', null],
    ['failure', 'Failed to verify the re-authentication code.'],
  ] as const)(
    'announces challenge pending and %s while keeping focus and descriptions associated',
    async (outcome, expectedError) => {
      const challenge = deferred<void>();
      auth.generateReauthToken.mockReturnValueOnce(challenge.promise);
      render(<ReauthModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);

      const dialog = screen.getByRole('dialog', { name: 'Re-authenticate' });
      const input = screen.getByRole('textbox', { name: 'Verification code' });
      await waitFor(() => expect(document.activeElement).toBe(input));
      const pendingStatus = screen.getByRole('status');
      expect(pendingStatus.textContent).toBe('Sending verification challenge...');
      expect(pendingStatus.getAttribute('aria-live')).toBe('polite');
      expect(describedByIds(input)).toContain(pendingStatus.id);
      expect(describedByIds(dialog)).toContain(pendingStatus.id);

      if (outcome === 'success') {
        await act(async () => challenge.resolve());
        expect(screen.getByRole('status').textContent).toBe(
          'Verification challenge sent. Use the latest code to continue.'
        );
        expect(screen.queryByRole('alert')).toBeNull();
      } else {
        await act(async () => challenge.reject(new Error('private challenge detail')));
        expect(screen.getByRole('status').textContent).toBe(
          'Unable to start the verification challenge.'
        );
        const alert = screen.getByRole('alert');
        expect(alert.textContent).toBe(expectedError);
        expect(describedByIds(input)).toContain(alert.id);
        expect(describedByIds(dialog)).toContain(alert.id);
      }

      expect(document.activeElement).toBe(input);
      for (const id of describedByIds(input)) expect(document.getElementById(id)).not.toBeNull();
    }
  );

  it('announces submission failure and associates it with the focused code field', async () => {
    const submission = deferred<{ reauth_token: string }>();
    auth.submitReauth.mockReturnValueOnce(submission.promise);
    render(<ReauthModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);

    await screen.findByText('Verification challenge sent. Use the latest code to continue.');
    const input = screen.getByRole('textbox', { name: 'Verification code' });
    fireEvent.change(input, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(document.activeElement).toBe(input);

    await act(async () => submission.reject(new Error('private submission detail')));

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('Failed to verify the re-authentication code.');
    expect(describedByIds(input)).toContain(alert.id);
    expect(document.activeElement).toBe(input);
  });
});
