'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { subscribeToNewsletter } from '@/api/newsletter';

export default function NewsletterForm() {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [savedEmail, setSavedEmail] = useState('');
  const [error, setError] = useState('');
  const [invalid, setInvalid] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = email.trim();
    if (submitting.current || (savedEmail && savedEmail === address)) return;

    setError('');
    if (!input.current?.validity.valid || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setInvalid(true);
      setError('Enter a valid email address, such as you@example.com.');
      input.current?.focus();
      return;
    }

    setInvalid(false);
    submitting.current = true;
    setPending(true);
    try {
      await subscribeToNewsletter({ email: address });
      setSavedEmail(address);
    } catch {
      setError('We could not save your newsletter preference. Please try again.');
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="Newsletter subscription" className="w-full sm:max-w-sm">
      <label htmlFor={`${id}-email`} className="block text-sm font-medium text-[#e2e8f0] mb-2">
        Newsletter email
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          ref={input}
          id={`${id}-email`}
          name="email"
          type="email"
          autoComplete="email"
          required
          readOnly={pending}
          value={email}
          aria-invalid={invalid}
          aria-describedby={`${id}-consent${error ? ` ${id}-error` : ''}`}
          onChange={(event) => {
            setEmail(event.target.value);
            setSavedEmail('');
            setError('');
            setInvalid(false);
          }}
          className="min-w-0 flex-1 rounded-md border border-[#6b7a8d] bg-[#1b2332] px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white"
        />
        <button
          type="submit"
          disabled={pending || !!savedEmail}
          className="rounded-md border border-[#6b7a8d] px-4 py-2.5 text-sm font-medium text-[#e2e8f0] hover:bg-white/[0.04] focus:outline-none focus:ring-2 focus:ring-white disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {pending ? 'Saving...' : 'Subscribe'}
        </button>
      </div>
      <p id={`${id}-consent`} className="mt-2 text-xs text-[#c1c9d4]">
        By selecting Subscribe, you subscribe to the ai.market newsletter. Read our{' '}
        <Link href="/legal/privacy" className="underline hover:text-white">Privacy Notice</Link>.
      </p>
      {error && <p id={`${id}-error`} role="alert" className="mt-2 text-sm text-red-200">{error}</p>}
      <p role="status" className="mt-2 text-sm text-[#e2e8f0]">
        {pending ? 'Saving your newsletter preference...' : savedEmail ? 'Your newsletter preference has been saved.' : ''}
      </p>
    </form>
  );
}
