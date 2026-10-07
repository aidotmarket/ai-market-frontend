// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest';
import { PENDING_ACTION_CONTINUATION, validateRedirect } from './redirect';
import { resumeAuthContinuation } from './aim-data-continuation';
import { consumeRequestAuthReturn, saveRequestAuthReturn } from './request-auth-return';
const path = `/confirm/11111111-1111-4111-8111-111111111111?t=${'a'.repeat(42)}A`;
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

it('preserves the exact internal confirmation continuation after password login', () => {
  expect(validateRedirect(path)).toBe(path);
  expect(resumeAuthContinuation(path)).toBe(path);
});

it.each(['oauth', 'email'] as const)('resumes %s and 2FA callbacks via the existing return helper', (method) => {
  saveRequestAuthReturn(method, path);
  expect(consumeRequestAuthReturn(method, resumeAuthContinuation())).toBe(path);
  expect(consumeRequestAuthReturn(method, '/listings')).toBe('/listings');
});

it.each([
  `https://evil.test${path}`, `https://ai.market${path}`, `//evil.test${path}`, `\\evil.test${path}`,
  `${path}&next=https://evil.test`, `${path}#fragment`, `${path}\n`, `${path}%0d%0a`, `${path}&t=other`,
  path.replace('/confirm/', '/confirm/../confirm/'), path.replace('11111111', 'invalid'),
  path.replace('?t=', '?%74='), path.replace('/confirm', '/%63onfirm'), path.replace('?t=', '?token='),
  path.replace(/A$/, ''), `${path}A`, path.replace(/A$/, 'B'), `${path}%26next=evil`,
  encodeURIComponent(path), encodeURIComponent(encodeURIComponent(path)), '/confirm',
])('rejects unsafe or non-exact continuation %s', (target) => {
  expect(PENDING_ACTION_CONTINUATION.test(target)).toBe(false);
  expect(validateRedirect(target)).toBe('/dashboard');
  expect(resumeAuthContinuation(target)).toBe('/listings');
  saveRequestAuthReturn('oauth', target);
  expect(consumeRequestAuthReturn('oauth', '/listings')).toBe('/listings');
  saveRequestAuthReturn('email', target);
  expect(consumeRequestAuthReturn('email', '/listings')).toBe('/listings');
});

it('rejects expired or tampered saved confirmation returns', () => {
  localStorage.setItem('request_auth_return', JSON.stringify({ path, deadline: Date.now() - 1 }));
  expect(consumeRequestAuthReturn('email', '/listings')).toBe('/listings');
  localStorage.setItem('request_auth_return', JSON.stringify({ path: `${path}&next=evil`, deadline: Date.now() + 1000 }));
  expect(consumeRequestAuthReturn('email', '/listings')).toBe('/listings');
});
