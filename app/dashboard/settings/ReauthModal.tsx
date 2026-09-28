'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { AxiosError } from 'axios';
import { isSsoManaged2FAError, SSO_MANAGED_2FA_MESSAGE, submitReauth, verifyReauthMagicLink } from '@/api/auth';

const DIALOG_DESCRIPTION_ID = 'reauth-dialog-description';
const ERROR_ID = 'reauth-error';

interface ReauthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (reauthToken: string) => void | Promise<void>;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
  method?: 'password' | 'totp' | 'magic_link';
}

function isAvailableFocusTarget(element: HTMLElement | null): element is HTMLElement {
  if (!element?.isConnected || element === document.body) return false;
  if (element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true') {
    return false;
  }

  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    if (
      current.hidden ||
      current.hasAttribute('inert') ||
      current.getAttribute('aria-hidden') === 'true' ||
      current.matches('fieldset[disabled]')
    ) {
      return false;
    }
    const style = window.getComputedStyle(current);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.visibility === 'collapse'
    ) {
      return false;
    }
  }

  return true;
}

function isAutomaticFocusTarget(element: HTMLElement | null): element is HTMLElement {
  return isAvailableFocusTarget(element) && element.tabIndex >= 0;
}

function isExplicitFallbackFocusTarget(element: HTMLElement | null): element is HTMLElement {
  return (
    isAvailableFocusTarget(element) &&
    (element.tabIndex >= 0 || element.hasAttribute('tabindex'))
  );
}

function getReauthErrorMessage(error: unknown): string {
  if (isSsoManaged2FAError(error)) return SSO_MANAGED_2FA_MESSAGE;
  if (!(error instanceof AxiosError)) {
    return 'Failed to verify the re-authentication code.';
  }

  if (error.response?.status === 429) {
    return 'Too many attempts. Wait a moment before trying again.';
  }

  const detail = error.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim().length > 0) {
    return detail;
  }

  return 'Failed to verify the re-authentication code.';
}

export default function ReauthModal({
  isOpen,
  onClose,
  onSuccess,
  fallbackFocusRef,
  method = 'totp',
}: ReauthModalProps) {
  const [code, setCode] = useState('');
  const [linkSent, setLinkSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const initialFocusRef = useRef<HTMLInputElement>(null);
  const sendButtonRef = useRef<HTMLButtonElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (method === 'magic_link' ? sendButtonRef : initialFocusRef).current?.focus();

    return () => {
      queueMicrotask(() => {
        if (isAutomaticFocusTarget(previouslyFocused)) {
          previouslyFocused.focus();
          return;
        }

        const fallbackFocusTarget = fallbackFocusRef?.current ?? null;
        if (isExplicitFallbackFocusTarget(fallbackFocusTarget)) {
          fallbackFocusTarget.focus();
        }
      });
    };
  }, [fallbackFocusRef, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setCode('');
      setLinkSent(false);
      setError('');
      setSubmitting(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && method === 'magic_link' && linkSent) linkInputRef.current?.focus();
  }, [isOpen, linkSent, method]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    (method === 'magic_link' ? linkSent ? linkInputRef : sendButtonRef : initialFocusRef).current?.focus();
    setSubmitting(true);
    setError('');

    try {
      if (method === 'magic_link' && !linkSent) {
        const result = await submitReauth('', 'magic_link');
        if (result.method !== 'magic_link' || result.token) {
          throw new Error('Unexpected magic-link response');
        }
        setLinkSent(true);
        return;
      }
      let magicLinkToken = '';
      if (method === 'magic_link') {
        try {
          const link = new URL(code.trim());
          if (link.origin !== 'https://www.ai.market' || link.pathname !== '/auth/verify' || link.searchParams.get('purpose') !== 'reauth') {
            throw new Error('Invalid link');
          }
          magicLinkToken = link.searchParams.get('token') ?? '';
        } catch {
          setError('Paste the re-authentication link from your email.');
          return;
        }
        if (!magicLinkToken) {
          setError('Paste the re-authentication link from your email.');
          return;
        }
      }
      const result = method === 'password'
        ? await submitReauth(code, 'password')
        : method === 'magic_link'
          ? await verifyReauthMagicLink(magicLinkToken)
          : await submitReauth(code.trim());
      if (typeof result.token !== 'string' || result.token.length === 0) {
        throw new Error('Missing re-authentication token');
      }
      await onSuccess(result.token);
      setCode('');
      setLinkSent(false);
    } catch (error) {
      setError(getReauthErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const isWorking = submitting;

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (!isWorking) onClose();
      return;
    }
    if (event.key !== 'Tab' || !dialogRef.current) return;

    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      )
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 px-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reauth-dialog-title"
        aria-describedby={`${DIALOG_DESCRIPTION_ID}${error ? ` ${ERROR_ID}` : ''}`}
        onKeyDown={handleDialogKeyDown}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="reauth-dialog-title" className="text-lg font-semibold text-gray-900">
              Re-authenticate
            </h2>
            <p id={DIALOG_DESCRIPTION_ID} className="mt-1 text-sm text-gray-500">
              {method === 'password' ? 'Enter your password to continue.' : method === 'magic_link' ? linkSent ? 'Copy the link from your email and paste it here to continue.' : 'Send a re-authentication link to your account email.' : 'Enter the current code from your authenticator app to continue.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 disabled:opacity-50"
            aria-label="Close re-authentication dialog"
          >
            Close
          </button>
        </div>

        {error && (
          <div
            id={ERROR_ID}
            role="alert"
            aria-atomic="true"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        {method !== 'magic_link' || linkSent ? <div className="mt-4">
          <label htmlFor="reauthCode" className="block text-sm font-medium text-gray-700 mb-1">
            {method === 'password' ? 'Password' : method === 'magic_link' ? 'Email link' : 'Verification code'}
          </label>
          <input
            ref={method === 'magic_link' ? linkInputRef : initialFocusRef}
            id="reauthCode"
            type={method === 'password' ? 'password' : 'text'}
            inputMode={method === 'magic_link' || method === 'password' ? undefined : 'numeric'}
            autoComplete={method === 'password' ? 'current-password' : method === 'magic_link' ? 'off' : 'one-time-code'}
            maxLength={method === 'magic_link' || method === 'password' ? undefined : 8}
            value={code}
            aria-describedby={error ? ERROR_ID : undefined}
            onChange={(event) => setCode(method === 'password' || method === 'magic_link' ? event.target.value : event.target.value.replace(/\s/g, ''))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#3F51B5]"
            placeholder={method === 'password' ? 'Enter password' : method === 'magic_link' ? 'Paste email link' : 'Enter code'}
          />
        </div> : null}

        <div className="mt-6 flex justify-end gap-3">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              ref={method === 'magic_link' && !linkSent ? sendButtonRef : undefined}
              type="button"
              onClick={handleSubmit}
              disabled={submitting || (method !== 'magic_link' || linkSent) && code.trim().length === 0}
              className="rounded-lg bg-[#3F51B5] px-4 py-2 text-sm font-medium text-white hover:bg-[#3545a0] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Verifying...' : method === 'magic_link' && !linkSent ? 'Send link' : 'Continue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
