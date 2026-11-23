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
const second = bearer(ids.successor);
const third = bearer('77777777-7777-4777-8777-777777777777');
const request: ExplainRequest = { intent: 'explain', locale: 'en', question: 'storage', target: questions.storage };
const initialHistory = { conversation_id: ids.conversation, expires_at: '2099-01-01T00:00:00Z', turns: [], before: null };
const emptyHistory = { ...initialHistory, conversation_id: null, expires_at: null };
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
    ...(r.headers.has('X-Explain-Predecessor-Session') && { predecessor: r.headers.get('X-Explain-Predecessor-Session') }),
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
  vi.mocked(axios.post).mockReturnValueOnce(refresh as never)
    .mockResolvedValueOnce({ data: { access_token: third } });
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
  expect(axios.post).toHaveBeenCalledTimes(2);
  expect(useAuthStore.getState().token).toBe(third);
  expect(calls().map(call => call.method)).toEqual(['get', 'post', 'get', 'post']);
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

it('recovers a retired initial GET through scoped history with one POST', async () => {
  vi.mocked(axios.post).mockResolvedValueOnce({ data: { access_token: second } });
  ports.explain.mockImplementation(async config => {
    if (config.headers.get('Authorization') === `Bearer ${first}`) reject(config, 409, rotated);
    return response(config, config.method === 'get' ? initialHistory : answerFixture(request));
  });
  const params = { conversation_id: ids.conversation };
  const body = { ...request, ...params };
  await expect(appendExplain(admit(), body)).resolves.toMatchObject({ kind: 'answer' });
  expect(calls()).toEqual([
    { method: 'get', bearer: `Bearer ${first}`, csrf: sessionCsrf(first), params },
    { method: 'get', bearer: `Bearer ${second}`, csrf: sessionCsrf(second), params },
    { method: 'post', bearer: `Bearer ${second}`, csrf: sessionCsrf(second), body },
  ]);
  expect(axios.post).toHaveBeenCalledOnce();
});

it('stops without a POST when the successor also retires during history proof', async () => {
  vi.mocked(axios.post).mockResolvedValueOnce({ data: { access_token: second } })
    .mockResolvedValueOnce({ data: { access_token: third } });
  ports.explain.mockImplementation(async config => reject(config, 409, rotated));
  await expect(appendExplain(admit(), request)).resolves.toEqual({ kind: 'refused', clear: true });
  expect(calls().map(call => call.method)).toEqual(['get', 'get']);
  expect(useAuthStore.getState().token).toBe(third);
});

it.each(['get', 'post'])('requires anchorless predecessor proof on a retired first %s and sends the same UUID on POST', async phase => {
  vi.mocked(axios.post).mockResolvedValueOnce({ data: { access_token: second } });
  ports.explain.mockImplementation(async config => {
    if (config.headers.get('Authorization') === `Bearer ${first}`) {
      if (config.method === phase) reject(config, 409, rotated);
      return response(config, emptyHistory);
    }
    return response(config, config.method === 'get'
      ? { ...emptyHistory, predecessor_verified: true } : answerFixture(request));
  });
  await expect(appendExplain(admit(), request)).resolves.toMatchObject({ kind: 'answer' });
  expect(calls().map(call => call.method)).toEqual(phase === 'get' ? ['get', 'get', 'post'] : ['get', 'post', 'get', 'post']);
  const replacement = { bearer: `Bearer ${second}`, csrf: sessionCsrf(second), predecessor: ids.session };
  expect(calls().slice(-2)).toEqual([
    { ...replacement, method: 'get' },
    { ...replacement, method: 'post', body: request },
  ]);
  expect(axios.post).toHaveBeenCalledOnce();
});

it.each(['legacy', 'denied', 'purged'] as const)('refreshes but stops the automatic first turn when predecessor proof is %s', async proof => {
  vi.mocked(axios.post).mockResolvedValueOnce({ data: { access_token: second } });
  ports.explain.mockImplementation(async config => {
    if (config.headers.get('Authorization') === `Bearer ${first}`) reject(config, 409, rotated);
    if (config.headers.has('X-Explain-Predecessor-Session')) {
      if (proof === 'purged') reject(config, 404, { detail: 'NOT_FOUND' });
      return response(config, proof === 'legacy' ? initialHistory : { ...emptyHistory, predecessor_verified: false });
    }
    return response(config, config.method === 'get' ? emptyHistory : answerFixture(request));
  });
  await expect(appendExplain(admit(), request)).resolves.toEqual({ kind: 'refused', clear: true });
  expect(calls().map(call => call.method)).toEqual(['get', 'get']);
  expect(useAuthStore.getState().token).toBe(second);
  await expect(appendExplain(admit(), request)).resolves.toMatchObject({ kind: 'answer' });
  expect(calls().map(call => call.method)).toEqual(['get', 'get', 'get', 'post']);
  expect(calls()[3]).not.toHaveProperty('predecessor');
  expect(axios.post).toHaveBeenCalledOnce();
});

