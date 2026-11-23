import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const ports = vi.hoisted(() => ({ explain: vi.fn(), generic: vi.fn() }));

vi.mock('axios', async original => {
  const actual = await original<typeof import('axios')>();
  const create = actual.default.create.bind(actual.default);
  vi.spyOn(actual.default, 'create').mockImplementation(config => create({
    ...config, adapter: config?.baseURL?.endsWith('/allai/explain') ? ports.explain : ports.generic,
  }));
  return actual;
});

import { appendExplain, type ExplainRequest } from './explain';
import { refreshAccessToken } from './client';
import { advanceAuthSessionOwner, assertAuthSessionOwner, authSessionOwner } from '@/lib/auth-session-owner';
import { sessionCsrf } from '@/lib/session-csrf';
import { answerFixture, bearer, explainUser, ids, questions } from '@/tests/explain-fixtures';
import { useAuthStore } from '@/store/auth';

const first = bearer();
const second = bearer('successor-row');
const request: ExplainRequest = { intent: 'explain', locale: 'en', question: 'storage', target: questions.storage };
const initialHistory = { conversation_id: ids.conversation, expires_at: '2099-01-01T00:00:00Z', turns: [], before: null };
const rotated = { detail: 'SESSION_ROTATED' };
const response = (config: InternalAxiosRequestConfig, data: unknown, status = 200) =>
  ({ config, status, data, headers: {}, statusText: 'Synthetic response' });
function reject(config: InternalAxiosRequestConfig, status: number, data: unknown) {
  throw new AxiosError('Synthetic Explain failure', undefined, config, undefined, response(config, data, status));
}
function admit(route = { current: true }) {
  const owner = authSessionOwner(), signal = new AbortController().signal;
  return { owner, signal, currentToken() {
    assertAuthSessionOwner(owner);
    if (!route.current) throw new Error('route changed');
    return useAuthStore.getState().token!;
  } };
}
function calls() {
  return ports.explain.mock.calls.map(([r]) => ({
    method: r.method, bearer: r.headers.get('Authorization'), csrf: r.headers.get('X-CSRF-Token'),
    ...(r.params ? { params: r.params } : {}), ...(r.data ? { body: JSON.parse(r.data) } : {}),
  }));
}

beforeEach(() => {
  advanceAuthSessionOwner(false);
  useAuthStore.setState({ token: first, user: explainUser, isAuthenticated: true });
  ports.explain.mockReset();
  ports.generic.mockReset().mockRejectedValue(new Error('unexpected generic API request'));
  vi.spyOn(axios, 'post').mockRejectedValue(new Error('unexpected refresh'));
});
afterEach(() => vi.restoreAllMocks());

it('uses the isolated credential, current CSRF and exact context after one scoped 409 retry', async () => {
  vi.mocked(axios.post).mockResolvedValueOnce({ data: { access_token: second } });
  let writes = 0;
  ports.explain.mockImplementation(async config => {
    if (config.method === 'get') return response(config, initialHistory);
    if (++writes === 1) reject(config, 409, rotated);
    return response(config, answerFixture(request));
  });
  await expect(appendExplain(admit(), request)).resolves.toMatchObject({ kind: 'answer' });
  const body = { ...request, conversation_id: ids.conversation };
  const params = { conversation_id: ids.conversation };
  expect(calls()).toEqual([
    { method: 'get', bearer: `Bearer ${first}`, csrf: sessionCsrf(first) },
    { method: 'post', bearer: `Bearer ${first}`, csrf: sessionCsrf(first), body },
    { method: 'get', bearer: `Bearer ${second}`, csrf: sessionCsrf(second), params },
    { method: 'post', bearer: `Bearer ${second}`, csrf: sessionCsrf(second), body },
  ]);
  expect(axios.post).toHaveBeenCalledOnce();
  expect(ports.generic).not.toHaveBeenCalled();
});

it('joins the existing auth refresh flight and refuses a second rotation', async () => {
  let finishRefresh!: (response: unknown) => void;
  const refresh = new Promise(resolve => { finishRefresh = resolve; });
  vi.mocked(axios.post).mockReturnValueOnce(refresh as never);
  let inFlight: Promise<string> | undefined;
  ports.explain.mockImplementation(async config => {
    if (config.method === 'get') return response(config, initialHistory);
    if (!inFlight) {
      inFlight = refreshAccessToken(first);
      queueMicrotask(() => finishRefresh({ data: { access_token: second } }));
    }
    reject(config, 409, rotated);
  });
  await expect(appendExplain(admit(), request)).resolves.toEqual({ kind: 'refused', clear: true });
  expect(axios.post).toHaveBeenCalledOnce();
  expect(calls().filter(call => call.method === 'post')).toHaveLength(2);
});

it.each([401, 403, 404, 422, 409])('keeps general %s refusals out of refresh and replay', async status => {
  ports.explain.mockImplementation(async config => {
    if (config.method === 'get') return response(config, initialHistory);
    reject(config, status, { detail: 'SYNTHETIC_GENERAL_FAILURE' });
  });
  await expect(appendExplain(admit(), request)).resolves.toMatchObject({ kind: 'refused' });
  expect(axios.post).not.toHaveBeenCalled();
  expect(calls().map(call => call.method)).toEqual(['get', 'post']);
});

