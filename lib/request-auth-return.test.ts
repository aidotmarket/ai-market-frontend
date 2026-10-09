// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { consumeRequestAuthReturn, saveRequestAuthReturn } from './request-auth-return';

const path = '/requests/i-need-an-entirely-synthetic-retail-sales-dataset-to-test-a-sales-292929f3?reply=1#respond';
beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });
afterEach(() => vi.unstubAllGlobals());

it.each(['oauth', 'email'] as const)('preserves and consumes the customer request for %s', (method) => {
  saveRequestAuthReturn(method, path);
  expect(consumeRequestAuthReturn(method, '/listings')).toBe(path);
  expect(consumeRequestAuthReturn(method, '/listings')).toBe('/listings');
});

it('resumes email in a new tab without sharing the OAuth nonce', () => {
  sessionStorage.setItem('oauth_nonce', 'test-nonce');
  saveRequestAuthReturn('email', path);
  sessionStorage.clear();
  expect(consumeRequestAuthReturn('email', '/listings')).toBe(path);
  expect(sessionStorage.getItem('oauth_nonce')).toBeNull();
});

it.each(['a%26b', 'a%23b', 'retail%20sales', '%2526', '%E2%82%AC'])
  ('preserves encoded query value %s verbatim', (value) => {
    const target = `/requests/test?source=${value}&reply=1#respond`;
    saveRequestAuthReturn('email', target);
    expect(consumeRequestAuthReturn('email', '/listings')).toBe(target);
  });

it.each(['https://evil.test/requests/stolen', '//evil.test/requests/stolen', '%252F%252Fevil.test/requests/stolen', '/requests/\\evil.test', '/requests/../login', '/requests-x', '/requests/test%0d%0a', '/requests/test?x=%E0%A4%A'])
  ('rejects unsafe or unrelated return %s', (target) => {
    saveRequestAuthReturn('email', target);
    expect(consumeRequestAuthReturn('email', '/listings')).toBe('/listings');
  });

it('rejects expired and tampered paths', () => {
  localStorage.setItem('request_auth_return', JSON.stringify({ path, deadline: Date.now() - 1 }));
  expect(consumeRequestAuthReturn('email', '/listings')).toBe('/listings');
  localStorage.setItem('request_auth_return', JSON.stringify({ path: '//evil.test', deadline: Date.now() + 1000 }));
  expect(consumeRequestAuthReturn('email', '/listings')).toBe('/listings');
});

it('keeps auth usable when storage is unavailable', () => {
  vi.stubGlobal('localStorage', { getItem: () => { throw new Error('disabled'); }, setItem: () => { throw new Error('disabled'); } });
  expect(() => saveRequestAuthReturn('email', path)).not.toThrow();
  expect(consumeRequestAuthReturn('email', '/listings')).toBe('/listings');
});

const handoff = `/checkout/h/${'a'.repeat(42)}A`;
it.each(['oauth', 'email'] as const)('consumes the exact handoff once for %s', method => {
  saveRequestAuthReturn(method, handoff);
  expect(consumeRequestAuthReturn(method, '/listings')).toBe(handoff);
  expect(consumeRequestAuthReturn(method, '/listings')).toBe('/listings');
});
it.each([`${handoff}?x=1`, `${handoff}#fragment`, `${handoff}/`, `${handoff}\n`,
  `/checkout/h/${'a'.repeat(43)}`, `/checkout/h/${'a'.repeat(42)}`, `/checkout/h/${'a'.repeat(44)}`,
  `https://ai.market${handoff}`, `https://evil.test${handoff}`, `//evil.test${handoff}`,
  handoff.replace('A', '%41'), '/checkout/h/../listings'])('rejects malformed handoff %s', target => {
  saveRequestAuthReturn('email', target);
  expect(consumeRequestAuthReturn('email', '/listings')).toBe('/listings');
});
