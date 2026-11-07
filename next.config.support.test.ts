import '@/tests/support-network-trap';
import '@/tests/support-private-network-guard';
import { afterEach, expect, it, vi } from 'vitest';
import config from './next.config';
afterEach(() => vi.unstubAllEnvs());
it('rewrites exactly the seven backend recovery routes, with no auth, account or history proxy', async () => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.invalid');
  const rules = await config.rewrites!();
  expect(Array.isArray(rules)).toBe(true);
  const support = (rules as { source: string; destination: string }[]).filter(r => r.source.startsWith('/api/v1/support/'));
  const paths = ['mailbox-confirm', 'mailbox-confirm/email', 'email-visit/:ticket', 'email-visit/:ticket/conversation', 'email-visit/:ticket/draft', 'email-visit/:ticket/messages', 'email-visit/:ticket/customer-receipts'];
  expect(support).toEqual(paths.map(path => ({ source: '/api/v1/support/' + path, destination: 'https://api.example.invalid/api/v1/support/' + path })));
  expect(support.some(r => /auth|account|history|:path/.test(r.source))).toBe(false);
});

import { unstable_getResponseFromNextConfig, unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { NextRequest, type NextFetchEvent } from 'next/server';
import { middleware, config as matcher } from './middleware';
import { supportAccountCsp, supportRecoveryRewrites, SUPPORT_RECOVERY_PATHS } from './lib/support-private-policy';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { getScriptNonceFromHeader } = require('next/dist/server/app-render/get-script-nonce-from-header') as { getScriptNonceFromHeader: (csp: string) => string | undefined };
it.each(['http://api.example.invalid', 'https://user:pass@api.example.invalid', 'https://api.example.invalid/api/v1', 'https://api.example.invalid?query=x', 'invalid'])('does not create support rewrites for unsafe configured API origin %s', origin => {
  expect(supportRecoveryRewrites(origin)).toEqual([]);
  expect(supportAccountCsp('fake-nonce', origin)).toContain("connect-src 'self';");
});
it.each(['/support/mailbox-account', '/api/v1/support/mailbox-confirm', '/api/v1/support/mailbox-confirm/email', ...SUPPORT_RECOVERY_PATHS.slice(2).map(p => p.replace(':ticket', '11111111-1111-4111-8111-111111111111'))])('keeps private %s cache/referrer headers and never redirects bearer-bearing www requests', async path => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.invalid');
  expect(unstable_doesMiddlewareMatch({ config: matcher, nextConfig: {}, url: 'https://ai.market' + path })).toBe(true);
  const response = await unstable_getResponseFromNextConfig({ url: 'https://www.ai.market' + path, nextConfig: config });
  expect(response.headers.get('location')).toBeNull();
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  const rejected = middleware(new NextRequest('https://www.ai.market' + path, { headers: { host: 'www.ai.market' } }), {} as NextFetchEvent);
  expect(rejected.status).toBe(400); expect(rejected.headers.get('location')).toBeNull();
});
it('generates per-request CSP understood by actual Next15 bootstrap nonce extraction, without unsafe-inline/eval', () => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.invalid');
  const request = () => new NextRequest('https://ai.market/support/mailbox-account', { headers: { host: 'ai.market', origin: 'https://ai.market' } });
  const response = middleware(request(), {} as NextFetchEvent);
  const policy = response.headers.get('content-security-policy')!;
  const nonce = getScriptNonceFromHeader(policy);
  expect(nonce).toMatch(/^[A-Za-z0-9+/]{32}$/);
  expect(policy).toBe(supportAccountCsp(nonce!, 'https://api.example.invalid'));
  expect(policy).not.toMatch(/unsafe-inline|unsafe-eval|https:\/\/fonts|\*/);
  expect(response.headers.get('x-middleware-request-content-security-policy')).toBe(policy);
  expect(response.headers.get('x-middleware-request-origin')).toBe('https://ai.market');
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  expect(middleware(request(), {} as NextFetchEvent).headers.get('content-security-policy')).not.toBe(policy);
});
it('leaves original Origin and host-only cookies untouched for backend rewrites and does not install a conflicting static CSP', async () => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.invalid');
  const origin = 'https://ai.market';
  const cookie = '__Host-support-confirm=synthetic-csrf; __Host-support-visit=synthetic-visit';
  const request = new NextRequest(origin + '/api/v1/support/email-visit/11111111-1111-4111-8111-111111111111/messages', { headers: { host: 'ai.market', origin, cookie } });
  const response = middleware(request, {} as NextFetchEvent);
  expect(response.headers.get('x-middleware-override-headers')).toBeNull();
  expect(response.headers.get('content-security-policy')).toBeNull();
  expect(request.headers.get('origin')).toBe(origin); expect(request.headers.get('cookie')).toBe(cookie);
  const headers = await config.headers!();
  expect(headers.filter(r => r.source.startsWith('/api/v1/support')).flatMap(r => r.headers).some(h => /content-security-policy|set-cookie/i.test(h.key))).toBe(false);
});
