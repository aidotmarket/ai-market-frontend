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

  it('blocks close and Escape during challenge loading and successful submission', async () => {
    let resolveChallenge!: () => void;
    let resolveSuccess!: () => void;
    auth.generateReauthToken.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveChallenge = resolve;
      })
    );
    const onClose = vi.fn();
    const onSuccess = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSuccess = resolve;
        })
    );
    render(<ReauthModal isOpen onClose={onClose} onSuccess={onSuccess} />);

    const dialog = screen.getByRole('dialog', { name: 'Re-authenticate' });
    const close = screen.getByRole('button', { name: 'Close re-authentication dialog' });
    expect((close as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => resolveChallenge());
    fireEvent.change(screen.getByRole('textbox', { name: 'Verification code' }), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('fresh-token'));

    expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(
      true
    );
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => resolveSuccess());
  });
});
