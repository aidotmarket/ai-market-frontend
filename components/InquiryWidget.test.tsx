// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConversationDetail } from '@/types';
import { AxiosError } from 'axios';

const mocks = vi.hoisted(() => ({
  auth: { isAuthenticated: false },
  createInquiry: vi.fn(),
  replyToConversation: vi.fn(),
  updateSince: vi.fn(),
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: () => mocks.auth,
}));

vi.mock('@/api/conversations', () => ({
  createInquiry: mocks.createInquiry,
  replyToConversation: mocks.replyToConversation,
}));

vi.mock('@/hooks/useConversationPoll', () => ({
  useConversationPoll: () => ({ updateSince: mocks.updateSince }),
}));

import InquiryWidget from './InquiryWidget';

const SESSION_URL = 'http://localhost:8000/api/allai/support/anonymous/session';
const MESSAGE_URL = 'http://localhost:8000/api/allai/support/anonymous/message';

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

let fetchMock: FetchMock;

function response(status: number, data: unknown = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    body: null,
    json: vi.fn().mockResolvedValue(data),
  } as unknown as Response;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function progressiveSseResponse(firstText: string, secondText: string) {
  const continueStream = deferred<void>();
  let readCount = 0;
  const encode = (text: string) => (
    new TextEncoder().encode(`event: delta\ndata: ${JSON.stringify({ text })}\n\n`)
  );
  const reader = {
    read: vi.fn(async () => {
      readCount += 1;
      if (readCount === 1) return { done: false, value: encode(firstText) };
      if (readCount === 2) {
        await continueStream.promise;
        return { done: false, value: encode(secondText) };
      }
      return { done: true, value: undefined };
    }),
    cancel: vi.fn(),
    releaseLock: vi.fn(),
  };

  return {
    response: {
      status: 200,
      ok: true,
      body: { getReader: () => reader },
      json: vi.fn(),
    } as unknown as Response,
    continue: () => continueStream.resolve(),
  };
}

function renderWidget() {
  return render(
    <InquiryWidget
      listingId="listing-123"
      listingSlug="weather-observations"
      listingTitle="Weather Observations"
    />
  );
}

function typeQuestion(question: string) {
  fireEvent.change(screen.getByRole('textbox'), { target: { value: question } });
  fireEvent.click(screen.getByRole('button', { name: 'Submit Question' }));
}

function clickWithoutNavigation(link: HTMLElement) {
  link.addEventListener('click', (event) => event.preventDefault(), { once: true });
  fireEvent.click(link);
}

