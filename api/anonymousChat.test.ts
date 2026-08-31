import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ANONYMOUS_SESSION_URL,
  createAnonymousSession,
  readAnonymousMessageStream,
} from './anonymousChat';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('anonymous chat API lifecycle', () => {
  it('keeps createAnonymousSession backwards compatible when no options are supplied', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ session_id: 'anonymous-session' }),
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    await expect(createAnonymousSession()).resolves.toBe('anonymous-session');
    expect(fetchMock).toHaveBeenCalledWith(ANONYMOUS_SESSION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: undefined,
    });
  });

  it('cancels the reader, releases its lock, and removes the abort listener', async () => {
    const reader = {
      read: vi.fn(() => new Promise<ReadableStreamReadResult<Uint8Array>>(() => undefined)),
      cancel: vi.fn(),
      releaseLock: vi.fn(),
    };
    const body = { getReader: () => reader } as unknown as ReadableStream<Uint8Array>;
    const controller = new AbortController();
    const removeAbortListener = vi.spyOn(controller.signal, 'removeEventListener');

    const reading = readAnonymousMessageStream(body, vi.fn(), 45_001, controller.signal);
    expect(reader.read).toHaveBeenCalledTimes(1);
    controller.abort();

    await expect(reading).rejects.toMatchObject({ name: 'AbortError' });
    expect(reader.cancel).toHaveBeenCalledTimes(1);
    expect(reader.releaseLock).toHaveBeenCalledTimes(1);
    expect(removeAbortListener).toHaveBeenCalledWith('abort', expect.any(Function));
  });
});
