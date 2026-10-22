import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { observeDeployment, reportDeployment, runFromEnvironment, summary } from './deploy-receipt.mjs';

const sha = 'a'.repeat(40);
const old = 'b'.repeat(40);
const context = { sha, repository: 'aidotmarket/ai-market-frontend', actor: 'author', branch: 'main',
  runId: '42', serviceKey: 'svc:ai-market-frontend',
  commitMessage: 'quotes \' " ` $(touch /never)\nJSON_EOF\nJS\nUnicode: ☃' };
const appUrl = 'https://app.example.test';
const eventsUrl = 'https://events.example.test/';

function harness({ revisions = [sha] as unknown[], health = [200], post = 201, transport = false,
  revisionDelay = 0 } = {}) {
  let clock = 0;
  let healthIndex = 0;
  let revisionIndex = 0;
  const last = (values: unknown[], index: number) => values[Math.min(index, values.length - 1)];
  const fetch = vi.fn(async (url: string, options: RequestInit) => {
    expect(options.redirect).toBe('manual');
    expect(options.signal).toBeInstanceOf(AbortSignal);
    if (options.method === 'POST') {
      if (transport) throw new Error('private transport details');
      return { status: post };
    }
    expect(options.cache).toBe('no-store');
    if (url === `${appUrl}/`) return { status: last(health, healthIndex++) };
    expect(url).toBe(`${appUrl}/api/build-revision`);
    clock += revisionDelay;
    const revision = last(revisions, revisionIndex++);
    if (revision instanceof Error) throw revision;
    return { status: revision === 'unavailable' ? 404 : 200, json: async () => {
      if (revision === 'bad-json') throw new SyntaxError('private body');
      return revision === 'absent' ? {} : { revision };
    } };
  });
  return { fetch, now: () => clock, sleep: async (ms: number) => { clock += ms; },
    initialWaitMs: 0, budgetMs: 180_000, appUrl, eventsUrl, key: 'fake-key', context };
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); process.exitCode = 0; });

