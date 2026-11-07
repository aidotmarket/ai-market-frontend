import '@/tests/support-network-trap';
import '@/tests/support-private-network-guard';
import { expect, it, vi } from 'vitest';
import https from 'node:https';
import { Readable, Writable } from 'node:stream';
import { createRequire } from 'node:module';
import { supportRecoveryRewrites } from '@/lib/support-private-policy';
const require = createRequire(import.meta.url);
const { proxyRequest } = require('next/dist/server/lib/router-utils/proxy-request') as { proxyRequest: (...args: unknown[]) => Promise<unknown> };
// Exercise actual Next15 + bundled http-proxy with stream-only fake ports.
// No HTTP server, listener, socket, browser or backend is started.
it.each(['mailbox-confirm', 'email-visit/11111111-1111-4111-8111-111111111111/messages'])('preserves original Origin/Cookie and exact multi Set-Cookie through actual Next proxy at %s', async route => {
  const cookie = '__Host-support-confirm=synthetic-csrf; __Host-support-visit=synthetic-visit';
  const returnedCookies = [
    '__Host-support-confirm=synthetic-new-csrf; Max-Age=900; Path=/; Secure; SameSite=strict',
    '__Host-support-visit=synthetic-new-visit; HttpOnly; Max-Age=900; Path=/; Secure; SameSite=strict',
  ];
  const outgoing: Record<string, unknown>[] = [];
  const events: string[] = [];
  vi.spyOn(https, 'request').mockImplementation(((options: Record<string, unknown>) => {
    outgoing.push(options); events.push('request');
    const request = Object.assign(new Writable({ write(_chunk, _encoding, done) { done(); } }), {
      setTimeout: vi.fn(), abort: vi.fn(), setHeader: vi.fn(), getHeader: vi.fn(),
    });
    queueMicrotask(() => request.emit('socket', { connecting: false }));
    request.on('finish', () => {
      events.push('finish');
      const upstream = Object.assign(Readable.from(['<html>private backend page</html>']), {
        statusCode: 200, statusMessage: 'OK', httpVersion: '1.1',
        headers: { 'set-cookie': returnedCookies, 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'none'; script-src 'nonce-backend'" },
        trailers: {}, rawTrailers: [],
      });
      upstream.on('end', () => { events.push('upstream-end'); request.emit('close'); });
      request.emit('response', upstream); events.push('response');
    });
    return request;
  }) as unknown as typeof https.request);
  const incoming = Object.assign(Readable.from(['synthetic-body']), {
    url: '/api/v1/support/' + route, method: 'POST', httpVersion: '1.1',
    headers: { host: 'ai.market', origin: 'https://ai.market', cookie, 'content-type': 'application/json' },
    connection: {}, socket: {},
  });
  const responseHeaders = new Map<string, unknown>();
  const response = Object.assign(new Writable({ write(_chunk, _encoding, done) { done(); } }), {
    statusCode: 0,
    setHeader(name: string, value: unknown) { responseHeaders.set(name.toLowerCase(), value); },
    getHeader(name: string) { return responseHeaders.get(name.toLowerCase()); },
    removeHeader(name: string) { responseHeaders.delete(name.toLowerCase()); },
    writeHead: vi.fn(), addTrailers: vi.fn(),
  });
  const rewrites = supportRecoveryRewrites('https://api.example.invalid');
  const rule = rewrites.find(r => route === 'mailbox-confirm' ? r.source.endsWith('/mailbox-confirm') : r.source.endsWith('/:ticket/messages'))!;
  const target = new URL(rule.destination.replace(':ticket', '11111111-1111-4111-8111-111111111111'));
  const completion = proxyRequest(incoming, response, { protocol: target.protocol, hostname: target.hostname, pathname: target.pathname, query: {} });
  await vi.waitFor(() => expect(events).toContain('upstream-end'));
  await completion;
  expect(outgoing).toHaveLength(1);
  expect(outgoing[0]).toMatchObject({ hostname: 'api.example.invalid', headers: { host: 'api.example.invalid', origin: 'https://ai.market', cookie } });
  expect(responseHeaders.get('set-cookie')).toEqual(returnedCookies);
  expect(responseHeaders.get('content-security-policy')).toBe("default-src 'none'; script-src 'nonce-backend'");
  expect(responseHeaders.get('referrer-policy')).toBe('no-referrer');
});
