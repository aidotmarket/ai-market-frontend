import { beforeEach, afterEach, vi, expect } from 'vitest';
import http from 'node:http';
import https from 'node:https';
let attempts: string[] = [];
beforeEach(() => {
  attempts = [];
  const deny = (name: string) => (..._args: unknown[]): never => { attempts.push(name); throw new Error(`Forbidden network: ${name}`); };
  vi.stubGlobal('fetch', deny('fetch'));
  vi.spyOn(http, 'request').mockImplementation(deny('http.request'));
  vi.spyOn(http, 'get').mockImplementation(deny('http.get'));
  vi.spyOn(https, 'request').mockImplementation(deny('https.request'));
  vi.spyOn(https, 'get').mockImplementation(deny('https.get'));
  if (typeof XMLHttpRequest !== 'undefined') vi.spyOn(XMLHttpRequest.prototype, 'send').mockImplementation(deny('XHR'));
});
afterEach(() => { expect(attempts, 'No live network attempts').toEqual([]); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
