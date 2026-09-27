// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest';
import { CONNECTOR_CONTINUATION, validateRedirect } from '@/lib/redirect';
import { clearConnectorContinuation, connectorRequestPath, readConnectorContinuation, resumeAuthContinuation, saveConnectorContinuation, setConnectorStatus } from '@/lib/aim-data-continuation';
import { validateConnectorContinueUrl } from '@/api/connector-oauth';

const path = connectorRequestPath('a'.repeat(43));
beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });

it.each([path, connectorRequestPath('_'.repeat(43)), connectorRequestPath('-'.repeat(43))])('accepts only an exact connector path %s', (value) => {
  expect(CONNECTOR_CONTINUATION.test(value)).toBe(true);
  expect(validateRedirect(value)).toBe(value);
});

it.each([
  connectorRequestPath('a'.repeat(42)), connectorRequestPath('a'.repeat(44)), `${path}&x=1`, `${path}#x`, `${path}\n`,
  path.replace('request=', '%72equest='), path.replace('/oauth', '/%6fauth'), encodeURIComponent(path),
  `https://evil.example${path}`, `//evil.example${path}`, `${path}%26x=1`,
])('rejects malformed or external path %s', (value) => {
  expect(CONNECTOR_CONTINUATION.test(value)).toBe(false);
  expect(validateRedirect(value)).toBe('/dashboard');
});

it('keeps a status-gated same-browser continuation for thirty minutes', () => {
  expect(saveConnectorContinuation(path)).toBe(false);
  setConnectorStatus(true);
  expect(saveConnectorContinuation(path)).toBe(true);
  expect(resumeAuthContinuation()).toBe(path);
  expect(readConnectorContinuation()?.request).toBe('a'.repeat(43));
  setConnectorStatus(false);
  expect(resumeAuthContinuation()).toBe('/listings');
  expect(readConnectorContinuation()).toBeNull();
  clearConnectorContinuation();
});

it('does not clear a valid continuation before the status check runs in a new page', () => {
  setConnectorStatus(true);
  expect(saveConnectorContinuation(path)).toBe(true);
  localStorage.removeItem('connector_oauth_enabled');
  expect(readConnectorContinuation()).toBeNull();
  expect(localStorage.getItem('connector_authorization_request')).not.toBeNull();
  setConnectorStatus(true);
  expect(readConnectorContinuation()?.request).toBe('a'.repeat(43));
});

it('rejects and clears an expired connector continuation', () => {
  setConnectorStatus(true);
  localStorage.setItem('connector_authorization_request', JSON.stringify({
    request: 'a'.repeat(43), deadline: Date.now() - 1,
  }));
  expect(readConnectorContinuation()).toBeNull();
  expect(localStorage.getItem('connector_authorization_request')).toBeNull();
});

it('requires a fresh status check after its thirty-minute cache expires', () => {
  setConnectorStatus(true);
  expect(saveConnectorContinuation(path)).toBe(true);
  localStorage.setItem('connector_oauth_enabled', JSON.stringify({ enabled: true, deadline: Date.now() - 1 }));
  expect(readConnectorContinuation()).toBeNull();
  expect(localStorage.getItem('connector_authorization_request')).not.toBeNull();
  setConnectorStatus(true);
  expect(readConnectorContinuation()?.request).toBe('a'.repeat(43));
});

it('opens only the contracted completion URL prefix', () => {
  const safe = `https://auth.ai.market/oauth/authorize/complete?request=${'a'.repeat(43)}`;
  expect(validateConnectorContinueUrl(safe)).toBe(safe);
  for (const unsafe of ['https://evil.example/oauth/authorize/complete?x=1',
    'https://auth.ai.market.evil.example/oauth/authorize/complete?x=1',
    'https://auth.ai.market/oauth/authorize/complete']) {
    expect(() => validateConnectorContinueUrl(unsafe)).toThrow();
  }
});
