// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: { user: null, token: null },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/listings/example-listing',
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: () => mocks.auth,
}));

import { AllAIProvider, useAllAI } from './AllAIContext';

const SESSION_KEY = 'allai-session-id';
const SESSION_URL = 'http://localhost:8000/api/allai/support/anonymous/session';
const MESSAGE_URL = 'http://localhost:8000/api/allai/support/anonymous/message';
const GENERIC_ERROR = 'Sorry, something went wrong. Please try again.';
const LIMIT_ERROR = "You've reached the message limit for this session. Please try again later.";

type ContextValue = ReturnType<typeof useAllAI>;
type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

let currentContext: ContextValue | null = null;
let fetchMock: FetchMock;

function Probe() {
  currentContext = useAllAI();
  return null;
}

function context(): ContextValue {
  if (!currentContext) throw new Error('AllAI context is not mounted');
  return currentContext;
}

function renderProvider(storedSessionId = 'stale-session') {
  sessionStorage.setItem(SESSION_KEY, storedSessionId);
  render(
    <AllAIProvider>
      <Probe />
    </AllAIProvider>
  );
}

function response(status: number, data: unknown = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    body: null,
    json: vi.fn().mockResolvedValue(data),
  } as unknown as Response;
}

function sseResponse(text = 'answer') {
  const chunks = [new TextEncoder().encode(`data: ${JSON.stringify({ text })}\n\n`)];
  const reader = {
    read: vi.fn(async () =>
      chunks.length > 0
        ? { done: false, value: chunks.shift() }
        : { done: true, value: undefined }
    ),
    releaseLock: vi.fn(),
    cancel: vi.fn(),
  };
  return {
    status: 200,
    ok: true,
    body: { getReader: () => reader },
    json: vi.fn(),
  } as unknown as Response;
}

function streamReadFailure(error = new Error('stream read failed')) {
  const reader = {
    read: vi.fn().mockRejectedValue(error),
    releaseLock: vi.fn(),
    cancel: vi.fn(),
  };
  return {
    status: 200,
    ok: true,
    body: { getReader: () => reader },
    json: vi.fn(),
  } as unknown as Response;
}

