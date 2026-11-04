// No SDK/auth/application imports. This process owns the hard native-call bound.
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { lstatSync, realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BOOT, NODE, NPM, DOTENV, LIMIT, need, Failure, validate, protectedRead,
  protectedPath, decode, exact, metadataValue, snapshot } from './contract.mjs';

export const FRONTEND_METADATA = Object.freeze(['KEYSTATIC_GITHUB_CLIENT_ID', 'PORT', 'NODE_ENV',
  'API_URL', 'NEXT_PUBLIC_API_URL', 'NEXT_PUBLIC_SITE_URL', 'NEXT_PUBLIC_KEYSTATIC_GITHUB_APP_SLUG',
  'NEXT_PUBLIC_ORG_SSO_WEB_RETURN_ENABLED', 'NEXT_PUBLIC_AIM_DATA_OAUTH_ENABLED',
  'NEXT_PUBLIC_CHECKOUT_DOMAIN_SERVICE_ENABLED', 'NEXT_PUBLIC_TERMS_GATE_ENFORCE',
  'NEXT_PUBLIC_ENABLE_REQUEST_JSONLD', 'NEXT_PUBLIC_ENABLE_DATASET_JSONLD',
  'FRONTEND_BUILD_REVISION', 'RAILWAY_GIT_COMMIT_SHA']);
const signals = ['SIGTERM', 'SIGINT', 'SIGHUP'];
export class Cancelled extends Error { constructor(signal) { super('c07'); this.signal = signal; } }

export function qualifyFrontend(d, env) {
  need(d.app === 'ai-market-frontend' && d.environment === 'production' &&
    d.argv.length === 2 && d.argv[0] === NPM && d.argv[1] === 'start');
  need(d.path.join(':') === '/mise/installs/node/24.22.1/bin:/usr/bin:/bin');
  need(d.metadata.every(n => FRONTEND_METADATA.includes(n)) && d.metadata.includes('KEYSTATIC_GITHUB_CLIENT_ID') && d.metadata.includes('PORT') && d.metadata.includes('NODE_ENV'));
  for (const n of ['KEYSTATIC_GITHUB_CLIENT_ID', 'PORT', 'NODE_ENV']) need(Object.hasOwn(env, n) && metadataValue(n, env[n]) && env[n].length > 0, 'handoff');
  need(env.NODE_ENV === 'production', 'handoff');
}
export function qualifyRuntime() {
  need(process.platform === 'linux' && process.versions.node === '24.22.1' && process.execPath === NODE && typeof process.execve === 'function' && process.cwd() === '/app', 'handoff');
  for (const p of [NODE, NPM, '/usr/bin/env']) protectedPath(p, { executable: true });
  protectedPath('/app', { directory: true });
  // /bin and /bin/sh are normal distro symlinks; do not reject them as if they
  // were executable artifacts. Qualify their known real targets separately.
  protectedPath('/usr/bin', { directory: true });
  protectedPath('/usr/bin/dash', { executable: true });
  need(realpathSync('/bin') === '/usr/bin' && realpathSync('/bin/sh') === '/usr/bin/dash' && lstatSync('/bin/sh').uid === 0, 'handoff');
  assertNoDotenv('/app');
}
export function assertNoDotenv(root) {
  for (const n of DOTENV) {
    try { lstatSync(`${root}/${n}`); throw new Failure('handoff'); }
    catch (e) { if (e.code !== 'ENOENT') throw new Failure('handoff'); }
  }
}

