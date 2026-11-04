import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync, chmodSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { EventEmitter } from 'node:events';
import { spawn, spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { performance } from 'node:perf_hooks';
import { validate, decode, BOOT, LIMIT, HOOKS, need, Failure, credentials, snapshot, rawParameters, protectedRead, appName, metadataName, NPM } from '../contract.mjs';
import { send, Transient, guardedHandler, boundedBody } from '../transport.mjs';
import { prepare } from '../worker.mjs';
import { supervise, run, Cancelled, qualifyFrontend, assertNoDotenv } from '../loader.mjs';

const base = JSON.parse(readFileSync(new URL('../assignment.prospective.json', import.meta.url)));
const doc = () => structuredClone(base);
const boot = () => ({ [BOOT[0]]: 'AKIA' + 'A'.repeat(16), [BOOT[1]]: 'B'.repeat(40) });
const meta = () => ({ KEYSTATIC_GITHUB_CLIENT_ID: 'synthetic-public-id', PORT: '3000', NODE_ENV: 'production' });
const input = d => ({ document: d, credentials: boot(), metadata: meta() });
const parameter = (d, n) => ({ Name: d.assignments[n].name, ARN: `arn:aws:ssm:eu-north-1:${d.account}:parameter${d.assignments[n].name}`, Version: 1, Selector: ':1', Type: 'SecureString', DataType: 'text', Value: 'synthetic-' + n, LastModifiedDate: 1700000000 });
const envelope = (d, n) => ({ Parameters: [parameter(d, n)], InvalidParameters: [] });
const failure = stage => e => e instanceof Failure && (!stage || e.stage === stage);

test('prospective exact generation, plural selectors, required metadata and modes', () => {
  const d = validate(doc()); qualifyFrontend(d, meta());
  assert.deepEqual(d.required, ['AI_CRAWL_BEACON_KEY', 'KEYSTATIC_GITHUB_CLIENT_SECRET', 'KEYSTATIC_SECRET']);
  assert.equal(d.max_attempts, 1); assert.equal(d.budget_seconds, 10);
  assert.throws(() => qualifyFrontend(d, { ...meta(), KEYSTATIC_GITHUB_CLIENT_ID: '' }), failure('handoff'));
  const role = doc(); role.principal_mode = 'assumed-role'; role.credential_mode = 'session'; role.role_arn = 'arn:aws:iam::948749907373:role/c07-ai-market-frontend-production'; role.principal_arn = 'arn:aws:sts::948749907373:assumed-role/c07-ai-market-frontend-production/session01';
  validate(role); credentials(role, { ...boot(), [BOOT[0]]: 'ASIA' + 'A'.repeat(16), [BOOT[2]]: 'T'.repeat(16) });
  assert.throws(() => credentials(d, { ...boot(), [BOOT[2]]: '' }), failure('bootstrap'));
});

const mutations = {
  schema: d => d.schema = 'c07-standard-v1', unknown: d => d.extra = 1,
  namespace: d => d.namespace = '/other/', endpoint: d => d.endpoint = 'http://ssm.eu-north-1.amazonaws.com',
  account: d => d.account = 948749907373, region: d => d.region = 'made-up', principal: d => d.principal_arn += '/other',
  origin: d => d.origins.push(d.origins[0]), requiredDuplicate: d => d.required.push(d.required[0]),
  assignmentMissing: d => delete d.assignments.KEYSTATIC_SECRET, purpose: d => d.assignments.KEYSTATIC_SECRET.purpose = 'bootstrap',
  phase: d => d.assignments.KEYSTATIC_SECRET.phase = 'build', versionBool: d => d.assignments.KEYSTATIC_SECRET.version = true,
  versionString: d => d.assignments.KEYSTATIC_SECRET.version = '1', versionLabel: d => d.assignments.KEYSTATIC_SECRET.version = 'latest',
  versionOverflow: d => d.assignments.KEYSTATIC_SECRET.version = 2147483648, tier: d => d.assignments.KEYSTATIC_SECRET.tier = 'Advanced',
  selectorName: d => d.assignments.KEYSTATIC_SECRET.name += ':1', budget: d => d.budget_seconds = 301,
  connect: d => d.connect_seconds = 4, read: d => d.read_seconds = 6, budgetOverlap: d => d.budget_seconds = 3,
  attempts: d => d.max_attempts = 4, fractionalAttempt: d => d.max_attempts = 1.5,
  metadataCount: d => d.metadata = Array.from({ length: 65 }, (_, i) => 'META_' + i),
  metadataDuplicate: d => d.metadata.push(d.metadata[0]), metadataSecret: d => d.metadata.push('KEYSTATIC_SECRET'),
  argvCount: d => d.argv = Array(65).fill('/x'), argvControl: d => d.argv.push('a\nb'),
  argvRef: d => d.argv.push('${value}'), argvBytes: d => d.argv.push('a'.repeat(4097)),
  argvTotal: d => d.argv = Array(5).fill('/' + 'x'.repeat(4095)),
  pathEmpty: d => d.path = [], pathCount: d => d.path = Array(17).fill('/bin'), pathTraversal: d => d.path = ['/a/../b'],
  pathNull: d => d.path = null, newlineName: d => d.required[0] += '\n',
  pathColon: d => d.path = ['/a:b'], pathControl: d => d.path = ['/a\u0080'], pathBytes: d => d.path = ['/' + 'a'.repeat(4096)],
};
for (const [n, mutate] of Object.entries(mutations)) test(`schema rejects ${n} before bootstrap`, async () => {
  const d = doc(); mutate(d); let auth = 0;
  await assert.rejects(run(d, meta(), { runtime() {}, fetch() { auth++; } }), failure('assignment'));
  assert.equal(auth, 0);
});

test('strict JSON: duplicate nested/escaped keys, UTF8, surrogates, unsafe numbers, bounds', () => {
  for (const s of ['{"a":1,"a":2}', '{"a":{"x":1,"\\u0078":2}}', '{"a":NaN}', '{"a":9007199254740992}', '{"a":"\\ud800"}', '[[[[']) assert.throws(() => decode(Buffer.from(s)), failure());
  assert.throws(() => decode(Buffer.from([0xc0, 0xaf])), failure());
  assert.throws(() => decode(Buffer.alloc(LIMIT.manifest + 1)), failure());
  assert.deepEqual(decode(Buffer.from('{"emoji":"😀","__proto__":1}')).emoji, '😀');
});
test('injection and discovery names cannot enter metadata; fetched app AWS allowed', () => {
  for (const n of ['NODE_OPTIONS', 'NODE_PATH', 'NODE_ANY_HOOK', 'OPENSSL_CONF', 'NPM_CONFIG_USERCONFIG', 'PATH', 'HOME', 'LD_PRELOAD', 'DYLD_INSERT_LIBRARIES', 'C07_TOKEN', 'MONITOR_TOKEN', 'HTTPS_PROXY']) { assert.equal(appName(n), false); assert.equal(metadataName(n), false); }
  assert.equal(appName('AWS_ACCESS_KEY_ID'), true); assert.equal(metadataName('AWS_ACCESS_KEY_ID'), false);
  assert.equal(metadataName('INFISICAL_TOKEN'), false);
});
test('value, UTF8, secret-material, metadata, pointer/argv and collision bounds', () => {
  const d = validate(doc()); const vals = Object.fromEntries(d.required.map(n => [n, 'é'.repeat(2048)]));
  snapshot(d, vals, meta(), boot());
  for (const v of ['', 'é'.repeat(2049), 'x\0y', '${ref}', '\ud800']) assert.throws(() => snapshot(d, { ...vals, KEYSTATIC_SECRET: v }, meta(), boot()), failure());
  assert.throws(() => snapshot(d, vals, { ...meta(), API_URL: vals.KEYSTATIC_SECRET }, boot()), failure('handoff'));
  assert.throws(() => snapshot(d, { ...vals, KEYSTATIC_SECRET: boot()[BOOT[1]] }, meta(), boot()), failure('handoff'));
  assert.throws(() => snapshot(d, vals, { ...meta(), API_URL: boot()[BOOT[0]] }, boot()), failure('handoff'));
  assert.throws(() => snapshot(d, vals, { ...meta(), EXTRA: 'x' }, boot()), failure('handoff'));
  const big = doc(); big.required = Array.from({ length: 40 }, (_, i) => `SECRET_${i}`); big.assignments = Object.fromEntries(big.required.map(n => [n, { ...big.assignments.KEYSTATIC_SECRET, name: big.namespace + n }]));
  const bd = validate(big); assert.throws(() => snapshot(bd, Object.fromEntries(bd.required.map(n => [n, 'x'.repeat(4096)])), meta(), boot()), failure('handoff'));
  const short = Object.fromEntries(d.required.map(n => [n, 'production'])); snapshot(d, short, meta(), boot());
});

// These controls go through production SSMClient.send, SigV4 signing, the guarded
// HTTP-send seam, raw validation and real SDK deserialization. No sockets/auth.
function synthetic(d, op, n, body, status = 200, requests = []) {
  return () => ({ destroy() {}, async handle(req) {
    requests.push(req);
    return { response: { statusCode: status, headers: { 'content-type': op === 'identity' ? 'text/xml' : 'application/x-amz-json-1.1' }, body: Readable.from([Buffer.from(body)]) } };
  } });
}
const identityXml = d => `<GetCallerIdentityResponse xmlns="https://sts.amazonaws.com/doc/2011-06-15/"><GetCallerIdentityResult><Arn>${d.principal_arn}</Arn><UserId>SYNTHETIC</UserId><Account>${d.account}</Account></GetCallerIdentityResult><ResponseMetadata><RequestId>synthetic</RequestId></ResponseMetadata></GetCallerIdentityResponse>`;
test('real SDK success, exact identity before three plural reads, complete handoff', async () => {
  const d = validate(doc()), requests = [];
  const result = await prepare(input(d), (d, c, op, n, left) => send(d, c, op, n, left,
    synthetic(d, op, n, op === 'identity' ? identityXml(d) : JSON.stringify(envelope(d, n)), 200, requests)));
  assert.equal(requests.length, 4); assert.equal(requests[0].hostname, 'sts.eu-north-1.amazonaws.com');
  assert.equal(requests[1].hostname, 'ssm.eu-north-1.amazonaws.com');
  assert.deepEqual(JSON.parse(Buffer.from(requests[1].body).toString()), { Names: [d.assignments[d.required[0]].name + ':1'], WithDecryption: true });
  assert.equal(result.KEYSTATIC_SECRET, 'synthetic-KEYSTATIC_SECRET'); assert.equal(result.C07_WORKLOAD_ACCESS_KEY_ID, undefined);
});
const responseMutations = {
  unknownEnvelope: r => r.Other = [], invalidShape: r => r.InvalidParameters = {}, invalidMember: r => r.InvalidParameters = ['x'],
  emptyRows: r => r.Parameters = [], objectRows: r => r.Parameters = {}, extraRows: r => r.Parameters.push(r.Parameters[0]),
  name: r => r.Parameters[0].Name += 'OTHER', arn: r => r.Parameters[0].ARN += 'OTHER', selector: r => r.Parameters[0].Selector = ':2',
  type: r => r.Parameters[0].Type = 'String', dataType: r => r.Parameters[0].DataType = 'aws:ec2:image', versionString: r => r.Parameters[0].Version = '1',
  versionBool: r => r.Parameters[0].Version = true, extraField: r => r.Parameters[0].Unknown = 'x', nullRow: r => r.Parameters[0] = null,
  nullValue: r => r.Parameters[0].Value = null, emptyValue: r => r.Parameters[0].Value = '', oversized: r => r.Parameters[0].Value = 'x'.repeat(4097),
  unresolved: r => r.Parameters[0].Value = '${unresolved}', nul: r => r.Parameters[0].Value = 'x\0y', date: r => r.Parameters[0].LastModifiedDate = 'yesterday',
  missingSelector: r => delete r.Parameters[0].Selector, missingDataType: r => delete r.Parameters[0].DataType,
};
for (const [name, mutate] of Object.entries(responseMutations)) test(`real SDK raw negative control ${name}`, async () => {
  const d = validate(doc()), n = d.required[0], r = envelope(d, n); mutate(r);
  await assert.rejects(send(d, boot(), 'parameter', n, () => 5, synthetic(d, 'parameter', n, JSON.stringify(r))), failure('snapshot'));
});
test('raw duplicate wire keys fail before SDK coercion', async () => {
  const d = validate(doc()), n = d.required[0];
  const s = JSON.stringify(envelope(d, n)).replace('"Version":1', '"Version":1,"Version":1');
  await assert.rejects(send(d, boot(), 'parameter', n, () => 5, synthetic(d, 'parameter', n, s)), failure('snapshot'));
  for (const version of ['1.0', '1e0']) {
    const raw = JSON.stringify(envelope(d, n)).replace('"Version":1', '"Version":' + version);
    await assert.rejects(send(d, boot(), 'parameter', n, () => 5, synthetic(d, 'parameter', n, raw)), failure('snapshot'));
  }
});
test('wrong STS identity means zero parameter sends and no partial result', async () => {
  const d = validate(doc()); let params = 0;
  await assert.rejects(prepare(input(d), async (_, __, op) => { if (op === 'parameter') params++; return { Account: d.account, Arn: d.principal_arn + '/wrong' }; }), failure('identity'));
  assert.equal(params, 0);
  let seen = 0;
  await assert.rejects(prepare(input(d), async (_, __, op, n) => {
    if (op === 'identity') return { Account: d.account, Arn: d.principal_arn };
    if (++seen === 3) throw new Failure('authorization'); return parameter(d, n);
  }), failure('authorization')); assert.equal(seen, 3);
});
test('one-wire guard rejects destination mutations and duplicate sends', async () => {
  const d = validate(doc()), n = d.required[0]; let wire = 0;
  const inner = { destroy() {}, async handle() { wire++; return { response: { statusCode: 200, body: Buffer.from(JSON.stringify(envelope(d, n))) } }; } };
  const req = { protocol: 'https:', hostname: 'ssm.eu-north-1.amazonaws.com', path: '/', method: 'POST', headers: { 'x-amz-target': 'AmazonSSM.GetParameters' }, body: JSON.stringify({ Names: [d.assignments[n].name + ':1'], WithDecryption: true }) };
  const h = guardedHandler(inner, d, 'parameter', n); await h.handle(req, {}); await assert.rejects(h.handle(req, {}), failure('transport')); assert.equal(wire, 1);
  for (const delta of [{ hostname: 'evil.example' }, { protocol: 'http:' }, { path: '/redirect' }, { query: { x: 'y' } }, { body: '{}' }, { port: 444 }]) await assert.rejects(guardedHandler(inner, d, 'parameter', n).handle({ ...req, ...delta }, {}), failure('transport'));
  assert.equal(wire, 1);
});
test('SDK retries stay one; loader retries only qualified categories', async () => {
  const d = validate(doc()), n = d.required[0], requests = [];
  await assert.rejects(send(d, boot(), 'parameter', n, () => 5, synthetic(d, 'parameter', n, '{"__type":"ThrottlingException"}', 429, requests)), Transient);
  assert.equal(requests.length, 1);
  await assert.rejects(send(d, boot(), 'parameter', n, () => 5, synthetic(d, 'parameter', n, '{"__type":"AccessDeniedException"}', 403)), failure('authorization'));
  const retry = doc(); retry.max_attempts = 3; let calls = 0; const logs = [];
  await prepare(input(retry), async (d, c, op, n) => {
    if (++calls === 1) throw new Transient();
    return op === 'identity' ? { Account: d.account, Arn: d.principal_arn } : parameter(d, n);
  }, r => logs.push(r));
  assert.equal(calls, 5); assert.equal(logs.length, 1); assert.equal(logs[0].attempt, 1);
  const exhausted = []; let count = 0;
  await assert.rejects(prepare(input(retry), async () => { count++; throw new Transient(); }, r => exhausted.push(r)), failure('transport'));
  assert.equal(count, 3); assert.equal(exhausted.length, 3);
});
test('bounded response stops streams before SDK deserialization', async () => {
  await assert.rejects(boundedBody(Readable.from([Buffer.alloc(65537)])), failure('snapshot'));
});

// Guard the installed SDK configuration: every shared config read is fatal.
// Patch the public SDK configuration seam before client construction; file
// reads for importing package code are allowed, provider/profile reads are not.
test('SDK makes no shared-config or default-provider lookup with explicit config', async () => {
  const r = spawnSync(process.execPath, [new URL('./config-guard.mjs', import.meta.url).pathname], {
    input: JSON.stringify(input(doc())), env: { PATH: '/usr/bin:/bin' }, encoding: 'utf8', timeout: 5000,
  });
  assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout, '');
});