it.each(['route', 'owner', 'logout', 'bearer'] as const)('drops a successful pending proof when %s changes', async change => {
  const route = { current: true };
  vi.mocked(axios.post).mockResolvedValueOnce({ data: { access_token: second } });
  let finish!: () => void;
  ports.explain.mockImplementation(async config => {
    if (!config.headers.has('X-Explain-Predecessor-Session')) reject(config, 409, rotated);
    return new Promise(resolve => { finish = () => resolve(response(config, { ...emptyHistory, predecessor_verified: true })); });
  });
  const operation = appendExplain(admit(route), request);
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  if (change === 'route') route.current = false;
  if (change === 'owner' || change === 'logout') advanceAuthSessionOwner(false);
  if (change === 'logout') useAuthStore.setState({ token: null, user: null, isAuthenticated: false });
  if (change === 'bearer') useAuthStore.setState({ token: third });
  finish();
  if (change === 'bearer') await expect(operation).resolves.toEqual({ kind: 'refused', clear: true });
  else await expect(operation).rejects.toThrow();
  expect(calls().map(call => call.method)).toEqual(['get', 'get']);
});

it('joins a pending refresh before history and proves the bearer change before a first POST', async () => {
  let finish!: (value: unknown) => void;
  vi.mocked(axios.post).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }) as never);
  const refresh = refreshAccessToken(first);
  ports.explain.mockImplementation(async config => response(config, config.method === 'get'
    ? { ...emptyHistory, predecessor_verified: true } : answerFixture(request)));
  const operation = appendExplain(admit(), request);
  expect(calls()).toEqual([]);
  finish({ data: { access_token: second } });
  await refresh;
  await expect(operation).resolves.toMatchObject({ kind: 'answer' });
  expect(calls().map(call => [call.method, call.predecessor])).toEqual([['get', ids.session], ['post', ids.session]]);
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

it.each(['verified', 'legacy', 'refused', 'retired'] as const)('uses read-only predecessor history after a lost first POST response with %s proof', async proof => {
  let attempted = false;
  vi.mocked(axios.post).mockResolvedValueOnce({ data: { access_token: second } });
  ports.explain.mockImplementation(async config => {
    if (config.method === 'post') {
      attempted = true;
      if (proof !== 'retired') useAuthStore.setState({ token: second });
      throw new AxiosError('lost response', 'ERR_NETWORK', config);
    }
    if (!attempted) return response(config, emptyHistory);
    if (config.headers.get('Authorization') === `Bearer ${first}`) reject(config, 409, rotated);
    const evidence = { ...initialHistory, turns: [answerFixture(request).turn] };
    if (proof === 'refused') reject(config, 404, { detail: 'NOT_FOUND' });
    return response(config, proof === 'legacy' ? evidence : { ...evidence, predecessor_verified: true });
  });
  await expect(appendExplain(admit(), request)).resolves.toEqual({
    kind: 'uncertain', history: proof === 'verified' || proof === 'retired' ? 'possibleMatch' : 'unverified',
  });
  expect(calls().map(call => call.method)).toEqual(proof === 'retired' ? ['get', 'post', 'get', 'get'] : ['get', 'post', 'get']);
  expect(calls().at(-1)).toEqual({
    method: 'get', bearer: `Bearer ${second}`, csrf: sessionCsrf(second), predecessor: ids.session,
  });
});

it.each(['select_context', 'suggestions'] as const)('recognizes %s as a definite non-append', async outcome => {
  ports.explain.mockImplementation(async config => response(config, config.method === 'get' ? initialHistory : {
    outcome, locale: 'en', message: 'Synthetic reviewed response',
  }));
  await expect(appendExplain(admit(), request)).resolves.toEqual({ kind: outcome });
  expect(calls().map(call => call.method)).toEqual(['get', 'post']);
  expect(axios.post).not.toHaveBeenCalled();
});

it.each([
  ['en', 'Listing status: unlisted. Open Seller Workspace to view it.'],
  ['es', 'Estado del anuncio: no listado. Ábrelo en el espacio de trabajo del vendedor.'],
  ['zh-Hans', '商品状态：已下架。请在卖家工作区查看。'],
] as const)('accepts the reviewed %s listing answer for unlisted', async (locale, answer) => {
  const listing: ExplainRequest = { intent: 'explain', locale, question: 'listing_status', target: questions.listing_status };
  const fixture = answerFixture(listing);
  ports.explain.mockImplementation(async config => response(config, config.method === 'get' ? emptyHistory : {
    ...fixture, turn: { ...fixture.turn, answer }, facts: { ...fixture.facts, listing_state: 'unlisted' },
  }));
  await expect(appendExplain(admit(), listing)).resolves.toMatchObject({ kind: 'answer', answer: { turn: { locale, answer } } });
});

it.each([
  [{ listing_state: 'paused' }, 'refused'],
  [{ status_counts: { unknown: 1 } }, 'refused'],
  [{ status_counts: { unlisted: 1, withdrawn: 1, hidden: 1 } }, 'answer'],
])('handles closed overview or selected listing facts %j without follow-up writes', async (facts, kind) => {
  const listing: ExplainRequest = { intent: 'explain', locale: 'en', question: 'listing_status', target: { kind: 'listing' } };
  const fixture = answerFixture(listing);
  ports.explain.mockImplementation(async config => response(config, config.method === 'get' ? emptyHistory : {
    ...fixture, facts: { ...fixture.facts, ...facts },
  }));
  await expect(appendExplain(admit(), listing)).resolves.toMatchObject({ kind });
  expect(calls().map(call => call.method)).toEqual(['get', 'post']);
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