describe('workflow receipt decisions', () => {
  it.each([old, null, 'absent', 'bad-json', 'unavailable', 'bad-revision', `${sha}\n`, new Error('timeout')])
    ('keeps healthy unverified metadata nonblocking with no event: %s', async revision => {
      const h = harness({ revisions: [revision] });
      const result = await reportDeployment(h);
      expect(result.observation.state).toBe('pending');
      expect(result.observation.healthy).toBe(true);
      expect(result.submission).toBeNull();
      expect(h.fetch.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(0);
    });

  it('waits through old revisions and emits exactly one existing deploy payload on match plus health', async () => {
    const h = harness({ revisions: [old, old, sha] });
    const result = await reportDeployment(h);
    expect(result.observation.state).toBe('verified');
    expect(result.submission).toEqual({ state: 'accepted', status: 201 });
    const posts = h.fetch.mock.calls.filter(([, options]) => options.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0][0]).toBe(eventsUrl);
    expect(JSON.parse(posts[0][1].body as string)).toEqual({
      actor: 'system', event_type: 'deploy', title: `Deploy receipt: ${context.repository} @ ${sha}`,
      entity_key: context.serviceKey, source_ref: sha, dedupe_key: `deploy-receipt-${sha}`,
      payload: { commit_sha: sha, commit_message: context.commitMessage, pushed_by: context.actor,
        repository: context.repository, branch: 'main', run_id: '42',
        run_url: `https://github.com/${context.repository}/actions/runs/42`, health_verified: true },
    });
    expect(summary(result)).not.toContain(context.commitMessage);
    expect(summary(result)).not.toContain('fake-key');
  });

  it('retains unhealthy alert semantics without a deploy event', async () => {
    const h = harness({ health: [503] });
    const result = await reportDeployment(h);
    expect(result.observation.state).toBe('unhealthy');
    expect(h.fetch.mock.calls.filter(([url]) => url.includes('build-revision'))).toHaveLength(0);
    const posts = h.fetch.mock.calls.filter(([, options]) => options.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(JSON.parse(posts[0][1].body as string)).toMatchObject({
      event_type: 'alert', dedupe_key: `deploy-fail-${sha}`, payload: { health_verified: false },
    });
  });

  it('uses latest health rather than a previous healthy observation', async () => {
    const h = harness({ health: [200, 503], revisions: [old] });
    expect((await reportDeployment(h)).observation.state).toBe('unhealthy');
  });

  it('never treats unknown expected metadata as a matching revision', async () => {
    const h = harness({ revisions: [null] });
    expect((await observeDeployment({ ...h, fetch: h.fetch as unknown as typeof globalThis.fetch, expected: '' })).state).toBe('pending');
  });

  it('bounds the window and does not verify a revision arriving after the deadline', async () => {
    const h = harness({ revisionDelay: 180_001 });
    const result = await reportDeployment(h);
    expect(result.observation.state).toBe('pending');
    expect(result.submission).toBeNull();
    expect(h.fetch).toHaveBeenCalledTimes(2);
  });

  it('aborts slow revision bodies within the remaining budget and remains pending', async () => {
    vi.useFakeTimers();
    const deadlines: number[] = [];
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
      deadlines.push(ms);
      const controller = new AbortController();
      setTimeout(() => controller.abort(), ms);
      return controller.signal;
    });
    const fetch = vi.fn(async (url: string, options: RequestInit) => {
      if (url === `${appUrl}/`) return { status: 200 };
      expect(url).toBe(`${appUrl}/api/build-revision`);
      return { status: 200, json: () => new Promise((_, reject) => {
        options.signal!.addEventListener('abort', () => reject(new Error('timeout')), { once: true });
      }) };
    });
    const run = reportDeployment({ context, appUrl, eventsUrl, key: 'fake-key', fetch,
      initialWaitMs: 0, budgetMs: 26_000 });
    await vi.runAllTimersAsync();
    const result = await run;
    expect(result.observation.state).toBe('pending');
    expect(result.submission).toBeNull();
    expect(deadlines).toEqual([10_000, 10_000, 1_000, 1_000]);
  });

  it.each([302, 400, 401, 409, 500, 503])('reports HTTP %s refusal without a retry or failure alert', async post => {
    const h = harness({ post });
    const result = await reportDeployment(h);
    expect(result.submission).toEqual({ state: 'refused', status: post });
    expect(h.fetch.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1);
    expect(summary(result)).toContain(`refused (HTTP ${post})`);
  });

  it('reports transport uncertainty without a retry or acceptance claim', async () => {
    const h = harness({ transport: true });
    const result = await reportDeployment(h);
    expect(result.submission).toEqual({ state: 'unknown', status: null });
    expect(h.fetch.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1);
    expect(summary(result)).not.toContain('private transport');
    expect(summary(result)).not.toContain('accepted');
  });

  it.each(['pending', 'verified', 'refused', 'unhealthy'])
    ('executes the actual workflow entry with fake transports and filesystem event data: %s', async state => {
      const dir = await mkdtemp(join(tmpdir(), 'r539-'));
      const eventPath = join(dir, 'event.json');
      const summaryPath = join(dir, 'summary.txt');
      await writeFile(eventPath, JSON.stringify({ head_commit: { message: context.commitMessage } }));
      const h = harness({ revisions: [state === 'pending' ? old : sha], health: [state === 'unhealthy' ? 503 : 200],
        post: state === 'refused' ? 409 : 201 });
      vi.stubGlobal('fetch', h.fetch);
      vi.useFakeTimers();
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});
      try {
        const run = runFromEnvironment({ NODE_ENV: 'test', GITHUB_EVENT_PATH: eventPath, GITHUB_STEP_SUMMARY: summaryPath,
          GITHUB_SHA: sha, GITHUB_REPOSITORY: context.repository, GITHUB_ACTOR: context.actor,
          GITHUB_REF_NAME: 'main', GITHUB_RUN_ID: '42', APP_URL: appUrl, EVENTS_URL: eventsUrl,
          SERVICE_KEY: context.serviceKey, RECEIPT_KEY: 'fake-key' });
        // readFile resolves on the real event loop, then timers drive all polling.
        await vi.waitFor(() => expect(vi.getTimerCount()).toBeGreaterThan(0));
        await vi.runAllTimersAsync();
        await run;
        expect(process.exitCode ?? 0).toBe(state === 'unhealthy' ? 1 : 0);
        const text = await readFile(summaryPath, 'utf8');
        expect(text).not.toContain('fake-key');
        expect(text).not.toContain(context.commitMessage);
        expect(text).toContain(state === 'refused' ? 'refused (HTTP 409)' : state === 'pending' ? 'No deploy receipt submitted' : state === 'verified' ? 'accepted (HTTP 201)' : 'did not become healthy');
      } finally {
        vi.useRealTimers(); log.mockRestore(); await rm(dir, { recursive: true });
      }
    });
});
