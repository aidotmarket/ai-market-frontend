import { createHmac } from 'node:crypto';
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

import { appendExplain as startExplain, type ExplainRequest } from './explain';
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
const firstPartyRequired = { detail: 'FIRST_PARTY_SESSION_REQUIRED' };
const proved = { ...initialHistory, predecessor_verified: true };
async function appendExplain(...args: Parameters<typeof startExplain>) {
  const apply = await startExplain(...args);
  return new Promise<Parameters<Parameters<typeof apply>[0]>[0]>((resolve, reject) => {
    void apply(resolve).catch(reject);
  });
}
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
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('proves a rotation observed during the initial GET before the first POST', async () => {
  ports.explain.mockImplementation(async config => {
    if (config.method === 'get') {
      if (config.headers.has('X-Explain-Predecessor-Session')) return response(config, proved);
      useAuthStore.setState({ token: second });
      return response(config, initialHistory);
    }
    return response(config, answerFixture(request));
  });
  await expect(appendExplain(admit(), request)).resolves.toMatchObject({ kind: 'answer' });
  const body = { ...request, conversation_id: ids.conversation };
  const params = { conversation_id: ids.conversation };
  expect(calls()).toEqual([
    { method: 'get', bearer: `Bearer ${first}`, csrf: sessionCsrf(first) },
    { method: 'get', bearer: `Bearer ${second}`, csrf: sessionCsrf(second), predecessor: ids.session, params },
    { method: 'post', bearer: `Bearer ${second}`, csrf: sessionCsrf(second), predecessor: ids.session, body },
  ]);
  expect(axios.post).not.toHaveBeenCalled();
  expect(ports.generic).not.toHaveBeenCalled();
});

it('joins an existing refresh after the structured POST denial for history only', async () => {
  let finishRefresh!: (response: unknown) => void;
  const refresh = new Promise(resolve => { finishRefresh = resolve; });
  vi.mocked(axios.post).mockReturnValueOnce(refresh as never);
  let inFlight: Promise<string> | undefined;
  ports.explain.mockImplementation(async config => {
    if (config.method === 'get') return response(config, config.headers.has('X-Explain-Predecessor-Session') ? proved : initialHistory);
    if (!inFlight) {
      inFlight = refreshAccessToken(first);
      queueMicrotask(() => finishRefresh({ data: { access_token: second } }));
    }
    reject(config, 401, firstPartyRequired);
  });
  await expect(appendExplain(admit(), request)).resolves.toEqual({ kind: 'refused', clear: false });
  expect(axios.post).toHaveBeenCalledOnce();
  expect(useAuthStore.getState().token).toBe(second);
  expect(calls().map(call => call.method)).toEqual(['get', 'post', 'get']);
  expect(calls().at(-1)).toMatchObject({
    bearer: `Bearer ${second}`, csrf: sessionCsrf(second), predecessor: ids.session, params: { conversation_id: ids.conversation },
  });
});

