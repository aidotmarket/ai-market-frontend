// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import VerifyEmailPage from './page';

const { verifyEmail } = vi.hoisted(() => ({ verifyEmail: vi.fn() }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock('@/api/auth', () => ({ verifyEmail }));
afterEach(cleanup);

it('explains an incomplete link and keeps the sign-in recovery action', async () => {
  render(<VerifyEmailPage />);
  expect(await screen.findByText('This link is incomplete. Open the latest email from us, or request a new one from the sign-in page.')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Back to sign in' }).getAttribute('href')).toBe('/login');
  expect(verifyEmail).not.toHaveBeenCalled();
});
