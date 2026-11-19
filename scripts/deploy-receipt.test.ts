import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { observeDeployment, reportDeployment, runFromEnvironment, summary } from './deploy-receipt.mjs';

const sha = '2d6377b347a464851e63afd35bb23cecae30ebba';
const old = '051acabf428fbf97143979602bed59c4116656ff';
const creator = { id: 68434857, login: 'railway-app[bot]' };
const environment = 'ai-market / production';
const deployment = { id: 7907199016, sha, creator, environment,
  url: 'https://attacker.test/deployment', statuses_url: 'https://attacker.test/statuses' };
const status = { id: 22607220487, state: 'success', creator, environment,
  url: 'https://attacker.test/status', target_url: 'https://attacker.test/app' };
const context = { sha, repository: 'aidotmarket/ai-market-frontend', actor: 'author', branch: 'main',
  runId: '42', serviceKey: 'svc:ai-market-frontend',
  commitMessage: 'quotes \' " ` $(touch /never)\nJSON_EOF\nJS\nUnicode: ☃' };
const appUrl = 'https://app.example.test';
const eventsUrl = 'https://events.example.test/';

function harness({ revisions = [sha] as unknown[], health = [200] as (number | Error)[], post = 201, transport = false,
  revisionDelay = 0 as number | number[], deployments = [deployment], statuses = [status], providerHttp = 200, deploymentId = deployment.id } = {}) {
  let clock = 0;
  let healthIndex = 0;
  let revisionIndex = 0;
  const last = (values: unknown[], index: number) => values[Math.min(index, values.length - 1)];
  const fetch = vi.fn(async (url: string, options: RequestInit) => {
    expect(options.redirect).toBe('manual');
    expect(options.signal).toBeInstanceOf(AbortSignal);
    if (options.method === 'POST') {
      expect(options.headers).not.toHaveProperty('Authorization');
      if (transport) throw new Error('private transport details');
      return { status: post };
    }
    expect(options.cache).toBe('no-store');
    if (url.startsWith('https://api.github.com/')) {
      expect(options.headers).toMatchObject({ Authorization: 'Bearer fake-job-token' });
      const root = `https://api.github.com/repos/${context.repository}/deployments`;
      if (url === `${root}?sha=${sha}&environment=ai-market%20%2F%20production&per_page=100`) {
        return { status: providerHttp, json: async () => deployments };
      }
      expect(url).toBe(`${root}/${deploymentId}/statuses?per_page=100`);
      return { status: providerHttp, json: async () => statuses };
    }
    expect(options.headers).toBeUndefined();
    if (url === `${appUrl}/`) {
      const status = last(health, healthIndex++);
      if (status instanceof Error) throw status;
      return { status };
    }
    expect(url).toBe(`${appUrl}/api/build-revision`);
    clock += Array.isArray(revisionDelay) ? last(revisionDelay, revisionIndex) as number : revisionDelay;
    const revision = last(revisions, revisionIndex++);
    if (revision instanceof Error) throw revision;
    return { status: revision === 'unavailable' ? 404 : 200, json: async () => {
      if (revision === 'bad-json') throw new SyntaxError('private body');
      return revision === 'absent' ? {} : { revision };
    } };
  });
  return { fetch, now: () => clock, sleep: async (ms: number) => { clock += ms; },
    initialWaitMs: 0, budgetMs: 180_000, appUrl, eventsUrl, key: 'fake-key', githubToken: 'fake-job-token', context };
}

const healthCases = [
  { name: '11 healthy old revisions then 503', health: [...Array(11).fill(200), 503],
    revisions: [old], state: 'pending', healthy: false },
  { name: '11 healthy old revisions then timeout', health: [...Array(11).fill(200), new Error('timeout')],
    revisions: [old], state: 'pending', healthy: false },
  { name: 'all 503', health: [503], revisions: [sha], state: 'unhealthy', healthy: false },
  { name: 'all health requests throw', health: [new Error('timeout')],
    revisions: [sha], state: 'unhealthy', healthy: false },
  { name: '11 failed health samples then healthy matching revision', health: [...Array(11).fill(503), 200],
    revisions: [sha], state: 'verified', healthy: true },
  { name: 'healthy old revision', health: [200], revisions: [old], state: 'pending', healthy: true },
  { name: 'healthy unknown revision', health: [200], revisions: [null], state: 'pending', healthy: true },
];

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); process.exitCode = 0; });

