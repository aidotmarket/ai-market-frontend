// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConversationDetail } from '@/types';
import { AxiosError } from 'axios';

const mocks = vi.hoisted(() => ({
  auth: { isAuthenticated: false, user: { id: 'viewer' }, token: 'synthetic' },
  createInquiry: vi.fn(),
  getConversation: vi.fn(),
  replyToConversation: vi.fn(),
  updateSince: vi.fn(),
}));

vi.mock('@/store/auth', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/store/auth')>(),
  useAuthStore: Object.assign(() => mocks.auth, { getState: () => mocks.auth, subscribe: () => () => {} }),
}));

vi.mock('@/api/conversations', () => ({
  createInquiry: mocks.createInquiry,
  getConversation: mocks.getConversation,
  replyToConversation: mocks.replyToConversation,
}));

vi.mock('@/hooks/useConversationPoll', () => ({
  useConversationPoll: () => ({ updateSince: mocks.updateSince }),
}));

vi.mock('next/navigation', () => ({ usePathname: () => '/listings/weather-observations' }));

import InquiryWidget from './InquiryWidget';
import ListingPurchaseAdvisory from './ListingPurchaseAdvisory';
import { AllAIProvider, useAllAI } from './allai/AllAIContext';

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

function completedSseResponse(text: string, event: Record<string, unknown> = {}) {
  let readCount = 0;
  const reader = {
    read: vi.fn(async () => {
      readCount += 1;
      if (readCount === 1) {
        return {
          done: false,
          value: new TextEncoder().encode(
            `data: ${JSON.stringify({ text, ...event })}\n\n`
          ),
        };
      }
      return { done: true, value: undefined };
    }),
    cancel: vi.fn(),
    releaseLock: vi.fn(),
  };

  return {
    status: 200,
    ok: true,
    body: { getReader: () => reader },
    json: vi.fn(),
  } as unknown as Response;
}