function abortError() {
  return Object.assign(new Error('aborted'), { name: 'AbortError' });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function requestUrl(call: Parameters<typeof fetch>) {
  return String(call[0]);
}

function requestInit(call: Parameters<typeof fetch>) {
  return call[1] as RequestInit;
}

function messageCalls() {
  return fetchMock.mock.calls.filter((call) => requestUrl(call) === MESSAGE_URL);
}

function creationCalls() {
  return fetchMock.mock.calls.filter(
    (call) => requestUrl(call) === SESSION_URL && requestInit(call).method === 'POST'
  );
}

function messagePayload(call: Parameters<typeof fetch>) {
  return JSON.parse(String(requestInit(call).body));
}

async function send(text = 'hello') {
  await act(async () => {
    await context().sendMessage(text);
  });
}

function expectSinglePair(assistantContent: string) {
  expect(context().messages.map(({ role, content }) => ({ role, content }))).toEqual([
    { role: 'user', content: 'hello' },
    { role: 'assistant', content: assistantContent },
  ]);
}

beforeEach(() => {
  let now = 1_700_000_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => ++now);
  currentContext = null;
  sessionStorage.clear();
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('anonymous initial-message stale-session recovery', () => {
  it('recovers 404 -> fresh session -> 200 SSE once with one UI pair and the same AbortSignal', async () => {
    let messageAttempt = 0;
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === `${SESSION_URL}/stale-session`) return response(200, { messages: [] });
      if (url === SESSION_URL && init?.method === 'POST') {
        return response(200, { session_id: 'fresh-session' });
      }
      if (url === MESSAGE_URL) {
        messageAttempt += 1;
        return messageAttempt === 1 ? response(404, { detail: 'unrelated routing 404' }) : sseResponse();
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    renderProvider();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`${SESSION_URL}/stale-session`));
    await send();

    expect(messageCalls()).toHaveLength(2);
    expect(creationCalls()).toHaveLength(1);
    const [initialCall, retryCall] = messageCalls();
    const initialPayload = messagePayload(initialCall);
    const retryPayload = messagePayload(retryCall);
    expect(initialPayload).toEqual({
      session_id: 'stale-session',
      message: 'hello',
      context: { page: '/listings/example-listing', listing_id: 'example-listing' },
      stream: true,
    });
    expect(retryPayload).toEqual({ ...initialPayload, session_id: 'fresh-session' });
    expect(requestInit(retryCall).headers).toBe(requestInit(initialCall).headers);
    expect(requestInit(retryCall).signal).toBe(requestInit(initialCall).signal);
    expect(sessionStorage.getItem(SESSION_KEY)).toBe('fresh-session');
    expectSinglePair('answer');
  });

  it('bounds a 404 -> 404 sequence to one replacement and two message attempts without body matching', async () => {
    const routing404 = response(404, { detail: 'route does not exist' });
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === `${SESSION_URL}/stale-session`) return response(200, { messages: [] });
      if (url === SESSION_URL && init?.method === 'POST') {
        return response(200, { session_id: 'fresh-session' });
      }
      if (url === MESSAGE_URL) return routing404;
      throw new Error(`Unexpected request: ${url}`);
    });

    renderProvider();
    await send();

    expect(messageCalls()).toHaveLength(2);
    expect(creationCalls()).toHaveLength(1);
    expect(routing404.json).not.toHaveBeenCalled();
    expectSinglePair(GENERIC_ERROR);
  });

  it('does not retry the message when replacement-session creation fails', async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === `${SESSION_URL}/stale-session`) return response(200, { messages: [] });
      if (url === SESSION_URL && init?.method === 'POST') return response(500);
      if (url === MESSAGE_URL) return response(404);
      throw new Error(`Unexpected request: ${url}`);
    });

    renderProvider();
    await send();

    expect(messageCalls()).toHaveLength(1);
    expect(creationCalls()).toHaveLength(1);
    expectSinglePair(GENERIC_ERROR);
  });

  it.each([
    ['HTTP 500', () => response(500)],
    ['a network rejection', () => Promise.reject(new Error('retry network failure'))],
  ])('does not make a third attempt when the retry fails with %s', async (_label, retryResult) => {
    let messageAttempt = 0;
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === `${SESSION_URL}/stale-session`) return response(200, { messages: [] });
      if (url === SESSION_URL && init?.method === 'POST') {
        return response(200, { session_id: 'fresh-session' });
      }
      if (url === MESSAGE_URL) {
        messageAttempt += 1;
        return messageAttempt === 1 ? response(404) : retryResult();
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    renderProvider();
    await send();

    expect(messageCalls()).toHaveLength(2);
    expect(creationCalls()).toHaveLength(1);
    expectSinglePair(GENERIC_ERROR);
  });

  it('keeps the original controller while aborted during replacement creation and does not add an error', async () => {
    const replacement = deferred<Response>();
    let messageAttempt = 0;
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === `${SESSION_URL}/stale-session`) return response(200, { messages: [] });
      if (url === SESSION_URL && init?.method === 'POST') return replacement.promise;
      if (url === MESSAGE_URL) {
        messageAttempt += 1;
        if (messageAttempt === 1) return response(404);
        if (init?.signal?.aborted) throw abortError();
        return sseResponse();
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    renderProvider();
    let pendingSend!: Promise<void>;
    act(() => {
      pendingSend = context().sendMessage('hello');
    });
    await waitFor(() => expect(creationCalls()).toHaveLength(1));

    act(() => context().close());
    await act(async () => {
      replacement.resolve(response(200, { session_id: 'fresh-session' }));
      await pendingSend;
    });

    expect(messageCalls()).toHaveLength(2);
    expect(creationCalls()).toHaveLength(1);
    const [initialCall, retryCall] = messageCalls();
    expect(requestInit(retryCall).signal).toBe(requestInit(initialCall).signal);
    expect(requestInit(retryCall).signal?.aborted).toBe(true);
    expect(sessionStorage.getItem(SESSION_KEY)).toBe('fresh-session');
    expectSinglePair('');
  });

  it.each([
    ['HTTP 500', () => response(500), GENERIC_ERROR],
    ['HTTP 429', () => response(429), LIMIT_ERROR],
    ['a network rejection', () => Promise.reject(new Error('network failure')), GENERIC_ERROR],
    ['an abort', () => Promise.reject(abortError()), ''],
    ['a stream-read failure', () => streamReadFailure(), GENERIC_ERROR],
  ])('does not recover or replay after initial %s', async (_label, initialResult, expectedContent) => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url === `${SESSION_URL}/stale-session`) return response(200, { messages: [] });
      if (url === MESSAGE_URL) return initialResult();
      throw new Error(`Unexpected request: ${url}`);
    });

    renderProvider();
    await send();

    expect(messageCalls()).toHaveLength(1);
    expect(creationCalls()).toHaveLength(0);
    expectSinglePair(expectedContent);
  });
});