describe('workflow receipt decisions', () => {
  it.each([old, null, 'absent', 'bad-json', 'unavailable', 'bad-revision', `${sha}\n`, new Error('timeout')])
    ('keeps healthy unverified metadata pending with no event: %s', async revision => {
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

  it('accepts the positive-control Railway success shape with independent exact serving evidence', async () => {
    const h = harness({ deploymentId: 7887992277,
      deployments: [{ ...deployment, id: 7887992277 }],
      statuses: [{ ...status, id: 22537285867 }],
    });
    const result = await reportDeployment(h);
    expect(result.observation).toMatchObject({ state: 'verified',
      provider: { state: 'success', deploymentId: 7887992277, statusId: 22537285867 } });
    expect(result.submission).toEqual({ state: 'accepted', status: 201 });
  });

  it.each(['failure', 'error'])('maps Railway status %s to failure despite an older healthy serving build', async state => {
    const h = harness({ revisions: [old], statuses: [{ ...status, state }] });
    const result = await reportDeployment(h);
    expect(result.observation).toMatchObject({ state: 'provider-failed', healthy: true, revision: old,
      provider: { state: 'failure', deploymentId: 7907199016, statusId: 22607220487 } });
    const posts = h.fetch.mock.calls.filter(([, options]) => options.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(JSON.parse(posts[0][1].body as string)).toEqual({
      actor: 'system', event_type: 'alert', title: `DEPLOY FAILED: ${context.repository} @ ${sha}`,
      entity_key: context.serviceKey, source_ref: sha, dedupe_key: `deploy-fail-${sha}`,
      payload: { commit_sha: sha, pushed_by: context.actor, repository: context.repository,
        run_url: `https://github.com/${context.repository}/actions/runs/42`, health_verified: false },
    });
  });

  it.each([
    { statuses: [{ ...status, state: 'pending' }] },
    { statuses: [{ ...status, state: 'queued' }] },
    { statuses: [{ ...status, state: 'inactive' }] },
    { statuses: [{ ...status, state: 'unknown' }] },
    { statuses: [] },
    { providerHttp: 302 }, { providerHttp: 403 }, { providerHttp: 500 },
    { deployments: [{ ...deployment, sha: old }] },
    { deployments: [{ ...deployment, environment: 'staging' }] },
    { deployments: [{ ...deployment, creator: { ...creator, id: 1 } }] },
    { deployments: [{ ...deployment, creator: { ...creator, login: 'other' } }] },
    { statuses: [{ ...status, creator: { ...creator, id: 1 } }] },
    { statuses: [{ ...status, creator: { ...creator, login: 'other' } }] },
    { statuses: [{ ...status, environment: 'staging' }] },
    { statuses: [status, { ...status, id: status.id + 1, creator: { ...creator, id: 1 } }] },
    { deployments: Array(100).fill(deployment) },
    { statuses: Array(100).fill(status) },
  ])('never verifies stale, incomplete, pending or untrusted provider evidence: %j', async options => {
    const h = harness(options);
    const result = await reportDeployment(h);
    expect(result.observation.state).toBe('pending');
    expect(result.submission).toBeNull();
  });

  it('uses the latest attempt and status, ignoring returned URLs and older success', async () => {
    const h = harness({ deployments: [
      { ...deployment, id: 7887992277, url: 'https://attacker.test/' }, deployment,
    ], statuses: [
      { ...status, id: 22537285867, state: 'success' },
      { ...status, state: 'failure', url: 'https://attacker.test/' },
    ] });
    expect((await reportDeployment(h)).observation.state).toBe('provider-failed');
    expect(h.fetch.mock.calls.some(([url]) => url.includes('attacker'))).toBe(false);
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

  it.each(healthCases)('preserves original health failure semantics: $name', async scenario => {
    const h = harness(scenario);
    const result = await reportDeployment(h);
    expect(result.observation.state).toBe(scenario.state);
    expect(result.observation.healthy).toBe(scenario.healthy);
    expect(h.fetch.mock.calls.filter(([url]) => url === `${appUrl}/`)).toHaveLength(12);
    const posts = h.fetch.mock.calls.filter(([, options]) => options.method === 'POST');
    expect(posts).toHaveLength(scenario.state === 'pending' ? 0 : 1);
    if (scenario.state === 'pending') expect(result.submission).toBeNull();
    else expect(JSON.parse(posts[0][1].body as string).event_type)
      .toBe(scenario.state === 'verified' ? 'deploy' : 'alert');
    if (!scenario.healthy && scenario.state === 'pending') {
      expect(result.observation.revision).toBeNull();
      expect(summary(result)).toContain('Latest health: unhealthy/unavailable');
      expect(summary(result)).toContain('earlier HTTP 200 observed');
      expect(summary(result)).not.toContain('did not become healthy');
    }
  });

  it('never treats unknown expected metadata as a matching revision', async () => {
    const h = harness({ revisions: [null] });
    expect((await observeDeployment({ ...h, fetch: h.fetch as unknown as typeof globalThis.fetch, expected: '', repository: context.repository })).state).toBe('pending');
  });

  it('bounds the window and does not verify a revision arriving after the deadline', async () => {
    const h = harness({ revisionDelay: 180_001 });
    const result = await reportDeployment(h);
    expect(result.observation.state).toBe('pending');
    expect(result.submission).toBeNull();
    expect(h.fetch).toHaveBeenCalledTimes(2);
  });

  it.each([165_000, 165_001])('discards prior provider success when the next revision exhausts the budget (%s ms)', async delay => {
    const h = harness({ revisions: [old, sha], revisionDelay: [0, delay] });
    const result = await reportDeployment(h);
    expect(result.observation).toEqual({ state: 'pending', healthy: true, revision: sha,
      provider: { state: 'unknown' } });
    expect(result.submission).toBeNull();
    // First poll: old served revision plus trusted success. Second poll: exact
    // revision at/after the deadline, so no fresh provider sample is possible.
    expect(h.fetch.mock.calls.filter(([url]) => url.startsWith('https://api.github.com/'))).toHaveLength(2);
    expect(h.fetch.mock.calls.filter(([url]) => url === `${appUrl}/api/build-revision`)).toHaveLength(2);
    expect(h.fetch.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(0);
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

  it.each([...healthCases.map(scenario => ({ ...scenario, post: 201, transport: false })),
    { name: 'provider failure', state: 'provider-failed', health: [200], revisions: [old], healthy: true, post: 201, transport: false, statuses: [{ ...status, state: 'failure' }] },
    { name: 'provider error', state: 'provider-failed', health: [200], revisions: [old], healthy: true, post: 201, transport: false, statuses: [{ ...status, state: 'error' }] },
    { name: 'provider pending', state: 'pending', health: [200], revisions: [sha], healthy: true, post: 201, transport: false, statuses: [{ ...status, state: 'pending' }] },
    { name: 'HTTP refusal', state: 'refused', health: [200], revisions: [sha], healthy: true, post: 409, transport: false },
    { name: 'transport ambiguity', state: 'unknown', health: [200], revisions: [sha], healthy: true, post: 201, transport: true }])
    ('executes the actual workflow entry with fake transports and filesystem event data: $name', async scenario => {
      const { state } = scenario;
      const dir = await mkdtemp(join(process.env.KD_BRIDGE_JOB_SCRATCH ?? tmpdir(), 'r539-'));
      const eventPath = join(dir, 'event.json');
      const summaryPath = join(dir, 'summary.txt');
      await writeFile(eventPath, JSON.stringify({ head_commit: { message: context.commitMessage } }));
      const h = harness(scenario);
      vi.stubGlobal('fetch', h.fetch);
      vi.useFakeTimers();
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});
      try {
        const run = runFromEnvironment({ NODE_ENV: 'test', GITHUB_EVENT_PATH: eventPath, GITHUB_STEP_SUMMARY: summaryPath,
          GITHUB_SHA: sha, GITHUB_REPOSITORY: context.repository, GITHUB_ACTOR: context.actor,
          GITHUB_REF_NAME: 'main', GITHUB_RUN_ID: '42', APP_URL: appUrl, EVENTS_URL: eventsUrl,
          SERVICE_KEY: context.serviceKey, RECEIPT_KEY: 'fake-key', GITHUB_TOKEN: 'fake-job-token' });
        // readFile resolves on the real event loop, then timers drive all polling.
        await vi.waitFor(() => expect(vi.getTimerCount()).toBeGreaterThan(0));
        await vi.runAllTimersAsync();
        await run;
        expect(process.exitCode ?? 0).toBe(['unhealthy', 'pending', 'provider-failed'].includes(state) ? 1 : 0);
        const text = await readFile(summaryPath, 'utf8');
        expect(text).not.toContain('fake-key');
        expect(text).not.toContain('fake-job-token');
        expect(text).not.toContain(context.commitMessage);
        expect(text).toContain(state === 'refused' ? 'refused (HTTP 409)' : state === 'unknown' ? 'unknown (transport uncertainty)' : state === 'pending' ? 'No deploy receipt submitted' : state === 'verified' ? 'accepted (HTTP 201)' : state === 'provider-failed' ? 'Railway production deployment failed' : 'did not become healthy');
        const posts = h.fetch.mock.calls.filter(([, options]) => options.method === 'POST');
        expect(posts).toHaveLength(state === 'pending' ? 0 : 1);
        if (posts.length) expect(JSON.parse(posts[0][1].body as string).event_type)
          .toBe(['unhealthy', 'provider-failed'].includes(state) ? 'alert' : 'deploy');
        if (state === 'pending' && !scenario.healthy) {
          expect(text).toContain('Latest health: unhealthy/unavailable');
          expect(text).toContain('earlier HTTP 200 observed');
          expect(text).not.toContain('did not become healthy');
        }
      } finally {
        vi.useRealTimers(); log.mockRestore(); await rm(dir, { recursive: true });
      }
    });
});