it.each([true, false])('checks scoped history for an ambiguous write with possible match %s', async hasMatch => {
  let reads = 0;
  ports.explain.mockImplementation(async config => {
    if (config.method === 'get') return response(config, {
      ...initialHistory, turns: ++reads === 2 && hasMatch ? [answerFixture(request).turn] : [],
    });
    throw new AxiosError('lost response', 'ERR_NETWORK', config);
  });
  await expect(appendExplain(admit(), request)).resolves.toEqual({
    kind: 'uncertain', history: hasMatch ? 'possibleMatch' : 'noMatch',
  });
  expect(calls().map(call => call.method)).toEqual(['get', 'post', 'get']);
  expect(calls()[2].params).toEqual({ conversation_id: ids.conversation });
  expect(axios.post).not.toHaveBeenCalled();
});

it('lets an already rotated bearer confirm ambiguous history only with a scoped conversation', async () => {
  ports.explain.mockImplementation(async config => {
    if (config.method === 'get') return response(config, initialHistory);
    useAuthStore.setState({ token: second });
    reject(config, 503, { detail: 'UNAVAILABLE' });
  });
  await expect(appendExplain(admit(), request)).resolves.toEqual({ kind: 'uncertain', history: 'noMatch' });
  expect(calls()[2]).toMatchObject({ bearer: `Bearer ${second}`, csrf: sessionCsrf(second), params: { conversation_id: ids.conversation } });
  expect(axios.post).not.toHaveBeenCalled();
});

it('leaves the first 409 for explicit retry when no conversation can prove family', async () => {
  ports.explain.mockImplementation(async config => {
    if (config.method === 'get') return response(config, { ...initialHistory, conversation_id: null, expires_at: null });
    reject(config, 409, rotated);
  });
  await expect(appendExplain(admit(), request)).resolves.toEqual({ kind: 'refused', clear: true });
  expect(calls().map(call => call.method)).toEqual(['get', 'post']);
  expect(axios.post).not.toHaveBeenCalled();
});

it.each(['family', 'org', 'route', 'owner'] as const)('suppresses a retry on %s mismatch', async mismatch => {
  const route = { current: true };
  ports.explain.mockImplementation(async config => {
    if (config.method === 'get') {
      if (config.params) reject(config, 404, { detail: 'NOT_FOUND' });
      return response(config, initialHistory);
    }
    useAuthStore.setState({ token: mismatch === 'org' ? bearer('other-row', 'other-org') : second });
    if (mismatch === 'route') route.current = false;
    if (mismatch === 'owner') advanceAuthSessionOwner(false);
    reject(config, 409, rotated);
  });
  const operation = appendExplain(admit(route), request);
  if (mismatch === 'route' || mismatch === 'owner') await expect(operation).rejects.toThrow();
  else await expect(operation).resolves.toMatchObject({ kind: 'refused' });
  expect(calls().filter(call => call.method === 'post')).toHaveLength(1);
  expect(axios.post).not.toHaveBeenCalled();
});


it('checks history after a lost retry response without sending a third append', async () => {
  vi.mocked(axios.post).mockResolvedValueOnce({ data: { access_token: second } });
  let writes = 0;
  ports.explain.mockImplementation(async config => {
    if (config.method === 'get') return response(config, {
      ...initialHistory, turns: writes === 2 ? [answerFixture(request).turn] : [],
    });
    if (++writes === 1) reject(config, 409, rotated);
    throw new AxiosError('lost retry response', 'ERR_NETWORK', config);
  });
  await expect(appendExplain(admit(), request)).resolves.toEqual({ kind: 'uncertain', history: 'possibleMatch' });
  expect(calls().map(call => call.method)).toEqual(['get', 'post', 'get', 'post', 'get']);
  expect(calls()[4]).toMatchObject({ bearer: `Bearer ${second}`, params: { conversation_id: ids.conversation } });
});

it('checks an uncertain first append with the original verified credential', async () => {
  let attempted = false;
  ports.explain.mockImplementation(async config => {
    if (config.method === 'get') return response(config, attempted ? {
      ...initialHistory, turns: [answerFixture(request).turn],
    } : { ...initialHistory, conversation_id: null, expires_at: null });
    attempted = true;
    throw new AxiosError('lost response', 'ERR_NETWORK', config);
  });
  await expect(appendExplain(admit(), request)).resolves.toEqual({ kind: 'uncertain', history: 'possibleMatch' });
  expect(calls().map(call => call.method)).toEqual(['get', 'post', 'get']);
  expect(calls()[2]).toEqual({ method: 'get', bearer: `Bearer ${first}`, csrf: sessionCsrf(first) });
});


it('ends an expired selected conversation and lets a later explicit question start a new one', async () => {
  ports.explain.mockImplementation(async config => {
    if (config.method === 'get') reject(config, 404, { detail: 'NOT_FOUND' });
    return response(config, answerFixture(request));
  });
  await expect(appendExplain(admit(), { ...request, conversation_id: ids.conversation })).resolves.toEqual({
    kind: 'refused', clear: true,
  });
  expect(calls().map(call => call.method)).toEqual(['get']);
  await expect(appendExplain(admit(), request)).resolves.toMatchObject({ kind: 'answer' });
  expect(calls().map(call => call.method)).toEqual(['get', 'get', 'post']);
  expect(calls()[2].body).toEqual(request);
});