function pendingSseResponse() {
  const pendingRead = deferred<ReadableStreamReadResult<Uint8Array>>();
  const reader = {
    read: vi.fn(() => pendingRead.promise),
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
    reader,
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

function renderWidgetWithLanguagePicker() {
  function LanguagePicker() {
    const { setLocale } = useAllAI();
    return <button onClick={() => setLocale('es')}>Español</button>;
  }
  render(
    <AllAIProvider>
      <LanguagePicker />
      <InquiryWidget listingId="listing-123" listingSlug="weather-observations" listingTitle="Weather Observations" />
    </AllAIProvider>
  );
}

function renderSpanishWidget() {
  renderWidgetWithLanguagePicker();
  fireEvent.click(screen.getByRole('button', { name: 'Español' }));
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
  mocks.getConversation.mockReset();
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
  it('exposes the question input as the focusable target of the purchase advisory link', () => {
    render(<ListingPurchaseAdvisory price={10} scanFindings={null} />);
    renderWidget();

    const advisory = screen.getByRole('complementary', { name: 'Review before buying' });
    const link = screen.getByRole('link', { name: /^Ask the seller$/ });
    const question = screen.getByRole('textbox');
    const fragment = link.getAttribute('href');

    expect(advisory.contains(link)).toBe(true);
    expect(fragment).toBe('#ask-a-question');
    expect(document.querySelector(fragment!)).toBe(question);
    question.focus();
    expect(document.activeElement).toBe(question);
  });

  it('sends the selected language and shows actionable Spanish guidance on a network failure', async () => {
    fetchMock.mockResolvedValueOnce(response(200, { session_id: 'anon-session' }))
      .mockRejectedValueOnce(new Error('English network error'));
    renderSpanishWidget();
    typeQuestion('¿Qué formato tiene?');

    const alert = await screen.findByRole('alert');
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).locale).toBe('es');
    expect(alert.textContent).toContain('No pudimos obtener una respuesta. Prueba con una pregunta más concreta');
    expect(alert.textContent).not.toMatch(/English network error|couldn't get an answer/);
    expect(screen.getByRole('link', { name: 'Buscar en el catálogo' }).getAttribute('href')).toBe('/search');
    expect(screen.getByRole('link', { name: 'Contactar con soporte' }).getAttribute('href')).toBe('/support');
  });

  it('localizes the timeout guidance and retains the question and sign-in handoff', async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockResolvedValueOnce(response(200, { session_id: 'anon-session' }))
        .mockResolvedValueOnce(pendingSseResponse().response);
      renderSpanishWidget();
      typeQuestion('¿Cuál es la licencia?');
      await act(async () => { await vi.advanceTimersByTimeAsync(45_000); });

      expect(screen.getByRole('alert').textContent).toContain('La respuesta está tardando más de lo esperado.');
      expect(screen.queryByText(/longer than expected/)).toBeNull();
      expect(screen.getByRole('link', { name: 'Buscar en el catálogo' }).getAttribute('href')).toBe('/search');
      expect(screen.getByRole('link', { name: 'Contactar con soporte' }).getAttribute('href')).toBe('/support');
      const sellerLink = screen.getByRole('link', { name: 'Inicia sesión para preguntar al vendedor.' });
      clickWithoutNavigation(sellerLink);
      expect(sessionStorage.getItem('inquiry_draft_listing-123')).toBe('¿Cuál es la licencia?');
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(['/support', 'https://ai.market/support'])('renders the internal backend support link from %s', async (href) => {
    fetchMock.mockResolvedValueOnce(response(200, { session_id: 'anon-session' }))
      .mockResolvedValueOnce(completedSseResponse(
        `No pude verificar una respuesta. [Contacta con soporte](${href}). [Externo](//example.test/support)`,
        { type: 'safe_failure', outcome: 'answer_unverified', locale: 'es' },
      ));
    renderSpanishWidget();
    typeQuestion('¿Qué significan las valoraciones?');

    expect((await screen.findByRole('link', { name: 'Contactar con soporte' })).getAttribute('href')).toBe('/support');
    expect(screen.queryByText(/No pude verificar una respuesta/)).toBeNull();
    expect(screen.queryByRole('link', { name: 'Externo' })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each(['before', 'after'])('keeps the support destination when switching to Spanish %s the response', async (order) => {
    const pendingMessage = deferred<Response>();
    fetchMock.mockResolvedValueOnce(response(200, { session_id: 'anon-session' }))
      .mockReturnValueOnce(pendingMessage.promise);
    renderWidgetWithLanguagePicker();
    typeQuestion('What do the ratings mean?');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).locale).toBe('en');
    const switchToSpanish = () => fireEvent.click(screen.getByRole('button', { name: 'Español' }));
    if (order === 'before') switchToSpanish();
    pendingMessage.resolve(completedSseResponse(
      'Could not verify an answer. [Contact support](/support)',
      { type: 'safe_failure', outcome: 'answer_unverified', locale: 'en' },
    ));

    if (order === 'after') {
      expect((await screen.findByRole('link', { name: 'Contact support' })).getAttribute('href')).toBe('/support');
      switchToSpanish();
    }
    expect((await screen.findByRole('link', { name: 'Contactar con soporte' })).getAttribute('href')).toBe('/support');
    expect(screen.getByText(/Prueba con una pregunta más concreta/)).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Contact support' })).toBeNull();
    expect(screen.queryByText(/Could not verify an answer/)).toBeNull();
  });

  it.each(['https://ai.market.example/support', '/\\example.test/support', 'javascript:alert(1)'])(
    'retains localized safe-failure copy when a backend link targets %s', async (href) => {
      fetchMock.mockResolvedValueOnce(response(200, { session_id: 'anon-session' }))
        .mockResolvedValueOnce(completedSseResponse(
          `[Untrusted](${href})`, { type: 'safe_failure', outcome: 'answer_unverified' },
        ));
      renderSpanishWidget();
      typeQuestion('¿Qué significan las valoraciones?');

      expect(await screen.findByText(/No pude contrastar esa respuesta/)).toBeTruthy();
      expect(screen.queryByRole('link', { name: 'Untrusted' })).toBeNull();
    },
  );

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

  it('drops a cached session after a message 404 and creates a fresh session on retry', async () => {
    const requestOrder: string[] = [];
    let sessionAttempt = 0;
    let messageAttempt = 0;
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      requestOrder.push(url);
      if (url === SESSION_URL) {
        sessionAttempt += 1;
        return response(200, { session_id: `S${sessionAttempt}` });
      }
      if (url === MESSAGE_URL) {
        messageAttempt += 1;
        return messageAttempt === 1
          ? response(404, { detail: 'session expired' })
          : completedSseResponse('Recovered with a fresh session.');
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    renderWidget();
    typeQuestion('Can I recover from an expired session?');

    expect((await screen.findByRole('alert')).textContent).toContain(
      "We couldn't get an answer. Try a narrower question"
    );
    expect(screen.getByRole('button', { name: 'Submit Question' })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', { name: 'Submit Question' }));

    expect(await screen.findByText('Recovered with a fresh session.')).toBeTruthy();
    expect(requestOrder).toEqual([SESSION_URL, MESSAGE_URL, SESSION_URL, MESSAGE_URL]);
    const messagePayloads = fetchMock.mock.calls
      .filter(([input]) => String(input) === MESSAGE_URL)
      .map(([, init]) => JSON.parse(String(init?.body)));
    expect(messagePayloads).toEqual([
      expect.objectContaining({ session_id: 'S1' }),
      expect.objectContaining({ session_id: 'S2' }),
    ]);
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
      expect(screen.getByRole('button', { name: 'Checking public information...' })).toBeTruthy();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(7_999);
      });
      expect(screen.getByRole('button', { name: 'Checking public information...' })).toBeTruthy();
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
        '  How often is it updated?  '
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
      expect(screen.getByRole('button', { name: 'Checking public information...' })).toBeTruthy();
      expect(screen.getByText('Can the seller clarify this?', { selector: 'p' })).toBeTruthy();

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

      expect(screen.getByRole('alert').textContent).toContain(
        "We couldn't get an answer. Try a narrower question"
      );
      expect(screen.getByRole('button', { name: 'Submit Question' })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps a completed anonymous thread visible when auth hydrates mid-attempt', async () => {
    const pendingMessage = deferred<Response>();
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url === SESSION_URL) return response(200, { session_id: 'anon-session' });
      if (url === MESSAGE_URL) return pendingMessage.promise;
      throw new Error(`Unexpected request: ${url}`);
    });

    const view = renderWidget();
    typeQuestion('Will this answer remain visible?');
    expect(await screen.findByText('Will this answer remain visible?', { selector: 'p' })).toBeTruthy();

    mocks.auth.isAuthenticated = true;
    view.rerender(
      <InquiryWidget
        listingId="listing-123"
        listingSlug="weather-observations"
        listingTitle="Weather Observations"
      />
    );
    pendingMessage.resolve(completedSseResponse('Yes, it remains visible.'));

    expect(await screen.findByText('Yes, it remains visible.')).toBeTruthy();
    expect(screen.getByText('Will this answer remain visible?', { selector: 'p' })).toBeTruthy();
  });

  it('ends an anonymous attempt at exactly 45 seconds with retry and sign-in recovery', async () => {
    vi.useFakeTimers();
    const stream = progressiveSseResponse('Partial answer', ' that arrives too late.');
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url === SESSION_URL) return response(200, { session_id: 'anon-session' });
      if (url === MESSAGE_URL) return stream.response;
      throw new Error(`Unexpected request: ${url}`);
    });

    try {
      renderWidget();
      typeQuestion('Will a stalled request release the form?');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByText(
        'Will a stalled request release the form?',
        { selector: 'p' }
      )).toBeTruthy();
      expect(screen.getByText('Partial answer')).toBeTruthy();
      const sessionSignal = fetchMock.mock.calls[0][1]?.signal as AbortSignal;
      const requestSignal = fetchMock.mock.calls[1][1]?.signal as AbortSignal;
      expect(sessionSignal).toBe(requestSignal);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(44_999);
      });
      expect(screen.getByRole('button', { name: 'Still working...' })).toBeTruthy();
      expect(screen.queryByRole('alert')).toBeNull();
      expect(requestSignal.aborted).toBe(false);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      const alert = screen.getByRole('alert');
      expect(alert.textContent).toContain('This is taking longer than expected. Try a narrower question');
      expect(screen.queryByText(
        'Will a stalled request release the form?',
        { selector: 'p' }
      )).toBeNull();
      expect(screen.queryByText('Partial answer')).toBeNull();
      expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(
        'Will a stalled request release the form?'
      );
      expect(screen.getByRole('button', { name: 'Submit Question' })).toBeTruthy();
      expect(requestSignal.aborted).toBe(true);
      const sellerLink = screen.getByRole('link', { name: 'Sign in to ask the seller.' });
      expect(sellerLink.getAttribute('href')).toBe(
        '/login?redirect=/listings/weather-observations'
      );
      clickWithoutNavigation(sellerLink);
      expect(sessionStorage.getItem('inquiry_draft_listing-123')).toBe(
        'Will a stalled request release the form?'
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('preserves a nonempty textarea edit rather than the submitted snapshot on timeout sign-in', async () => {
    vi.useFakeTimers();
    const pendingMessage = deferred<Response>();
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url === SESSION_URL) return response(200, { session_id: 'anon-session' });
      if (url === MESSAGE_URL) return pendingMessage.promise;
      throw new Error(`Unexpected request: ${url}`);
    });

    try {
      renderWidget();
      typeQuestion('Q1');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(45_000);
      });

      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Q2' } });
      const sellerLink = screen.getByRole('link', { name: 'Sign in to ask the seller.' });
      expect(sellerLink.getAttribute('href')).toBe(
        '/login?redirect=/listings/weather-observations'
      );
      expect(sellerLink.getAttribute('href')).not.toContain('Q1');
      expect(sellerLink.getAttribute('href')).not.toContain('Q2');
      clickWithoutNavigation(sellerLink);

      expect(sessionStorage.getItem('inquiry_draft_listing-123')).toBe('Q2');
    } finally {
      vi.useRealTimers();
    }
  });

  it('retries with a new session after session creation itself reaches the deadline', async () => {
    vi.useFakeTimers();
    const stalledSession = deferred<Response>();
    fetchMock
      .mockImplementationOnce(() => stalledSession.promise)
      .mockResolvedValueOnce(response(200, { session_id: 'S2' }))
      .mockResolvedValueOnce(completedSseResponse('The retry completed.'));

    try {
      renderWidget();
      typeQuestion('Can I retry a stalled session creation?');
      const firstSignal = fetchMock.mock.calls[0][1]?.signal as AbortSignal;

      await act(async () => {
        await vi.advanceTimersByTimeAsync(44_999);
      });
      expect(firstSignal.aborted).toBe(false);
      expect(screen.queryByRole('alert')).toBeNull();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(firstSignal.aborted).toBe(true);
      expect(screen.getByRole('alert').textContent).toContain(
        'This is taking longer than expected. Try a narrower question'
      );

      fireEvent.click(screen.getByRole('button', { name: 'Submit Question' }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(screen.getByText('The retry completed.')).toBeTruthy();
      expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
        SESSION_URL,
        SESSION_URL,
        MESSAGE_URL,
      ]);
      expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toMatchObject({
        session_id: 'S2',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('accepts a successful anonymous response immediately before the overall deadline', async () => {
    vi.useFakeTimers();
    const stream = progressiveSseResponse('The listing is ', 'still available.');
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url === SESSION_URL) return response(200, { session_id: 'anon-session' });
      if (url === MESSAGE_URL) return stream.response;
      throw new Error(`Unexpected request: ${url}`);
    });

    try {
      renderWidget();
      typeQuestion('Is this still available?');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByText('The listing is')).toBeTruthy();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(44_999);
        stream.continue();
        await vi.advanceTimersByTimeAsync(0);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2);
      });

      expect(screen.getByText('The listing is still available.')).toBeTruthy();
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.getByRole('button', { name: 'Submit Question' })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not let a cleared deadline from an ordinary error abort a retry', async () => {
    vi.useFakeTimers();
    const firstSession = deferred<Response>();
    const retrySession = deferred<Response>();
    fetchMock
      .mockImplementationOnce(() => firstSession.promise)
      .mockImplementationOnce(() => retrySession.promise)
      .mockResolvedValueOnce(completedSseResponse('The retry succeeded.'));

    try {
      renderWidget();
      typeQuestion('Can I retry safely?');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
        firstSession.resolve(response(500));
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByRole('alert').textContent).toContain(
        "We couldn't get an answer. Try a narrower question"
      );

      fireEvent.click(screen.getByRole('button', { name: 'Submit Question' }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(40_000);
      });

      expect(screen.getByRole('button', { name: 'Still working...' })).toBeTruthy();
      expect(screen.queryByRole('alert')).toBeNull();

      await act(async () => {
        retrySession.resolve(response(200, { session_id: 'retry-session' }));
        await vi.advanceTimersByTimeAsync(0);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_001);
      });

      expect(screen.getByText('The retry succeeded.')).toBeTruthy();
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.getByRole('button', { name: 'Submit Question' })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows only the timeout recovery CTA after a successful attempt then a timed-out attempt', async () => {
    vi.useFakeTimers();
    const stalledStream = pendingSseResponse();
    let messageAttempt = 0;
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url === SESSION_URL) return response(200, { session_id: 'anon-session' });
      if (url === MESSAGE_URL) {
        messageAttempt += 1;
        return messageAttempt === 1
          ? completedSseResponse('The first answer succeeded.')
          : stalledStream.response;
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    try {
      renderWidget();
      typeQuestion('First question');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByText('The first answer succeeded.')).toBeTruthy();
      expect(screen.getByText('Want to contact the seller?')).toBeTruthy();

      typeQuestion('Second question');
      expect(screen.queryByText('Want to contact the seller?')).toBeNull();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(45_000);
      });

      expect(screen.getByRole('alert').textContent).toContain(
        'This is taking longer than expected. Try a narrower question'
      );
      expect(screen.getAllByRole('link', { name: /sign in to ask the seller/i })).toHaveLength(1);
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
        "We couldn't get an answer. Try a narrower question"
      );
      expect(screen.getByRole('button', { name: 'Submit Question' })).toBeTruthy();
      expect(screen.getByRole('status').textContent).toBe('');
      expect(screen.getByRole('status').className).toBe('sr-only');
      // Next's links schedule an idle visibility check in jsdom.
      await act(async () => { await vi.advanceTimersByTimeAsync(1); });
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

  it('cancels and releases a pending SSE reader without stale updates on unmount', async () => {
    const stream = pendingSseResponse();
    const removeAbortListener = vi.spyOn(AbortSignal.prototype, 'removeEventListener');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url === SESSION_URL) return response(200, { session_id: 'anon-session' });
      if (url === MESSAGE_URL) return stream.response;
      throw new Error(`Unexpected request: ${url}`);
    });

    try {
      const view = renderWidget();
      typeQuestion('Will the pending stream be cleaned up?');
      await waitFor(() => expect(stream.reader.read).toHaveBeenCalledTimes(1));
      const requestSignal = fetchMock.mock.calls[1][1]?.signal as AbortSignal;

      view.unmount();

      await waitFor(() => expect(stream.reader.releaseLock).toHaveBeenCalledTimes(1));
      expect(stream.reader.cancel).toHaveBeenCalledTimes(1);
      expect(requestSignal.aborted).toBe(true);
      expect(removeAbortListener).toHaveBeenCalledWith('abort', expect.any(Function));
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      removeAbortListener.mockRestore();
      consoleError.mockRestore();
    }
  });

  it('keeps authenticated submission on the existing inquiry path and targets the conversation heading', async () => {
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
    mocks.replyToConversation.mockResolvedValue({ success: true, message_id: 'reply-1' });
    mocks.getConversation.mockRejectedValue(new Error('Refresh failed'));

    render(<ListingPurchaseAdvisory price={10} scanFindings={null} />);
    renderWidget();
    typeQuestion('Is this current?');

    await waitFor(() => {
      expect(mocks.createInquiry).toHaveBeenCalledWith('listing-123', 'Is this current?');
    });
    expect(fetchMock).not.toHaveBeenCalled();
    const heading = await screen.findByRole('heading', { name: 'Your Inquiry' });
    const reply = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(reply, { target: { value: 'How often is it updated?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
    await screen.findByRole('alert');
    expect(reply.disabled).toBe(true);

    const link = screen.getByRole('link', { name: /^Ask the seller$/ });
    expect(document.querySelector(link.getAttribute('href')!)).toBe(heading);
    expect(heading.getAttribute('tabindex')).toBe('-1');
    heading.focus();
    expect(document.activeElement).toBe(heading);
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
      "Please revise your message before sending it again."
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
      "We couldn't send your question just now. Try again, or contact support if it keeps happening."
    );
    expect(screen.getByRole('button', { name: 'Submit Question' })).toBeTruthy();
  });

  it('surfaces an anonymous failure and preserves the typed question', async () => {
    fetchMock.mockResolvedValue(response(500));

    renderWidget();
    typeQuestion('Please do not lose this question');

    expect((await screen.findByRole('alert')).textContent).toContain(
      "We couldn't get an answer. Try a narrower question"
    );
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(
      'Please do not lose this question'
    );
    expect(screen.queryByText('Want to contact the seller?')).toBeNull();
    expect(mocks.createInquiry).not.toHaveBeenCalled();
  });
});

it.each([
 ['Listing is not published', "This listing isn't available for questions right now. Browse similar data.", true],
 ['Cannot inquire about your own listing', "This is your own listing, so you can't send it a question.", false],
])('guides an authenticated question refused with %s', async (detail, message, browse) => {
 mocks.auth.isAuthenticated = true;
 const error = new AxiosError('refused');
 error.response = {status:400, data:{detail}} as typeof error.response;
 mocks.createInquiry.mockRejectedValue(error);
 renderWidget();
 typeQuestion('Is this listing current?');
 expect((await screen.findByRole('alert')).textContent).toBe(message);
 const link = screen.queryByRole('link', {name:'Browse similar data.'});
 expect(link?.getAttribute('href')).toBe(browse ? '/find-data' : undefined);
});
