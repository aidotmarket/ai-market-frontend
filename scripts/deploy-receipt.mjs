import { readFile, appendFile } from 'node:fs/promises';

const validRevision = value => typeof value === 'string' && value.length === 40 && /^[0-9a-f]{40}$/i.test(value);

// Headers and body share a deadline. Never redirect an authenticated POST.
async function request(fetch, url, options, timeoutMs, consume) {
  const response = await fetch(url, {
    ...options, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs),
  });
  return consume(response);
}

const productionEnvironment = 'ai-market / production';
const railwayCreator = creator => creator?.id === 68434857 && creator?.login === 'railway-app[bot]';
const validId = id => Number.isSafeInteger(id) && id > 0;

// Only constructed GitHub REST routes receive the job token. Ignore returned URLs
// (including pagination links) and reject redirects. Incomplete lists stay unknown.
export async function observeRailway({ fetch, repository, expected, githubToken, deadline, now }) {
  if (!validRevision(expected) || !/^[\w.-]+\/[\w.-]+$/.test(repository ?? '') || !githubToken) {
    return { state: 'unknown' };
  }
  const root = `https://api.github.com/repos/${repository}/deployments`;
  const get = path => request(fetch, path, {
    cache: 'no-store', headers: { Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${githubToken}`, 'X-GitHub-Api-Version': '2022-11-28' },
  }, Math.max(1, Math.min(10_000, deadline - now())), async response => {
    if (response.status !== 200) throw new Error('GitHub evidence unavailable');
    const rows = await response.json();
    if (!Array.isArray(rows) || rows.length >= 100) throw new Error('Incomplete GitHub evidence');
    return rows;
  });
  try {
    const deployments = await get(`${root}?sha=${expected.toLowerCase()}&environment=${encodeURIComponent(productionEnvironment)}&per_page=100`);
    const deployment = deployments.filter(row => validId(row.id) &&
      row.sha?.toLowerCase() === expected.toLowerCase() && row.environment === productionEnvironment &&
      railwayCreator(row.creator)).sort((a, b) => b.id - a.id)[0];
    if (!deployment || now() >= deadline) return { state: 'unknown' };
    const statuses = await get(`${root}/${deployment.id}/statuses?per_page=100`);
    // An untrusted latest status cannot authorize success or hide behind an older one.
    const status = statuses.filter(row => validId(row.id)).sort((a, b) => b.id - a.id)[0];
    if (!status || !railwayCreator(status.creator) || status.environment !== productionEnvironment) {
      return { state: 'unknown', deploymentId: deployment.id };
    }
    const state = status.state === 'success' ? 'success'
      : ['failure', 'error'].includes(status.state) ? 'failure' : 'pending';
    return { state, deploymentId: deployment.id, statusId: status.id };
  } catch { return { state: 'unknown' }; }
}

export async function observeDeployment({
  fetch = globalThis.fetch, now = Date.now,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  appUrl, expected, repository, githubToken, initialWaitMs = 120_000, budgetMs = 180_000, intervalMs = 15_000,
}) {
  await sleep(initialWaitMs);
  const deadline = now() + budgetMs;
  let healthy = false;
  let everHealthy = false;
  let revision = null;
  let attempts = 0;
  let provider = { state: 'unknown' };
  while (now() < deadline && attempts++ < 12) {
    // Only the latest health and revision pair can authorize a receipt.
    healthy = false;
    revision = null;
    try {
      healthy = await request(fetch, `${appUrl}/`, { cache: 'no-store' },
        Math.max(1, Math.min(10_000, deadline - now())), response => response.status === 200);
    } catch { /* unavailable health is not evidence of HTTP 200 */ }
    everHealthy ||= healthy;
    if (healthy && now() < deadline) {
      try {
        revision = await request(fetch, `${appUrl}/api/build-revision`, { cache: 'no-store' },
          Math.max(1, Math.min(10_000, deadline - now())), async response => {
            if (response.status !== 200) return null;
            const body = await response.json();
            return validRevision(body?.revision) ? body.revision.toLowerCase() : null;
          });
      } catch { /* missing/slow metadata is pending, never an unhealthy deploy */ }
    }
    if (now() < deadline) provider = await observeRailway({
      fetch, repository, expected, githubToken, deadline, now,
    });
    if (now() <= deadline && provider.state === 'failure') {
      return { state: 'provider-failed', healthy, revision, provider };
    }
    if (now() <= deadline && provider.state === 'success' && healthy &&
        validRevision(expected) && revision === expected.toLowerCase()) {
      return { state: 'verified', healthy, revision, provider };
    }
    if (attempts < 12 && now() < deadline) await sleep(Math.min(intervalMs, deadline - now()));
  }
  return { state: everHealthy ? 'pending' : 'unhealthy', healthy, revision, provider };
}

export function receiptPayload(context, healthy) {
  const { sha, repository, actor, branch, runId, serviceKey, commitMessage } = context;
  const runUrl = `https://github.com/${repository}/actions/runs/${runId}`;
  return {
    actor: 'system', event_type: healthy ? 'deploy' : 'alert',
    title: `${healthy ? 'Deploy receipt' : 'DEPLOY FAILED'}: ${repository} @ ${sha}`,
    entity_key: serviceKey, source_ref: sha,
    dedupe_key: `${healthy ? 'deploy-receipt' : 'deploy-fail'}-${sha}`,
    payload: {
      commit_sha: sha,
      ...(healthy ? { commit_message: commitMessage, branch, run_id: runId } : {}),
      pushed_by: actor, repository, run_url: runUrl, health_verified: healthy,
    },
  };
}

export async function submitReceipt({ fetch = globalThis.fetch, eventsUrl, key, payload }) {
  try {
    const status = await request(fetch, eventsUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Internal-API-Key': key },
      body: JSON.stringify(payload),
    }, 10_000, response => response.status);
    // HTTP acceptance only: no claim about a durable row or downstream use.
    return { state: status >= 200 && status < 300 ? 'accepted' : 'refused', status };
  } catch {
    // A timed-out POST may have reached the server. Never resend blindly.
    return { state: 'unknown', status: null };
  }
}

export async function reportDeployment({ context, appUrl, eventsUrl, key, ...dependencies }) {
  const observation = await observeDeployment({ ...dependencies, appUrl, expected: context.sha, repository: context.repository });
  const submission = ['verified', 'provider-failed', 'unhealthy'].includes(observation.state) ? await submitReceipt({
    fetch: dependencies.fetch, eventsUrl, key,
    payload: receiptPayload(context, observation.state === 'verified'),
  }) : null;
  return { observation, submission, expected: context.sha };
}

export function summary({ observation, submission, expected }) {
  const health = observation.healthy ? 'HTTP 200' : 'unhealthy/unavailable';
  const revision = observation.revision ?? 'unknown';
  const result = observation.state === 'verified'
    ? 'Deployment verified: Railway success and expected revision observed with health.'
    : observation.state === 'provider-failed'
      ? 'Railway production deployment failed.'
      : observation.state === 'unhealthy'
        ? 'App did not become healthy within the observation window.'
        : `Pending: ${observation.healthy ? 'health-only' : 'earlier HTTP 200 observed; latest health unhealthy/unavailable'}; provider or expected revision unverified. No deploy receipt submitted.`;
  const provider = observation.provider ?? { state: 'unknown' };
  const receipt = submission
    ? `Event submission: ${submission.state}${submission.status === null ? ' (transport uncertainty)' : ` (HTTP ${submission.status})`}. HTTP acceptance does not establish durable storage.`
    : '';
  return `Expected revision: ${validRevision(expected) ? expected.toLowerCase() : 'unknown'}. Latest health: ${health}. Observed revision: ${revision}.\n${result}\nRailway: ${provider.state}; deployment ${provider.deploymentId ?? 'unknown'}; status ${provider.statusId ?? 'unknown'}.\n${receipt}\n`;
}

export async function runFromEnvironment(env = process.env) {
  const event = JSON.parse(await readFile(env.GITHUB_EVENT_PATH, 'utf8'));
  const result = await reportDeployment({
    context: {
      sha: env.GITHUB_SHA, repository: env.GITHUB_REPOSITORY, actor: env.GITHUB_ACTOR,
      branch: env.GITHUB_REF_NAME, runId: env.GITHUB_RUN_ID, serviceKey: env.SERVICE_KEY,
      commitMessage: event.head_commit?.message ?? '',
    },
    githubToken: env.GITHUB_TOKEN, appUrl: env.APP_URL, eventsUrl: env.EVENTS_URL, key: env.RECEIPT_KEY,
  });
  const text = summary(result);
  console.log(text);
  if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, text);
  // Provider/revision uncertainty is non-success; receipt uncertainty stays separate.
  if (result.observation.state !== 'verified') process.exitCode = 1;
}