const temp = mkdtempSync(resolve(tmpdir(), 's1869-offline-'));
process.on('exit', () => rmSync(temp, { recursive: true, force: true }));
const fixtureUrl = new URL('./fixture.mjs', import.meta.url).href;
function workerFile(mode) { const path = resolve(temp, mode + '.mjs'); writeFileSync(path, `import {fixture} from ${JSON.stringify(fixtureUrl)}; await fixture(${JSON.stringify(mode)});`); return path; }
function options(mode, extra = {}) { return { executable: process.execPath, worker: workerFile(mode), ...extra }; }
test('protected manifest rejects writable/symlink paths; dotenv refuses names only', () => {
  const p = resolve(temp, 'assignment.json'); writeFileSync(p, JSON.stringify(doc()), { mode: 0o600 });
  // /tmp on macOS is a symlink and /var/tmp is writable: protected deployment
  // reads must reject these test paths regardless of valid file ownership.
  assert.throws(() => protectedRead(p)); chmodSync(p, 0o666); assert.throws(() => protectedRead(p));
  const link = resolve(temp, 'link'); symlinkSync(p, link); assert.throws(() => protectedRead(link));
  assertNoDotenv(temp);
  for (const n of ['.env.production.local', '.env.local', '.env.production', '.env']) {
    const f = resolve(temp, n); symlinkSync('/nonexistent-synthetic', f);
    assert.throws(() => assertNoDotenv(temp), failure('handoff')); rmSync(f);
  }
});
test('owned worker success is reaped; exact parent exec argv/env, no bootstrap', async () => {
  const d = validate(doc()); let child;
  const result = await supervise(d, input(d), options('success', { onSpawn: c => child = c }));
  assert.notEqual(child.exitCode, null); assert.throws(() => process.kill(child.pid, 0));
  assert.equal(result.KEYSTATIC_GITHUB_CLIENT_ID, meta().KEYSTATIC_GITHUB_CLIENT_ID); assert.equal(result.NEXT_PUBLIC_SITE_URL, undefined);
  let executed;
  await assert.rejects(run(d, { ...meta(), PRIVATE_AMBIENT: 'must-drop', ...boot() }, {
    runtime() {}, fetch: (d, i) => supervise(d, i, options('success')),
    execute: (...args) => { executed = args; },
  }), failure('handoff'));
  assert.deepEqual(executed.slice(0, 2), [NPM, ['npm', 'start']]); assert.equal(executed[2].PRIVATE_AMBIENT, undefined); assert.equal(executed[2][BOOT[0]], undefined);
});
for (const mode of ['stall', 'dns', 'complete-stall', 'bad-exit', 'malformed', 'oversize', 'missing', 'metadata', 'path']) test(`worker ${mode}: no launch, kill/reap, cleanup`, async () => {
  const d = validate(doc()); d.budget_seconds = 0.8; d.connect_seconds = 0.1; d.read_seconds = 0.2;
  let child, entered = '', source = new EventEmitter(); const start = performance.now();
  await assert.rejects(supervise(d, input(d), options(mode, { signalSource: source, onSpawn(c) { child = c; c.stdio[3].on('data', b => entered += b); } })), failure());
  assert.ok(performance.now() - start < 1800); assert.throws(() => process.kill(child.pid, 0));
  for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP']) assert.equal(source.listenerCount(s), 0);
  if (mode === 'dns') assert.ok(entered.includes('dns-entered'));
  if (mode === 'complete-stall') assert.ok(entered.includes('environment'));
});
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) test(`cancellation ${signal} kills/reaps blocking child`, async () => {
  const d = validate(doc()), source = new EventEmitter(); let child, timer;
  await assert.rejects(supervise(d, input(d), options('stall', { signalSource: source, onSpawn(c) { child = c; c.stdio[3].once('data', () => { timer = setTimeout(() => source.emit(signal), 10); }); } })), e => e instanceof Cancelled && e.signal === signal);
  clearTimeout(timer); assert.throws(() => process.kill(child.pid, 0)); assert.equal(source.listenerCount(signal), 0);
});
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) test(`OS ${signal} preserves outcome after worker reap`, async () => {
  const parent = spawn(process.execPath, [new URL('./signal-parent.mjs', import.meta.url).pathname, workerFile('stall')], {
    env: { PATH: '/usr/bin:/bin' }, stdio: ['pipe', 'pipe', 'ignore'],
  });
  let workerPid, output = '';
  const done = new Promise(resolve => parent.once('close', (code, observed) => resolve({ code, observed })));
  const watchdog = setTimeout(() => parent.kill('SIGKILL'), 4000);
  parent.stdout.on('data', b => { output += b; if (output.includes('\n') && !workerPid) { workerPid = Number(output.trim()); parent.kill(signal); } });
  parent.stdin.end(JSON.stringify(input(doc())));
  try {
    const result = await done;
    assert.ok(Number.isInteger(workerPid) && workerPid > 0);
    assert.deepEqual(result, { code: null, observed: signal });
    assert.throws(() => process.kill(workerPid, 0));
  } finally { clearTimeout(watchdog); if (workerPid) { try { process.kill(workerPid, 'SIGKILL'); } catch {} } }
});
test('trusted launch removes Node hooks before execution; default start unchanged', () => {
  const start = readFileSync(new URL('../start', import.meta.url), 'utf8');
  assert.ok(start.startsWith('#!/bin/sh\n')); assert.equal(start.includes('$'), false);
  for (const h of HOOKS) assert.ok(start.includes(`-u ${h} `));
  const line = start.split('\n').find(s => s.startsWith('exec ')); const argv = line.slice(5).split(' ');
  assert.equal(argv.shift(), '/usr/bin/env');
  const index = argv.indexOf('/mise/installs/node/24.22.1/bin/node');
  const fixedRemovals = argv.slice(0, index);
  const result = spawnSync('/usr/bin/env', [...fixedRemovals, process.execPath, '--input-type=module', '-e', 'if (Object.keys(process.env).some(n => n.startsWith("NODE_"))) process.exit(42)'], {
    env: { PATH: '/usr/bin:/bin', NODE_OPTIONS: '--import=/nonexistent-synthetic-injection.mjs', NODE_PATH: '/nonexistent', NODE_EXTRA_CA_CERTS: '/nonexistent', NODE_CHANNEL_FD: '1000', NODE_UNIQUE_ID: '0' }, encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const pkg = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url))); assert.equal(pkg.scripts.start, 'next start');
  const nix = readFileSync(new URL('../../../nixpacks.toml', import.meta.url), 'utf8'); assert.ok(nix.includes('cmd = "npm start"'));
});