describe('mount validation ownership', () => {
  it('does not replace a completed same-session send with delayed restored messages', async () => {
    const validation = deferred<Response>();
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url === `${SESSION_URL}/stale-session`) return validation.promise;
      if (url === MESSAGE_URL) return sseResponse('completed answer');
      throw new Error(`Unexpected request: ${url}`);
    });

    renderProvider();
    await send();
    expect(context().isStreaming).toBe(false);
    expectSinglePair('completed answer');

    await act(async () => {
      validation.resolve(
        response(200, {
          messages: [{ role: 'assistant', content: 'restored historical message' }],
        })
      );
      await Promise.resolve();
    });

    expectSinglePair('completed answer');
  });

  it('does not replace an appended pair when validation resolves while ensureSession is pending', async () => {
    const validation = deferred<Response>();
    const sendStarted = deferred<void>();
    const realSessionStorage = sessionStorage;
    let startSendOnIdentityCheck = false;
    let pendingSend: Promise<void> | undefined;
    let messageCallsAtInterleave = -1;

    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => {
        if (key === SESSION_KEY && startSendOnIdentityCheck) {
          startSendOnIdentityCheck = false;
          pendingSend = context().sendMessage('hello');
          messageCallsAtInterleave = messageCalls().length;
          sendStarted.resolve();
        }
        return realSessionStorage.getItem(key);
      },
      setItem: (key: string, value: string) => realSessionStorage.setItem(key, value),
      removeItem: (key: string) => realSessionStorage.removeItem(key),
      clear: () => realSessionStorage.clear(),
      key: (index: number) => realSessionStorage.key(index),
      get length() { return realSessionStorage.length; },
    } satisfies Storage);
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url === `${SESSION_URL}/stale-session`) return validation.promise;
      if (url === MESSAGE_URL) return sseResponse('answer after pending session');
      throw new Error(`Unexpected request: ${url}`);
    });

    renderProvider();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`${SESSION_URL}/stale-session`));

    await act(async () => {
      startSendOnIdentityCheck = true;
      validation.resolve(
        response(200, {
          messages: [{ role: 'assistant', content: 'restored historical message' }],
        })
      );
      await sendStarted.promise;
      await pendingSend;
    });

    expect(messageCallsAtInterleave).toBe(0);
    expectSinglePair('answer after pending session');
  });

  it('does not replace an in-flight same-session send with delayed restored messages', async () => {
    const validation = deferred<Response>();
    const streamEnd = deferred<ReadableStreamReadResult<Uint8Array>>();
    const reader = {
      read: vi.fn()
        .mockResolvedValueOnce({
          done: false,
          value: new TextEncoder().encode(`data: ${JSON.stringify({ text: 'streaming answer' })}\n\n`),
        })
        .mockImplementationOnce(() => streamEnd.promise),
      releaseLock: vi.fn(),
      cancel: vi.fn(),
    };
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url === `${SESSION_URL}/stale-session`) return validation.promise;
      if (url === MESSAGE_URL) {
        return {
          status: 200,
          ok: true,
          body: { getReader: () => reader },
          json: vi.fn(),
        } as unknown as Response;
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    renderProvider();
    let pendingSend!: Promise<void>;
    act(() => {
      pendingSend = context().sendMessage('hello');
    });
    await waitFor(() => expectSinglePair('streaming answer'));
    expect(context().isStreaming).toBe(true);

    await act(async () => {
      validation.resolve(
        response(200, {
          messages: [{ role: 'assistant', content: 'restored historical message' }],
        })
      );
      await Promise.resolve();
    });

    expectSinglePair('streaming answer');
    expect(context().isStreaming).toBe(true);

    await act(async () => {
      streamEnd.resolve({ done: true, value: undefined });
      await pendingSend;
    });

    expectSinglePair('streaming answer');
  });

  it.each(['success', 'not-found', 'rejection'] as const)(
    'ignores a delayed stale-session validation %s after recovery establishes a newer id',
    async (validationOutcome) => {
      const validation = deferred<Response>();
      let messageAttempt = 0;
      fetchMock.mockImplementation(async (input, init) => {
        const url = String(input);
        if (url === `${SESSION_URL}/stale-session`) return validation.promise;
        if (url === SESSION_URL && init?.method === 'POST') {
          return response(200, { session_id: 'fresh-session' });
        }
        if (url === MESSAGE_URL) {
          messageAttempt += 1;
          return messageAttempt === 1 ? response(404) : sseResponse(`answer-${messageAttempt}`);
        }
        throw new Error(`Unexpected request: ${url}`);
      });

      renderProvider();
      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`${SESSION_URL}/stale-session`));
      await send();
      expect(sessionStorage.getItem(SESSION_KEY)).toBe('fresh-session');

      await act(async () => {
        if (validationOutcome === 'success') {
          validation.resolve(
            response(200, {
              messages: [{ role: 'assistant', content: 'stale restored message' }],
            })
          );
        } else if (validationOutcome === 'not-found') {
          validation.resolve(response(404));
        } else {
          validation.reject(new Error('validation network failure'));
        }
        await Promise.resolve();
      });

      expect(sessionStorage.getItem(SESSION_KEY)).toBe('fresh-session');
      expectSinglePair('answer-2');

      await send('second message');

      expect(creationCalls()).toHaveLength(1);
      expect(messageCalls()).toHaveLength(3);
      expect(messageCalls().map(messagePayload).map((payload) => payload.session_id)).toEqual([
        'stale-session',
        'fresh-session',
        'fresh-session',
      ]);
      expect(sessionStorage.getItem(SESSION_KEY)).toBe('fresh-session');
      expect(context().messages.map(({ role, content }) => ({ role, content }))).toEqual([
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'answer-2' },
        { role: 'user', content: 'second message' },
        { role: 'assistant', content: 'answer-3' },
      ]);
    }
  );
});
