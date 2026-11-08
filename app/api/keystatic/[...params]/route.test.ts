import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  config: { storage: { kind: 'github', repo: { owner: 'fixture', name: 'fixture' } } },
  factory: vi.fn(),
  dependencyLoaded: vi.fn(),
  configLoaded: vi.fn(),
}));

vi.mock('@keystatic/next/route-handler', () => {
  fake.dependencyLoaded();
  return { makeRouteHandler: fake.factory };
});
vi.mock('../../../../keystatic.config', () => {
  fake.configLoaded();
  return { default: fake.config };
});

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('lazy Keystatic route (offline fakes only)', () => {
  it('imports without loading dependencies, invoking the factory, or reading private settings', async () => {
    const privateRead = vi.fn(() => { throw new Error('private setting read during import'); });
    const env = new Proxy({ NODE_ENV: 'production' }, {
      get(target, key) {
        if (typeof key === 'string' && key.startsWith('KEYSTATIC_')) return privateRead();
        return Reflect.get(target, key);
      },
    });
    vi.stubGlobal('process', new Proxy(process, {
      get(target, key) { return key === 'env' ? env : Reflect.get(target, key); },
    }));

    const route = await import('./route');
    expect(Object.keys(route).sort()).toEqual(['GET', 'POST']);
    expect(fake.dependencyLoaded).not.toHaveBeenCalled();
    expect(fake.configLoaded).not.toHaveBeenCalled();
    expect(fake.factory).not.toHaveBeenCalled();
    expect(privateRead).not.toHaveBeenCalled();
  });

  it('passes the same config, requests and responses through GET and POST and reuses success', async () => {
    const getResult = new Response('get fixture', { status: 207 });
    const postResult = new Response('post fixture', { status: 202 });
    const GET = vi.fn().mockResolvedValue(getResult);
    const POST = vi.fn().mockResolvedValue(postResult);
    fake.factory.mockReturnValue({ GET, POST });
    const route = await import('./route');
    const getRequest = new Request('https://fixture.invalid/api/keystatic/test?fixture=1');
    const postRequest = new Request('https://fixture.invalid/api/keystatic/test', {
      method: 'POST', body: 'fixture body', headers: { 'x-fixture': 'preserved' },
    });

    expect(await route.GET(getRequest)).toBe(getResult);
    expect(await route.POST(postRequest)).toBe(postResult);
    expect(await route.GET(getRequest)).toBe(getResult);
    expect(fake.factory).toHaveBeenCalledExactlyOnceWith({ config: fake.config });
    expect(fake.factory.mock.calls[0][0].config).toBe(fake.config);
    expect(GET).toHaveBeenNthCalledWith(1, getRequest);
    expect(GET).toHaveBeenNthCalledWith(2, getRequest);
    expect(POST).toHaveBeenCalledExactlyOnceWith(postRequest);
    expect(await postRequest.text()).toBe('fixture body');
  });

  it('shares one pending initialization between simultaneous GET and POST', async () => {
    const pending = deferred<{ GET: ReturnType<typeof vi.fn>; POST: ReturnType<typeof vi.fn> }>();
    const started = deferred<void>();
    fake.factory.mockImplementation(() => { started.resolve(); return pending.promise; });
    const route = await import('./route');
    const request = new Request('https://fixture.invalid/api/keystatic/test');
    const first = route.GET(request);
    const second = route.POST(request);
    await started.promise;
    expect(fake.factory).toHaveBeenCalledTimes(1);
    const result = new Response('fixture');
    const GET = vi.fn().mockResolvedValue(result);
    const POST = vi.fn().mockResolvedValue(result);
    pending.resolve({ GET, POST });
    expect(await Promise.all([first, second])).toEqual([result, result]);
    expect(GET).toHaveBeenCalledExactlyOnceWith(request);
    expect(POST).toHaveBeenCalledExactlyOnceWith(request);
    expect(fake.factory).toHaveBeenCalledTimes(1);
  });

  it('propagates a shared rejected initialization and retries on a later request', async () => {
    const pending = deferred<never>();
    const started = deferred<void>();
    const failure = new Error('fixture initialization failure');
    const result = new Response('retry fixture');
    fake.factory.mockImplementationOnce(() => { started.resolve(); return pending.promise; })
      .mockReturnValue({ GET: vi.fn().mockResolvedValue(result), POST: vi.fn().mockResolvedValue(result) });
    const route = await import('./route');
    const request = new Request('https://fixture.invalid/api/keystatic/test');
    const first = expect(route.GET(request)).rejects.toBe(failure);
    const second = expect(route.POST(request)).rejects.toBe(failure);
    await started.promise;
    pending.reject(failure);
    await Promise.all([first, second]);
    expect(fake.factory).toHaveBeenCalledTimes(1);
    expect(await route.POST(request)).toBe(result);
    expect(fake.factory).toHaveBeenCalledTimes(2);
  });

  it('preserves synchronous production validation errors and retries without overrides', async () => {
    const failure = new Error('fixture missing production settings');
    const privateRead = vi.fn();
    const env = new Proxy({ NODE_ENV: 'production' }, {
      get(target, key) {
        if (typeof key === 'string' && key.startsWith('KEYSTATIC_')) return privateRead(key);
        return Reflect.get(target, key);
      },
    });
    vi.stubGlobal('process', new Proxy(process, {
      get(target, key) { return key === 'env' ? env : Reflect.get(target, key); },
    }));
    fake.factory.mockImplementation(({ config }) => {
      expect(config).toBe(fake.config);
      if (config.storage.kind === 'github' && process.env.NODE_ENV !== 'development' &&
          !process.env.KEYSTATIC_SECRET) throw failure;
      throw new Error('validation bypassed');
    });
    const route = await import('./route');
    expect(privateRead).not.toHaveBeenCalled();
    const request = new Request('https://fixture.invalid/api/keystatic/test');
    await expect(route.GET(request)).rejects.toBe(failure);
    await expect(route.POST(request)).rejects.toBe(failure);
    expect(fake.factory).toHaveBeenCalledTimes(2);
    for (const call of fake.factory.mock.calls) expect(call).toEqual([{ config: fake.config }]);
    expect(privateRead).toHaveBeenCalledTimes(2);
  });

  it('forwards request-handler rejection without discarding successful initialization', async () => {
    const failure = new Error('fixture request failure');
    const result = new Response('fixture');
    fake.factory.mockReturnValue({
      GET: vi.fn().mockRejectedValue(failure), POST: vi.fn().mockResolvedValue(result),
    });
    const route = await import('./route');
    const request = new Request('https://fixture.invalid/api/keystatic/test');
    await expect(route.GET(request)).rejects.toBe(failure);
    expect(await route.POST(request)).toBe(result);
    expect(fake.factory).toHaveBeenCalledTimes(1);
  });
});