beforeEach(() => {
  mocks.auth.isAuthenticated = false;
  mocks.createInquiry.mockReset();
  mocks.replyToConversation.mockReset();
  mocks.updateSince.mockReset();
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
  Element.prototype.scrollIntoView = vi.fn();
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('InquiryWidget', () => {
  it('creates an anonymous session, sends listing context, and renders streamed deltas', async () => {
    const stream = progressiveSseResponse('It contains ', 'daily readings.');
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url === SESSION_URL) return response(200, { session_id: 'anon-session' });
      if (url === MESSAGE_URL) return stream.response;
      throw new Error(`Unexpected request: ${url}`);
    });

    renderWidget();
    typeQuestion('How often is it updated?');

    expect(await screen.findByText('It contains')).toBeTruthy();
    stream.continue();
    expect(await screen.findByText('It contains daily readings.')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe(SESSION_URL);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      body: '{}',
    });
    expect(fetchMock.mock.calls[1][0]).toBe(MESSAGE_URL);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      session_id: 'anon-session',
      message: 'Question about the listing "Weather Observations" (slug: weather-observations):\n\nHow often is it updated?',
      context: {
        page: '/listings/weather-observations',
        listing_id: 'listing-123',
      },
      locale: 'en',
      stream: true,
    });
    expect(screen.getByText('Want to contact the seller?')).toBeTruthy();
    const sellerLink = screen.getByRole('link', { name: 'Sign in to ask the seller.' });
    expect(sellerLink.getAttribute('href')).toBe('/login?redirect=/listings/weather-observations');
    clickWithoutNavigation(sellerLink);
    expect(sessionStorage.getItem('inquiry_draft_listing-123')).toBe(
      'How often is it updated?'
    );
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('');
  });

  it('shows an actionable still-working state after eight seconds and resets on completion', async () => {
    vi.useFakeTimers();
    const stream = progressiveSseResponse('It contains ', 'daily readings.');
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url === SESSION_URL) return response(200, { session_id: 'anon-session' });
      if (url === MESSAGE_URL) return stream.response;
      throw new Error(`Unexpected request: ${url}`);
    });

    try {
      renderWidget();
      expect(screen.getByText(
        'allAI checks current public information to answer questions about this listing.'
      )).toBeTruthy();
      expect(screen.queryByText(/your question will be forwarded to the seller/i)).toBeNull();
      const status = screen.getByRole('status');
      expect(status.textContent).toBe('');
      expect(status.className).toBe('sr-only');

      typeQuestion('  How often is it updated?  ');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(7_999);
      });
      expect(screen.getByRole('button', { name: 'Submitting...' })).toBeTruthy();
      expect(status.textContent).toBe('');
      expect(status.className).toBe('sr-only');

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(screen.getByRole('button', { name: 'Still working...' })).toBeTruthy();
      expect(screen.getByRole('status')).toBe(status);
      expect(status.textContent).toContain(
        'allAI is checking current public information. You may keep waiting'
      );
      expect(status.className).not.toContain('sr-only');
      const sellerLink = screen.getByRole('link', { name: 'sign in to ask the seller.' });
      expect(sellerLink.getAttribute('href')).toBe(
        '/login?redirect=/listings/weather-observations'
      );
      expect(sellerLink.getAttribute('href')).not.toContain('How');
      clickWithoutNavigation(sellerLink);
      expect(sessionStorage.getItem('inquiry_draft_listing-123')).toBe(
        'How often is it updated?'
      );

      await act(async () => {
        stream.continue();
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByText('It contains daily readings.')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Submit Question' })).toBeTruthy();
      expect(status.textContent).toBe('');
      expect(status.className).toBe('sr-only');
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the anonymous wait label and notice coherent through an auth hydration flip', async () => {
    vi.useFakeTimers();
    const pendingSession = deferred<Response>();
    fetchMock.mockReturnValue(pendingSession.promise);

    try {
      const view = renderWidget();
      typeQuestion('Can the seller clarify this?');

      mocks.auth.isAuthenticated = true;
      view.rerender(
        <InquiryWidget
          listingId="listing-123"
          listingSlug="weather-observations"
          listingTitle="Weather Observations"
        />
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(8_000);
      });

      expect(screen.getByRole('button', { name: 'Still working...' })).toBeTruthy();
      expect(screen.getByRole('status').textContent).toContain(
        'sign in to ask the seller.'
      );

      pendingSession.resolve(response(500));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('resets the anonymous wait state when a terminal error arrives after eight seconds', async () => {
    vi.useFakeTimers();
    const pendingSession = deferred<Response>();
    fetchMock.mockReturnValue(pendingSession.promise);

    try {
      renderWidget();
      typeQuestion('Is this still available?');

      await act(async () => {
        await vi.advanceTimersByTimeAsync(8_000);
      });
      expect(screen.getByRole('button', { name: 'Still working...' })).toBeTruthy();
      expect(screen.getByRole('status').textContent).not.toBe('');

      pendingSession.resolve(response(500));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(screen.getByRole('alert').textContent).toContain(
        "We couldn't get an answer. Please try again."
      );
      expect(screen.getByRole('button', { name: 'Submit Question' })).toBeTruthy();
      expect(screen.getByRole('status').textContent).toBe('');
      expect(screen.getByRole('status').className).toBe('sr-only');
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ['before', 7_999],
    ['after', 8_000],
  ])('cleans up without stale timers or state warnings when unmounted %s the wait fires', async (
    _timing,
    elapsed
  ) => {
    vi.useFakeTimers();
    const pendingSession = deferred<Response>();
    fetchMock.mockReturnValue(pendingSession.promise);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const view = renderWidget();
      typeQuestion('Will this request outlive the widget?');

      await act(async () => {
        await vi.advanceTimersByTimeAsync(elapsed);
      });
      view.unmount();
      expect(vi.getTimerCount()).toBe(0);

      pendingSession.resolve(response(500));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      expect(vi.getTimerCount()).toBe(0);
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
      vi.useRealTimers();
    }
  });

  it('keeps authenticated submission on the existing inquiry path', async () => {
    const conversation: ConversationDetail = {
      id: 'conversation-1',
      listing_id: 'listing-123',
      listing_title: 'Weather Observations',
      buyer_id: 'buyer-1',
      seller_id: 'seller-1',
      status: 'auto_answered',
      last_message_at: '2026-08-05T10:00:00Z',
      unread_by_buyer: 0,
      unread_by_seller: 0,
      messages: [{
        id: 'message-1',
        conversation_id: 'conversation-1',
        role: 'buyer',
        content: 'Is this current?',
        created_at: '2026-08-05T10:00:00Z',
      }],
      created_at: '2026-08-05T10:00:00Z',
    };
    mocks.auth.isAuthenticated = true;
    mocks.createInquiry.mockResolvedValue(conversation);

    renderWidget();
    typeQuestion('Is this current?');

    await waitFor(() => {
      expect(mocks.createInquiry).toHaveBeenCalledWith('listing-123', 'Is this current?');
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await screen.findByText('Your Inquiry')).toBeTruthy();
  });

  it('keeps an authenticated mediation rejection visible after submission ends', async () => {
    mocks.auth.isAuthenticated = true;
    const error = new AxiosError('Message rejected');
    error.response = {
      status: 422,
      data: { detail: 'Message held for review. Please revise.' },
    } as typeof error.response;
    mocks.createInquiry.mockRejectedValue(error);

    renderWidget();
    typeQuestion('Please contact me at 555-0100.');

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Message held for review. Please revise.'
    );
    expect(screen.getByRole('button', { name: 'Submit Question' })).toBeTruthy();
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(
      'Please contact me at 555-0100.'
    );
  });

  it('uses a safe fallback for structured validation details', async () => {
    mocks.auth.isAuthenticated = true;
    const error = new AxiosError('Validation failed');
    error.response = {
      status: 422,
      data: {
        detail: [{
          loc: ['body', 'question'],
          msg: 'String should have at least 10 characters',
          type: 'string_too_short',
        }],
      },
    } as typeof error.response;
    mocks.createInquiry.mockRejectedValue(error);

    renderWidget();
    typeQuestion('short');

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Failed to submit question.'
    );
    expect(screen.getByRole('button', { name: 'Submit Question' })).toBeTruthy();
  });

  it('surfaces an anonymous failure and preserves the typed question', async () => {
    fetchMock.mockResolvedValue(response(500));

    renderWidget();
    typeQuestion('Please do not lose this question');

    expect((await screen.findByRole('alert')).textContent).toContain(
      "We couldn't get an answer. Please try again."
    );
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(
      'Please do not lose this question'
    );
    expect(screen.queryByText('Want to contact the seller?')).toBeNull();
    expect(mocks.createInquiry).not.toHaveBeenCalled();
  });
});