// Test ports are programmatic only. CLI always uses fixed worker and executable.
export async function supervise(d, input, { executable = NODE,
  worker = fileURLToPath(new URL('./worker.mjs', import.meta.url)),
  onSpawn = () => {}, diagnostic = () => {}, signalSource = process,
  deadline = performance.now() + d.budget_seconds * 1000 } = {}) {
  let child, timer, cancelled, fault, closed = false;
  const listeners = new Map();
  const kill = () => { if (child && !closed) child.kill('SIGKILL'); };
  const fail = e => { fault ??= e; kill(); };
  for (const s of signals) {
    const fn = () => { cancelled ??= s; fail(new Cancelled(s)); };
    listeners.set(s, fn); signalSource.on(s, fn);
  }
  const chunks = []; let size = 0;
  try {
    timer = setTimeout(() => fail(new Failure('deadline')), Math.max(1, deadline - performance.now()));
    child = spawn(executable, [worker], { env: { PATH: d.path.join(':') },
      cwd: process.cwd(), stdio: ['pipe', 'ignore', 'ignore', 'pipe'], shell: false });
    // Create close/error handlers before any test callback or cancellation.
    const completion = new Promise(resolve => {
      child.once('error', () => fail(new Failure('transport')));
      child.stdio[3].on('error', () => fail(new Failure('transport')));
      child.stdin.on('error', () => fail(new Failure('transport')));
      child.stdio[3].on('data', chunk => {
        size += chunk.length;
        if (size > LIMIT.ipc) fail(new Failure('handoff'));
        else if (!fault) chunks.push(chunk);
      });
      child.once('close', (code, signal) => { closed = true; resolve({ code, signal }); });
    });
    onSpawn(child);
    if (fault) kill();
    const raw = Buffer.from(JSON.stringify(input)); need(raw.length <= LIMIT.ipc, 'handoff');
    if (!fault) child.stdin.end(raw);
    const { code, signal } = await completion;
    if (cancelled) throw new Cancelled(cancelled);
    if (fault) throw fault;
    need(code === 0 && signal === null, 'transport');
    need(performance.now() < deadline, 'deadline');
    const message = decode(Buffer.concat(chunks), LIMIT.ipc, 'handoff');
    need(Array.isArray(message.diagnostics) && message.diagnostics.length <= (d.required.length + 1) * d.max_attempts, 'transport');
    for (const r of message.diagnostics) {
      exact(r, ['stage', 'attempt', 'elapsed_ms'], 'transport');
      need(['identity', 'fetch'].includes(r.stage) && Number.isInteger(r.attempt) && r.attempt >= 1 && r.attempt <= d.max_attempts && Number.isInteger(r.elapsed_ms) && r.elapsed_ms >= 0 && r.elapsed_ms <= d.budget_seconds * 1000, 'transport'); diagnostic(r);
    }
    if (Object.hasOwn(message, 'failure')) { exact(message, ['failure', 'diagnostics'], 'transport'); throw new Failure(message.failure); }
    exact(message, ['environment', 'diagnostics'], 'handoff');
    const meta = input.metadata, result = message.environment;
    exact(result, ['PATH', ...d.required, ...Object.keys(meta)], 'handoff');
    need(result.PATH === d.path.join(':'), 'handoff');
    for (const [n, v] of Object.entries(meta)) need(result[n] === v, 'handoff');
    const vals = Object.fromEntries(d.required.map(n => [n, result[n]]));
    const env = snapshot(d, vals, meta, input.credentials);
    need(performance.now() < deadline, 'deadline'); return env;
  } finally {
    clearTimeout(timer);
    // Unexpected synchronous failures after spawn must also terminate and reap.
    if (child && !closed) {
      const reaped = new Promise(resolve => child.once('close', resolve)); kill(); await reaped;
    }
    child?.stdin.destroy(); child?.stdio[3].destroy();
    for (const [s, fn] of listeners) signalSource.removeListener(s, fn);
  }
}
export async function run(document, env, { runtime = qualifyRuntime, fetch = supervise,
  execute = (file, args, childEnv) => process.execve(file, args, childEnv) } = {}) {
  const d = validate(document); // All assignment validation precedes bootstrap.
  const deadline = performance.now() + d.budget_seconds * 1000;
  qualifyFrontend(d, env); runtime();
  const metadata = Object.fromEntries(d.metadata.filter(n => Object.hasOwn(env, n)).map(n => [n, env[n]]));
  for (const [n, v] of Object.entries(metadata)) need(metadataValue(n, v), 'handoff');
  const c = Object.fromEntries(BOOT.filter(n => Object.hasOwn(env, n)).map(n => [n, env[n]]));
  need(performance.now() < deadline, 'deadline');
  const child = await fetch(d, { document: d, credentials: c, metadata }, { deadline, diagnostic: r => {
    process.stderr.write(`c07 stage=${r.stage} category=retry attempt=${r.attempt} elapsed_ms=${r.elapsed_ms}\n`);
  } });
  runtime(); // Recheck fixed dotenv names and protected launch files at handoff.
  need(performance.now() < deadline, 'deadline');
  try { execute(NPM, ['npm', 'start'], child); } catch { throw new Failure('handoff'); }
  throw new Failure('handoff');
}
export async function main() {
  try {
    need(process.argv.length === 3);
    protectedPath(fileURLToPath(new URL('.', import.meta.url)), { directory: true });
    for (const name of ['loader.mjs', 'contract.mjs', 'worker.mjs', 'transport.mjs', 'start']) protectedPath(fileURLToPath(new URL(name, import.meta.url)));
    await run(protectedRead(process.argv[2]), process.env);
  } catch (e) {
    if (e instanceof Cancelled) {
      process.kill(process.pid, e.signal); return;
    }
    process.stderr.write(`c07 stage=${e instanceof Failure ? e.stage : 'transport'} category=failed\n`);
    process.exitCode = 78;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
