import { readFile, appendFile } from 'node:fs/promises';

const validRevision = value => typeof value === 'string' && value.length === 40 && /^[0-9a-f]{40}$/i.test(value);

// Headers and body share a deadline. Never redirect an authenticated POST.
async function request(fetch, url, options, timeoutMs, consume) {
  const response = await fetch(url, {
    ...options, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs),
  });
  return consume(response);
}

export async function observeDeployment({
  fetch = globalThis.fetch, now = Date.now,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  appUrl, expected, initialWaitMs = 120_000, budgetMs = 180_000, intervalMs = 15_000,
}) {
  await sleep(initialWaitMs);
  const deadline = now() + budgetMs;
  let healthy = false;
  let revision = null;
  let attempts = 0;
  while (now() < deadline && attempts++ < 12) {
    // Only the latest health and revision pair can authorize a receipt.
    healthy = false;
    revision = null;
    try {
      healthy = await request(fetch, `${appUrl}/`, { cache: 'no-store' },
        Math.max(1, Math.min(10_000, deadline - now())), response => response.status === 200);
    } catch { /* unavailable health retains existing unhealthy semantics */ }
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
    if (now() <= deadline && healthy && validRevision(expected) && revision === expected.toLowerCase()) {
      return { state: 'verified', healthy, revision };
    }
    if (attempts < 12 && now() < deadline) await sleep(Math.min(intervalMs, deadline - now()));
  }
  return { state: healthy ? 'pending' : 'unhealthy', healthy, revision };
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
  const observation = await observeDeployment({ ...dependencies, appUrl, expected: context.sha });
  const submission = observation.state === 'pending' ? null : await submitReceipt({
    fetch: dependencies.fetch, eventsUrl, key,
    payload: receiptPayload(context, observation.state === 'verified'),
  });
  return { observation, submission, expected: context.sha };
}

export function summary({ observation, submission, expected }) {
  const health = observation.healthy ? 'HTTP 200' : 'unhealthy/unavailable';
  const revision = observation.revision ?? 'unknown';
  const result = observation.state === 'verified'
    ? 'Expected revision observed with health.'
    : observation.state === 'pending'
      ? 'Pending: health-only; expected revision unverified. No deploy receipt submitted.'
      : 'App did not become healthy within the observation window.';
  const receipt = submission
    ? `Event submission: ${submission.state}${submission.status === null ? ' (transport uncertainty)' : ` (HTTP ${submission.status})`}. HTTP acceptance does not establish durable storage.`
    : '';
  return `Expected revision: ${validRevision(expected) ? expected.toLowerCase() : 'unknown'}. Health: ${health}. Observed revision: ${revision}.\n${result}\n${receipt}\n`;
}

export async function runFromEnvironment(env = process.env) {
  const event = JSON.parse(await readFile(env.GITHUB_EVENT_PATH, 'utf8'));
  const result = await reportDeployment({
    context: {
      sha: env.GITHUB_SHA, repository: env.GITHUB_REPOSITORY, actor: env.GITHUB_ACTOR,
      branch: env.GITHUB_REF_NAME, runId: env.GITHUB_RUN_ID, serviceKey: env.SERVICE_KEY,
      commitMessage: event.head_commit?.message ?? '',
    },
    appUrl: env.APP_URL, eventsUrl: env.EVENTS_URL, key: env.RECEIPT_KEY,
  });
  const text = summary(result);
  console.log(text);
  if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, text);
  // Metadata and submission uncertainty add no failure/release gate.
  if (result.observation.state === 'unhealthy') process.exitCode = 1;
}
