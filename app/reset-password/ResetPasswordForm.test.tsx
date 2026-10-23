// @vitest-environment jsdom
import type { ComponentProps } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError } from 'axios';
import ResetPasswordForm from './ResetPasswordForm';

const mocks = vi.hoisted(() => ({ reset: vi.fn(), toast: vi.fn(), search: '' }));
vi.mock('@/api/auth', () => ({ resetPassword: mocks.reset }));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(mocks.search) }));
vi.mock('next/link', () => ({
  default: ({ children, ...props }: ComponentProps<'a'>) => <a {...props}>{children}</a>,
}));

const token = 'reset-fixture';
const password = 'fixture-only';
const fallback = 'This reset link is invalid or has expired.';

function rejected(data: unknown) {
  const error = new AxiosError('Synthetic refusal');
  error.response = { data, status: 422, statusText: 'Unprocessable Entity', headers: {}, config: {} as never };
  return error;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.search = new URLSearchParams({ token }).toString();
  const deny = () => { throw new Error('Unexpected network access in reset form test'); };
  vi.stubGlobal('fetch', vi.fn(deny));
  vi.stubGlobal('XMLHttpRequest', vi.fn(deny));
});

afterEach(() => {
  cleanup();
  expect(fetch).not.toHaveBeenCalled();
  expect(XMLHttpRequest).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

async function submit(value = password, confirmation = value) {
  render(<ResetPasswordForm />);
  fireEvent.change(screen.getByLabelText('New password'), { target: { value } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: confirmation } });
  await act(async () => {
    fireEvent.submit(screen.getByRole('button', { name: 'Reset password' }).closest('form')!);
  });
}

async function expectRecovery(message: string, value = password) {
  expect(screen.getByRole('alert').textContent).toBe(`${message} Request a new reset link`);
  expect(screen.getByRole('link', { name: 'Request a new reset link' }).getAttribute('href')).toBe('/forgot-password');
  expect(screen.getByRole('link', { name: 'Request another reset email' }).getAttribute('href')).toBe('/forgot-password');
  expect((screen.getByLabelText('New password') as HTMLInputElement).value).toBe(value);
  expect((screen.getByLabelText('Confirm new password') as HTMLInputElement).value).toBe(value);
  expect((screen.getByRole('button', { name: 'Reset password' }) as HTMLButtonElement).disabled).toBe(false);
  expect(screen.queryByRole('link', { name: 'Continue to login' })).toBeNull();
  const visible = document.body.textContent + JSON.stringify(mocks.toast.mock.calls);
  expect(visible).not.toMatch(/reset-fixture|fixture-only|DO_NOT_ECHO|\[object Object\]/);
  expect(mocks.toast).toHaveBeenCalledExactlyOnceWith(message, 'error');
  await act(async () => { await new Promise<void>((resolve) => setTimeout(resolve, 0)); });
  expect(mocks.reset).toHaveBeenCalledExactlyOnceWith(token, value);
}

describe('reset password error rendering', () => {
  it('renders only useful validation msg strings for a four-code-point password rejection', async () => {
    const unicodePassword = String.fromCodePoint(0x1f9ea).repeat(4);
    expect(unicodePassword.length).toBe(8);
    expect(Array.from(unicodePassword)).toHaveLength(4);
    mocks.reset.mockRejectedValue(rejected({ detail: [
      { loc: ['body', 'new_password'], msg: 'String should have at least 8 characters',
        input: 'DO_NOT_ECHO_INPUT', ctx: { password }, token },
      null, 7, 'DO_NOT_ECHO_RAW_ENTRY', {}, { msg: '  ' }, { msg: { input: 'DO_NOT_ECHO_OBJECT' } },
      { msg: 'Choose another value.', loc: ['DO_NOT_ECHO_LOCATION'] },
    ] }));
    await submit(unicodePassword);
    await expectRecovery('String should have at least 8 characters Choose another value.', unicodePassword);
  });

  it.each([
    ['message precedence', { message: 'Readable message', detail: 'Other detail' }, 'Readable message'],
    ['message over array', { message: 'Readable message', detail: [{ msg: 'Other detail' }] }, 'Readable message'],
    ['structured message', { message: { input: 'DO_NOT_ECHO' }, detail: 'Readable detail' }, 'Readable detail'],
    ['blank message', { message: ' \n ', detail: 'Readable detail' }, 'Readable detail'],
    ['numeric message', { message: 42, detail: [{ msg: 'Readable validation' }] }, 'Readable validation'],
    ['structured values', { message: { input: 'DO_NOT_ECHO' }, detail: { token: 'DO_NOT_ECHO' } }, fallback],
    ['blank strings', { message: '', detail: '  ' }, fallback],
    ['malformed array', { detail: [null, false, {}, { msg: 42 }, { msg: '' }, { msg: ['DO_NOT_ECHO'] }] }, fallback],
    ['missing fields', {}, fallback],
    ['null body', null, fallback],
    ['primitive body', 'DO_NOT_ECHO', fallback],
  ])('preserves recovery for %s', async (_name, data, expected) => {
    mocks.reset.mockRejectedValue(rejected(data));
    await submit();
    await expectRecovery(expected);
  });

  it('uses the fallback for a transport error', async () => {
    mocks.reset.mockRejectedValue(new Error('DO_NOT_ECHO_TRANSPORT'));
    await submit();
    await expectRecovery(fallback);
  });

  it.each([
    ['missing token', '', password, password, 'This reset link is invalid or incomplete. Request a new one.'],
    ['short password', token, 'short', 'short', 'Password must be at least 8 characters long.'],
    ['mismatched confirmation', token, password, 'different-password', 'Passwords do not match.'],
  ])('keeps the %s guard local', async (_name, resetToken, value, confirmation, expected) => {
    mocks.search = new URLSearchParams({ token: resetToken }).toString();
    await submit(value, confirmation);
    expect(screen.getByRole('alert').textContent).toBe(`${expected} Request a new reset link`);
    expect(mocks.reset).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it('preserves acknowledged success and the login path', async () => {
    mocks.reset.mockResolvedValue({ message: 'Synthetic reset acknowledged' });
    await submit();
    expect(screen.getByText('Synthetic reset acknowledged')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Continue to login' }).getAttribute('href')).toBe('/login');
    expect(screen.queryByLabelText('New password')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(mocks.toast).toHaveBeenCalledExactlyOnceWith('Synthetic reset acknowledged', 'success');
    expect(mocks.reset).toHaveBeenCalledExactlyOnceWith(token, password);
  });
});