it('uses only scoped history after the admission 401 when a signed bearer expires between GET and POST', async () => {
  const expiry = Date.parse('2026-11-23T09:00:00Z') / 1000;
  const owner = { ...explainUser, id: '88888888-8888-4888-8888-888888888888' };
  const claims = { sub: owner.id, organization_id: ids.draft, auth_generation: 0, iat: expiry - 1800 };
  const sign = (payload: object) => {
    const encoded = [JSON.stringify({ alg: 'HS256', typ: 'JWT' }), JSON.stringify(payload)]
      .map(part => Buffer.from(part).toString('base64url')).join('.');
    return `${encoded}.${createHmac('sha256', 'synthetic-explain-wire-fixture').update(encoded).digest('base64url')}`;
  };
  const expired = sign({ ...claims, type: 'access', jti: crypto.randomUUID(), session_id: ids.session, exp: expiry });
  const successor = sign({ ...claims, type: 'access', jti: crypto.randomUUID(), session_id: ids.successor, exp: expiry + 1800 });
  const refreshClaims = {
    ...claims, type: 'refresh', jti: crypto.randomUUID(), session_id: ids.session,
    refresh_family: crypto.randomUUID(), exp: expiry + 86_400,
  };
  const cookies = new Map([['refresh_token', sign(refreshClaims)]]);
  let now = (expiry - 1) * 1000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  useAuthStore.setState({ token: expired, user: owner });
  let rotated = false;
  const wire = vi.fn(async (incoming: Request) => {
    const url = new URL(incoming.url);
    if (url.pathname === '/api/v1/auth/refresh') {
      expect(incoming.method).toBe('POST');
      const cookie = incoming.credentials === 'include' ? cookies.get('refresh_token') : undefined;
      if (cookie !== sign(refreshClaims) || Date.now() >= refreshClaims.exp * 1000) return Response.json({}, { status: 401 });
      expect(incoming.headers.has('Authorization')).toBe(false);
      rotated = true;
      return Response.json({ access_token: successor });
    }
    expect(incoming.credentials).toBe('omit');
    const token = incoming.headers.get('Authorization');
    if (token === `Bearer ${expired}`) {
      expect(incoming.headers.get('X-CSRF-Token')).toBe(sessionCsrf(expired));
      if (incoming.method === 'POST') {
        now = expiry * 1000;
        expect(await incoming.json()).toEqual({ ...request, conversation_id: ids.conversation });
      }
      // The pinned admission verifier emits this same wire value on JWT expiry.
      if (Date.now() >= expiry * 1000) return Response.json(firstPartyRequired, { status: 401 });
      return Response.json(initialHistory);
    }
    expect(rotated).toBe(true);
    expect(token).toBe(`Bearer ${successor}`);
    expect(incoming.headers.get('X-CSRF-Token')).toBe(sessionCsrf(successor));
    if (incoming.headers.has('X-Explain-Predecessor-Session')) {
      expect(incoming.headers.get('X-Explain-Predecessor-Session')).toBe(ids.session);
      if (incoming.method === 'GET') {
        expect(url.searchParams.get('conversation_id')).toBe(ids.conversation);
        return Response.json(proved);
      }
      expect(await incoming.json()).toEqual({ ...request, conversation_id: ids.conversation });
    }
    return Response.json(incoming.method === 'GET' ? initialHistory : answerFixture(request));
  });
  vi.stubGlobal('fetch', wire);
  ports.explain.mockImplementation(axios.getAdapter('fetch'));
  vi.mocked(axios.post).mockImplementation((url, data, config) => axios({ ...config, url, data, method: 'post', adapter: 'fetch' }));

  await expect(appendExplain(admit(), request)).resolves.toEqual({ kind: 'refused', clear: false });
  expect(calls().map(call => call.method)).toEqual(['get', 'post', 'get', 'get']);
  expect(axios.post).toHaveBeenCalledOnce();
  expect(useAuthStore.getState().token).toBe(successor);
  expect(wire.mock.calls.map(([incoming]) => [incoming.method, new URL(incoming.url).pathname])).toEqual([
    ['GET', '/api/v1/allai/explain/history'], ['POST', '/api/v1/allai/explain'], ['GET', '/api/v1/allai/explain/history'],
    ['POST', '/api/v1/auth/refresh'], ['GET', '/api/v1/allai/explain/history'],
  ]);

  await expect(appendExplain(admit(), { ...request, conversation_id: ids.conversation }, expired))
    .resolves.toMatchObject({ kind: 'answer' });
  expect(calls().map(call => call.method)).toEqual(['get', 'post', 'get', 'get', 'get', 'post']);
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

it.each([
  { detail: 'Unauthorized' },
  { detail: 'SESSION_EXPIRED' },
  { detail: { code: 'FIRST_PARTY_SESSION_REQUIRED' } },
  { ...firstPartyRequired, extra: true },
])('keeps a generic or unsupported 401 out of recovery even when a new credential appeared (%j)', async detail => {
  ports.explain.mockImplementation(async config => {
    if (config.method === 'get') return response(config, initialHistory);
    useAuthStore.setState({ token: second });
    reject(config, 401, detail);
  });
  await expect(appendExplain(admit(), request)).resolves.toEqual({ kind: 'refused', clear: true });
  expect(calls().map(call => call.method)).toEqual(['get', 'post']);
  expect(axios.post).not.toHaveBeenCalled();
});

it('stops a structured first-party refusal when ordinary refresh supplies no distinct successor', async () => {
  vi.mocked(axios.post).mockResolvedValueOnce({ data: { access_token: first } });
  ports.explain.mockImplementationOnce(async config => response(config, initialHistory))
    .mockImplementation(async config => reject(config, 401, firstPartyRequired));
  await expect(appendExplain(admit(), request)).resolves.toEqual({ kind: 'refused', clear: true });
  expect(calls().map(call => call.method)).toEqual(['get', 'post', 'get']);
  expect(axios.post).toHaveBeenCalledOnce();
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

it.each([200, 408])('uses history alone for an ambiguous append response with status %s', async status => {
  let attempted = false;
  ports.explain.mockImplementation(async config => {
    if (config.method === 'get') return response(config, {
      ...initialHistory, turns: attempted ? [answerFixture(request).turn] : [],
    });
    attempted = true;
    if (status === 408) reject(config, status, { detail: 'Synthetic timeout' });
    return response(config, { outcome: 'answered' });
  });
  await expect(appendExplain(admit(), request)).resolves.toEqual({ kind: 'uncertain', history: 'possibleMatch' });
  expect(calls().map(call => call.method)).toEqual(['get', 'post', 'get']);
  expect(calls()[2].params).toEqual({ conversation_id: ids.conversation });
  expect(axios.post).not.toHaveBeenCalled();
});

it('lets an already rotated bearer confirm ambiguous history with scope and predecessor proof', async () => {
  ports.explain.mockImplementation(async config => {
    if (config.method === 'get') return response(config, config.headers.has('X-Explain-Predecessor-Session') ? proved : initialHistory);
    useAuthStore.setState({ token: second });
    reject(config, 503, { detail: 'UNAVAILABLE' });
  });
  await expect(appendExplain(admit(), request)).resolves.toEqual({ kind: 'uncertain', history: 'noMatch' });
  expect(calls()[2]).toMatchObject({ bearer: `Bearer ${second}`, csrf: sessionCsrf(second), predecessor: ids.session, params: { conversation_id: ids.conversation } });
  expect(axios.post).not.toHaveBeenCalled();
});

it('recovers a retired initial GET through scoped history with one POST', async () => {
  vi.mocked(axios.post).mockResolvedValueOnce({ data: { access_token: second } });
  ports.explain.mockImplementation(async config => {
    if (config.headers.get('Authorization') === `Bearer ${first}`) reject(config, 401, firstPartyRequired);
    return response(config, config.method === 'get' ? proved : answerFixture(request));
  });
  const params = { conversation_id: ids.conversation };
  const body = { ...request, ...params };
  await expect(appendExplain(admit(), body)).resolves.toMatchObject({ kind: 'answer' });
  expect(calls()).toEqual([
    { method: 'get', bearer: `Bearer ${first}`, csrf: sessionCsrf(first), params },
    { method: 'get', bearer: `Bearer ${second}`, csrf: sessionCsrf(second), predecessor: ids.session, params },
    { method: 'post', bearer: `Bearer ${second}`, csrf: sessionCsrf(second), predecessor: ids.session, body },
  ]);
  expect(axios.post).toHaveBeenCalledOnce();
});

it('stops without a POST when the successor also retires during history proof', async () => {
  vi.mocked(axios.post).mockResolvedValueOnce({ data: { access_token: second } });
  ports.explain.mockImplementation(async config => reject(config, 401, firstPartyRequired));
  await expect(appendExplain(admit(), request)).resolves.toEqual({ kind: 'refused', clear: true });
  expect(calls().map(call => call.method)).toEqual(['get', 'get']);
  expect(axios.post).toHaveBeenCalledOnce();
  expect(useAuthStore.getState().token).toBe(second);
});

it.each(['get', 'post'])('requires anchorless predecessor proof after a retired first %s', async phase => {
  vi.mocked(axios.post).mockResolvedValueOnce({ data: { access_token: second } });
  let retired = false;
  ports.explain.mockImplementation(async config => {
    if (config.headers.get('Authorization') === `Bearer ${first}`) {
      retired ||= config.method === phase;
      if (retired) reject(config, 401, firstPartyRequired);
      return response(config, emptyHistory);
    }
    return response(config, config.method === 'get'
      ? { ...emptyHistory, predecessor_verified: true } : answerFixture(request));
  });
  const reply = await appendExplain(admit(), request);
  const replacement = { bearer: `Bearer ${second}`, csrf: sessionCsrf(second), predecessor: ids.session };
  if (phase === 'get') {
    expect(reply).toMatchObject({ kind: 'answer' });
    expect(calls().map(call => call.method)).toEqual(['get', 'get', 'post']);
    expect(calls().slice(-2)).toEqual([{ ...replacement, method: 'get' }, { ...replacement, method: 'post', body: request }]);
  } else {
    expect(reply).toEqual({ kind: 'refused', clear: false });
    expect(calls().map(call => call.method)).toEqual(['get', 'post', 'get', 'get']);
    expect(calls().at(-1)).toEqual({ ...replacement, method: 'get' });
  }
  expect(axios.post).toHaveBeenCalledOnce();
});

it.each(['legacy', 'denied', 'purged'] as const)('refreshes but stops the automatic first turn when predecessor proof is %s', async proof => {
  vi.mocked(axios.post).mockResolvedValueOnce({ data: { access_token: second } });
  ports.explain.mockImplementation(async config => {
    if (config.headers.get('Authorization') === `Bearer ${first}`) reject(config, 401, firstPartyRequired);
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
    if (!config.headers.has('X-Explain-Predecessor-Session')) reject(config, 401, firstPartyRequired);
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

it('cancels a refused append during renewal through ordinary cookie logout', async () => {
  let finishProof!: () => void;
  let finishLogout!: () => void;
  vi.mocked(axios.post).mockResolvedValueOnce({ data: { access_token: second } });
  ports.generic.mockImplementationOnce(async config => new Promise(resolve => {
    finishLogout = () => resolve(response(config, { message: 'Logged out' }));
  }));
  ports.explain.mockImplementation(async config => {
    if (config.method === 'post') reject(config, 401, firstPartyRequired);
    if (!config.params) return response(config, initialHistory);
    if (config.headers.get('Authorization') === `Bearer ${first}`) reject(config, 401, firstPartyRequired);
    return new Promise(resolve => { finishProof = () => resolve(response(config, proved)); });
  });
  const operation = appendExplain(admit(), request);
  await vi.waitFor(() => expect(finishProof).toBeTypeOf('function'));
  const cancelled = expect(operation).rejects.toThrow();
  const logout = useAuthStore.getState().logout();
  expect(useAuthStore.getState().token).toBeNull();
  await cancelled;
  await vi.waitFor(() => expect(finishLogout).toBeTypeOf('function'));
  finishProof();
  finishLogout();
  await logout;
  expect(ports.generic).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    method: 'post', url: '/auth/logout', withCredentials: true,
  }));
  expect(calls().map(call => call.method)).toEqual(['get', 'post', 'get', 'get']);
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

it.each(['get', 'post'])('cancels a pending %s after two ordinary renewals and accepts a new explicit question', async phase => {
  const scope = admit();
  vi.mocked(axios.post).mockResolvedValueOnce({ data: { access_token: second } })
    .mockResolvedValueOnce({ data: { access_token: third } });
  let pending!: InternalAxiosRequestConfig;
  let finish!: () => void;
  ports.explain.mockImplementation(async config => {
    if (config.headers.get('Authorization') === `Bearer ${first}` && config.method === phase) {
      pending = config;
      const data = config.method === 'get' ? initialHistory : answerFixture(request);
      return new Promise(resolve => { finish = () => resolve(response(config, data)); });
    }
    if (config.method === 'post') return response(config, answerFixture(request));
    return response(config, config.headers.get('Authorization') === `Bearer ${first}` ? initialHistory : emptyHistory);
  });

  const operation = appendExplain(scope, request);
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  await refreshAccessToken(first);
  useAuthStore.setState({ token: second, isLoading: true });
  expect(pending.signal?.aborted).toBe(false);
  await refreshAccessToken(second);
  expect(pending.signal?.aborted).toBe(true);
  expect(scope.signal.aborted).toBe(false);
  await expect(operation).resolves.toEqual(phase === 'get'
    ? { kind: 'refused', clear: true } : { kind: 'uncertain', history: 'unverified' });
  expect(useAuthStore.getState().token).toBe(third);
  expect(calls().map(call => call.method)).toEqual(phase === 'get' ? ['get'] : ['get', 'post']);

  await expect(appendExplain(admit(), request)).resolves.toMatchObject({ kind: 'answer' });
  finish();
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(calls().slice(phase === 'get' ? 1 : 2)).toEqual([
    { method: 'get', bearer: `Bearer ${third}`, csrf: sessionCsrf(third) },
    { method: 'post', bearer: `Bearer ${third}`, csrf: sessionCsrf(third), body: request },
  ]);
  expect(axios.post).toHaveBeenCalledTimes(2);
});

it.each(['verified', 'denied', 'renewed again', 'owner changed'] as const)(
  'handles a valid first response when current conversation proof is %s',
  async proof => {
    let finishProof!: () => void;
    const accepted = answerFixture(request);
    ports.explain.mockImplementation(async config => {
      if (config.method === 'post') {
        useAuthStore.setState({ token: second });
        return response(config, accepted);
      }
      if (!config.params) return response(config, emptyHistory);
      if (proof === 'denied') reject(config, 404, { detail: 'NOT_FOUND' });
      return new Promise(resolve => {
        finishProof = () => resolve(response(config, { ...proved, turns: [accepted.turn] }));
      });
    });

    const operation = appendExplain(admit(), request);
    if (proof === 'denied') {
      await expect(operation).resolves.toEqual({ kind: 'uncertain', history: 'unverified' });
    } else {
      await vi.waitFor(() => expect(finishProof).toBeTypeOf('function'));
      if (proof === 'renewed again') {
        useAuthStore.setState({ token: third });
        await expect(operation).resolves.toEqual({ kind: 'uncertain', history: 'unverified' });
      } else if (proof === 'owner changed') {
        advanceAuthSessionOwner(false);
        await expect(operation).rejects.toThrow();
      }
      finishProof();
      if (proof === 'verified') await expect(operation).resolves.toMatchObject({ kind: 'answer' });
    }

    expect(calls().map(call => [call.method, call.bearer])).toEqual([
      ['get', `Bearer ${first}`], ['post', `Bearer ${first}`], ['get', `Bearer ${second}`],
    ]);
    expect(calls()[1].body).toEqual(request);
    expect(calls()[2]).toMatchObject({ params: { conversation_id: ids.conversation }, predecessor: ids.session });
    expect(axios.post).not.toHaveBeenCalled();
  },
);

it.each([
  ['answer', 'answer'], ['refusal', 'refused'], ['lost response', 'uncertain'], ['owner change', null],
])('disposes the question auth observer on %s', async (outcome, kind) => {
  const subscribe = useAuthStore.subscribe;
  const dispose = vi.fn();
  vi.spyOn(useAuthStore, 'subscribe').mockImplementation(listener => {
    const unsubscribe = subscribe(listener);
    return () => { unsubscribe(); dispose(); };
  });
  let finish!: () => void;
  ports.explain.mockImplementation(async config => {
    if (config.method === 'get') return response(config, initialHistory);
    if (outcome === 'refusal') reject(config, 403, { detail: 'SYNTHETIC_GENERAL_FAILURE' });
    if (outcome === 'lost response') throw new AxiosError('lost response', 'ERR_NETWORK', config);
    if (outcome === 'owner change') {
      return new Promise(resolve => { finish = () => resolve(response(config, answerFixture(request))); });
    }
    return response(config, answerFixture(request));
  });

  const operation = appendExplain(admit(), request);
  expect(dispose).not.toHaveBeenCalled();
  if (kind === null) {
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    const rejected = expect(operation).rejects.toThrow();
    advanceAuthSessionOwner(false);
    await rejected;
    expect(dispose).toHaveBeenCalledOnce();
    finish();
  } else {
    await expect(operation).resolves.toMatchObject({ kind });
  }
  expect(dispose).toHaveBeenCalledOnce();
});

it.each(['submit', 'confirmation'] as const)('ends the question after a pending refresh followed by retirement during %s', async phase => {
  let finish!: (value: unknown) => void;
  vi.mocked(axios.post).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }) as never)
    .mockResolvedValueOnce({ data: { access_token: third } });
  const refresh = refreshAccessToken(first);
  let reads = 0;
  ports.explain.mockImplementation(async config => {
    if (config.headers.get('Authorization') === `Bearer ${third}`) {
      return response(config, config.method === 'get' ? emptyHistory : answerFixture(request));
    }
    if (config.method === 'get' && ++reads === 1) return response(config, { ...emptyHistory, predecessor_verified: true });
    if (config.method === 'post' && phase === 'confirmation') throw new AxiosError('lost response', 'ERR_NETWORK', config);
    reject(config, 401, firstPartyRequired);
  });

  const operation = appendExplain(admit(), request);
  finish({ data: { access_token: second } });
  await refresh;
  await expect(operation).resolves.toEqual(phase === 'submit'
    ? { kind: 'refused', clear: true } : { kind: 'uncertain', history: 'unverified' });
  expect(calls().map(call => [call.method, call.bearer])).toEqual(
    ['get', 'post', 'get'].map(method => [method, `Bearer ${second}`]));
  expect(useAuthStore.getState().token).toBe(second);
  expect(axios.post).toHaveBeenCalledOnce();

  await refreshAccessToken(second);
  await expect(appendExplain(admit(), request)).resolves.toMatchObject({ kind: 'answer' });
  expect(calls().at(-1)).toEqual({ method: 'post', bearer: `Bearer ${third}`, csrf: sessionCsrf(third), body: request });
  expect(axios.post).toHaveBeenCalledTimes(2);
});

it.each([null, '', 'invalid-session', `${ids.session}\n`].flatMap(id =>
  (['pending', 'retired'] as const).map(phase => ({ id, phase })),
))('stops anchorless $phase continuation with predecessor $id', async ({ id, phase }) => {
  const previous = bearer(id);
  useAuthStore.setState({ token: previous });
  let finish!: (value: unknown) => void;
  if (phase === 'pending') {
    vi.mocked(axios.post).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }) as never);
    void refreshAccessToken(previous);
  } else {
    vi.mocked(axios.post).mockResolvedValueOnce({ data: { access_token: second } });
  }
  ports.explain.mockImplementationOnce(async config => response(config, emptyHistory))
    .mockImplementation(async config => reject(config, 401, firstPartyRequired));

  const operation = appendExplain(admit(), request);
  if (phase === 'pending') finish({ data: { access_token: second } });
  await expect(operation).resolves.toEqual({ kind: 'refused', clear: true });
  expect(calls().map(call => [call.method, call.bearer])).toEqual(
    phase === 'pending' ? [] : ['get', 'post', 'get'].map(method => [method, `Bearer ${previous}`]));
  expect(useAuthStore.getState().token).toBe(second);
  expect(axios.post).toHaveBeenCalledOnce();
});

it.each(['family', 'org', 'route', 'owner', 'missing predecessor proof', 'wrong conversation'] as const)('rejects post-denial recovery on %s mismatch', async mismatch => {
  const route = { current: true };
  ports.explain.mockImplementation(async config => {
    if (config.method === 'get') {
      if (!config.params) return response(config, initialHistory);
      if (mismatch === 'family') reject(config, 404, { detail: 'NOT_FOUND' });
      if (mismatch === 'missing predecessor proof') return response(config, initialHistory);
      return response(config, { ...proved, conversation_id: ids.order });
    }
    useAuthStore.setState({ token: mismatch === 'org' ? bearer(ids.successor, 'other-org') : second });
    if (mismatch === 'route') route.current = false;
    if (mismatch === 'owner') advanceAuthSessionOwner(false);
    reject(config, 401, firstPartyRequired);
  });
  const operation = appendExplain(admit(route), request);
  if (mismatch === 'route' || mismatch === 'owner') await expect(operation).rejects.toThrow();
  else await expect(operation).resolves.toEqual({ kind: 'refused', clear: true });
  expect(calls().filter(call => call.method === 'post')).toHaveLength(1);
  expect(axios.post).not.toHaveBeenCalled();
});


it('checks history after a lost POST response following proved pre-send rotation', async () => {
  let attempted = false;
  const turn = answerFixture(request).turn;
  ports.explain.mockImplementation(async config => {
    if (config.method === 'get') {
      if (config.headers.get('Authorization') === `Bearer ${first}`) {
        useAuthStore.setState({ token: second });
        return response(config, initialHistory);
      }
      return response(config, { ...proved, turns: attempted ? [turn] : [] });
    }
    attempted = true;
    throw new AxiosError('lost response', 'ERR_NETWORK', config);
  });
  await expect(appendExplain(admit(), request)).resolves.toEqual({ kind: 'uncertain', history: 'possibleMatch' });
  expect(calls().map(call => call.method)).toEqual(['get', 'get', 'post', 'get']);
  expect(calls()[3]).toMatchObject({ bearer: `Bearer ${second}`, predecessor: ids.session, params: { conversation_id: ids.conversation } });
  expect(axios.post).not.toHaveBeenCalled();
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
    if (config.headers.get('Authorization') === `Bearer ${first}`) reject(config, 401, firstPartyRequired);
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
    ...(outcome === 'select_context' ? { question: 'storage' } : { suggestions: [{ question: 'storage', label: 'Storage' }] }),
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
    if (config.method === 'get' && config.params) reject(config, 404, { detail: 'NOT_FOUND' });
    return response(config, config.method === 'get' ? emptyHistory : answerFixture(request));
  });
  await expect(appendExplain(admit(), { ...request, conversation_id: ids.conversation })).resolves.toEqual({
    kind: 'refused', clear: true,
  });
  expect(calls().map(call => call.method)).toEqual(['get']);
  await expect(appendExplain(admit(), request)).resolves.toMatchObject({ kind: 'answer' });
  expect(calls().map(call => call.method)).toEqual(['get', 'get', 'post']);
  expect(calls()[2].body).toEqual(request);
});
