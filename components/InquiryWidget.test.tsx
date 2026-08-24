// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    expect(screen.getByText('Want the seller to answer personally?')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Sign in to forward this question.' }).getAttribute('href')
    ).toBe('/login?redirect=/listings/weather-observations');
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('');
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
    expect(screen.queryByText('Want the seller to answer personally?')).toBeNull();
    expect(mocks.createInquiry).not.toHaveBeenCalled();
  });
});
