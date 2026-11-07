import { beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
const refuse = () => { throw new Error('Unexpected network operation in isolated support test'); };
beforeAll(() => {
  Object.defineProperty(globalThis.crypto, 'subtle', { configurable: true, value: webcrypto.subtle });
  vi.stubGlobal('fetch', vi.fn(refuse));
  vi.spyOn(http, 'request').mockImplementation(refuse);
  vi.spyOn(http, 'get').mockImplementation(refuse);
  vi.spyOn(https, 'request').mockImplementation(refuse);
  vi.spyOn(https, 'get').mockImplementation(refuse);
  if (typeof XMLHttpRequest !== 'undefined') vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation(refuse);
});
beforeEach(() => {
  // Reinstall even when an existing regression test restores Vitest mocks.
  globalThis.fetch = refuse as typeof fetch;
  http.request = refuse as typeof http.request; http.get = refuse as typeof http.get;
  https.request = refuse as typeof https.request; https.get = refuse as typeof https.get;
  if (typeof XMLHttpRequest !== 'undefined') XMLHttpRequest.prototype.open = refuse;
});
afterAll(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
