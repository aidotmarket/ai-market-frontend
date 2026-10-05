// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NewsletterForm from './NewsletterForm';

const post = vi.hoisted(() => vi.fn());
vi.mock('@/api/client', () => ({ api: { post } }));

beforeEach(() => {
  post.mockReset();
  post.mockResolvedValue({ data: { success: true, message: 'Saved' } });
});
afterEach(cleanup);

function enterEmail(email = 'reader@example.com') {
  const input = screen.getByRole('textbox', { name: 'Newsletter email' }) as HTMLInputElement;
  fireEvent.change(input, { target: { value: email } });
  return input;
}

function submit() {
  fireEvent.submit(screen.getByRole('form', { name: 'Newsletter subscription' }));
}

function enterName(name = '  Max Reader  ') {
  const input = screen.getByRole('textbox', { name: 'Name (optional)' }) as HTMLInputElement;
  fireEvent.change(input, { target: { value: name } });
  return input;
}

describe('NewsletterForm', () => {
  it('has required email and accessible optional name with native keyboard access and linked consent', () => {
    render(<NewsletterForm />);
    const input = screen.getByRole('textbox', { name: 'Newsletter email' }) as HTMLInputElement;
    expect(input.type).toBe('email');
    expect(input.required).toBe(true);
    expect(input.autocomplete).toBe('email');
    expect(input.tabIndex).toBe(0);
    expect((screen.getByRole('button', { name: 'Subscribe' }) as HTMLButtonElement).type).toBe('submit');
    expect(screen.getAllByRole('textbox')).toHaveLength(2);
    const name = screen.getByRole('textbox', { name: 'Name (optional)' }) as HTMLInputElement;
    expect(name.required).toBe(false);
    expect(name.hasAttribute('required')).toBe(false);
    expect(name.autocomplete).toBe('name');
    expect(name.maxLength).toBe(200);
    expect(name.tabIndex).toBe(0);
    name.focus();
    expect(document.activeElement).toBe(name);
    const consent = document.getElementById(input.getAttribute('aria-describedby')!);
    expect(consent?.textContent).toContain('you subscribe to the ai.market newsletter');
    expect(screen.getByRole('link', { name: 'Privacy Notice' }).getAttribute('href')).toBe('/legal/privacy');
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('link', { name: /sign in/i })).toBeNull();
    input.focus();
    expect(document.activeElement).toBe(input);
  });

  it.each(['', 'not-an-email', 'reader@', 'reader@example', 'reader@@example.com'])('rejects invalid email %j inline and focuses the field', (email) => {
    render(<NewsletterForm />);
    const input = enterEmail(email);
    submit();
    expect(post).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('Enter a valid email address');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toContain(screen.getByRole('alert').id);
    expect(document.activeElement).toBe(input);
  });

  it('submits only trimmed email via the client and acknowledges saved preference without claiming mail was sent', async () => {
    render(<NewsletterForm />);
    enterEmail('  reader@example.com  ');
    submit();
    expect(post).toHaveBeenCalledWith('/newsletter-subscribe', { email: 'reader@example.com' }, { timeout: 15_000 });
    expect((await screen.findByText('Your newsletter preference has been saved.')).getAttribute('role')).toBe('status');
    expect((screen.getByRole('button', { name: 'Subscribe' }) as HTMLButtonElement).disabled).toBe(true);
    submit();
    expect(post).toHaveBeenCalledOnce();
    expect(screen.queryByText(/email.*sent|confirmation.*sent/i)).toBeNull();
  });

  it('includes a trimmed nonblank optional name', async () => {
    render(<NewsletterForm />);
    enterEmail();
    enterName();
    submit();
    await screen.findByText('Your newsletter preference has been saved.');
    expect(post.mock.calls[0][1]).toEqual({ email: 'reader@example.com', name: 'Max Reader' });
  });

  it.each(['', '   ', '\t  '])('omits blank optional name %j', async (name) => {
    render(<NewsletterForm />);
    enterEmail();
    enterName(name);
    submit();
    await screen.findByText('Your newsletter preference has been saved.');
    expect(post.mock.calls[0][1]).toEqual({ email: 'reader@example.com' });
  });

  it('prevents repeated submits while pending and preserves the submitted value', async () => {
    let resolve!: (value: unknown) => void;
    post.mockReturnValue(new Promise((done) => { resolve = done; }));
    render(<NewsletterForm />);
    const input = enterEmail();
    const name = enterName();
    act(() => { submit(); submit(); });
    expect(post).toHaveBeenCalledOnce();
    expect(screen.getByRole('status').textContent).toBe('Saving your newsletter preference...');
    expect((screen.getByRole('button', { name: 'Saving...' }) as HTMLButtonElement).disabled).toBe(true);
    expect(input.readOnly).toBe(true);
    expect(name.readOnly).toBe(true);
    expect(name.value).toBe('  Max Reader  ');
    expect(input.value).toBe('reader@example.com');
    await act(async () => { resolve({ data: { success: true, message: 'Saved' } }); });
    expect(input.readOnly).toBe(false);
    expect(name.readOnly).toBe(false);
    expect(screen.getByRole('status').textContent).toBe('Your newsletter preference has been saved.');
  });

  it.each([
    ['network failure', () => Promise.reject(new Error('offline'))],
    ['persistence failure', () => Promise.reject({ response: { status: 503 } })],
    ['structured validation failure', () => Promise.reject({ response: { status: 422, data: { detail: [{ msg: 'invalid' }] } } })],
    ['unconfirmed response', () => Promise.resolve({ data: { success: false, message: 'not saved' } })],
  ])('keeps email and name and offers retry after %s, then succeeds', async (_label, failure) => {
    post.mockImplementationOnce(failure);
    render(<NewsletterForm />);
    const input = enterEmail();
    const name = enterName();
    submit();
    expect((await screen.findByRole('alert')).textContent).toContain('Please try again');
    expect(input.value).toBe('reader@example.com');
    expect(name.value).toBe('  Max Reader  ');
    expect(name.readOnly).toBe(false);
    expect(input.getAttribute('aria-invalid')).toBe('false');
    expect(screen.getByRole('status').textContent).toBe('');
    const button = screen.getByRole('button', { name: 'Subscribe' }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    button.focus();
    // Native button activation from keyboard produces a click with detail 0.
    fireEvent.click(button, { detail: 0 });
    await screen.findByText('Your newsletter preference has been saved.');
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[1][1]).toEqual({ email: 'reader@example.com', name: 'Max Reader' });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('allows a new email after success and clears stale validation when editing', async () => {
    render(<NewsletterForm />);
    enterEmail('invalid');
    submit();
    enterEmail();
    expect(screen.queryByRole('alert')).toBeNull();
    submit();
    await screen.findByText('Your newsletter preference has been saved.');
    enterEmail('another@example.com');
    expect(screen.getByRole('status').textContent).toBe('');
    submit();
    await screen.findByText('Your newsletter preference has been saved.');
    expect(post.mock.calls[1][1]).toEqual({ email: 'another@example.com' });
  });
});
