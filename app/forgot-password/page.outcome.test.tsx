// @vitest-environment jsdom
import type { ComponentProps } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError } from 'axios';
import ForgotPasswordPage from './page';
import { forgotPassword } from '@/api/auth';

const shared = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/api/auth', () => ({ forgotPassword: vi.fn() }));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ toast: shared.toast }) }));
vi.mock('next/link', () => ({
  default: ({ children, ...props }: ComponentProps<'a'>) => <a {...props}>{children}</a>,
}));

const accepted = 'If an account exists, a reset link has been sent';
const email = 'fixture@example.invalid';
const unconfirmed = "We couldn't confirm your reset request. Please try again.";

function deferred() {
  let resolve!: (value: { message: string }) => void;
  const promise = new Promise<{ message: string }>((yes) => { resolve = yes; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.resetAllMocks();
  const deny = () => { throw new Error('Unexpected network access in frontend outcome test'); };
  vi.stubGlobal('fetch', vi.fn(deny));
  vi.stubGlobal('XMLHttpRequest', vi.fn(deny));
  vi.stubGlobal('WebSocket', vi.fn(deny));
  vi.stubGlobal('crypto', { randomUUID: () => '00000000-0000-4000-8000-000000000460' });
});

afterEach(() => {
  cleanup();
  expect(fetch).not.toHaveBeenCalled();
  expect(XMLHttpRequest).not.toHaveBeenCalled();
  expect(WebSocket).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

async function clickSubmit() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
  });
}

function enterEmail() {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
}

function expectAccepted() {
  expect(screen.getByText(accepted)).toBeTruthy();
  expect(shared.toast).toHaveBeenCalledExactlyOnceWith(accepted, 'success');
  expect(screen.queryByLabelText('Email')).toBeNull();
  expect(screen.getByRole('link', { name: 'Back to login' }).getAttribute('href')).toBe('/login');
}

describe('password-reset request acknowledgement', () => {
  it.each([
    ['transport', new Error('synthetic offline account detail')],
    ['server', new AxiosError('synthetic server failure', 'ERR_BAD_RESPONSE', undefined, undefined,
      { status: 503, data: { message: 'synthetic private provider detail' } } as never)],
    ['rate limit', new AxiosError('synthetic throttled', 'ERR_BAD_REQUEST', undefined, undefined,
      { status: 429, data: { detail: 'synthetic private limiter detail' } } as never)],
  ])('keeps the form after %s rejection and recovers only on explicit retry', async (_name, error) => {
    const retry = deferred();
    vi.mocked(forgotPassword).mockRejectedValueOnce(error).mockReturnValueOnce(retry.promise);
    render(<ForgotPasswordPage />);
    enterEmail();
    await clickSubmit();

    expect(screen.getByRole('alert').textContent).toBe(unconfirmed);
    expect(document.body.textContent).not.toMatch(/synthetic|sent|accepted|success/i);
    expect(shared.toast).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe(email);
    expect((screen.getByRole('button', { name: 'Send reset link' }) as HTMLButtonElement).disabled).toBe(false);
    expect(forgotPassword).toHaveBeenCalledExactlyOnceWith(email);

    // Rendering and another event-loop turn must not retry a rejected request.
    await act(async () => { await new Promise<void>((resolve) => setTimeout(resolve, 0)); });
    expect(forgotPassword).toHaveBeenCalledTimes(1);
    await clickSubmit();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(forgotPassword).toHaveBeenCalledTimes(2);
    expect(forgotPassword).toHaveBeenNthCalledWith(2, email);
    expect((screen.getByRole('button', { name: 'Sending reset link...' }) as HTMLButtonElement).disabled).toBe(true);
    expect(shared.toast).not.toHaveBeenCalled();
    await act(async () => { retry.resolve({ message: accepted }); });
    expectAccepted();
    expect(forgotPassword).toHaveBeenCalledTimes(2);
  });

  it('preserves the generic acknowledgement and login link for an accepted request', async () => {
    vi.mocked(forgotPassword).mockResolvedValueOnce({ message: accepted });
    render(<ForgotPasswordPage />);
    enterEmail();
    await clickSubmit();
    expectAccepted();
    expect(forgotPassword).toHaveBeenCalledExactlyOnceWith(email);
  });

  it('prevents duplicate button activation and success claims while pending', async () => {
    const request = deferred();
    vi.mocked(forgotPassword).mockReturnValueOnce(request.promise);
    render(<ForgotPasswordPage />);
    enterEmail();
    await clickSubmit();
    const button = screen.getByRole('button', { name: 'Sending reset link...' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.queryByText(accepted)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(shared.toast).not.toHaveBeenCalled();
    fireEvent.click(button);
    fireEvent.click(button);
    expect(forgotPassword).toHaveBeenCalledExactlyOnceWith(email);
    await act(async () => { request.resolve({ message: accepted }); });
    expectAccepted();
  });
});
