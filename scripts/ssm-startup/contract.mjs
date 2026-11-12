// Server-only, stdlib-only c07-standard-v2 contract. No provider imports here.
import { lstatSync, openSync, fstatSync, readSync, closeSync, constants } from 'node:fs';
import { resolve, dirname } from 'node:path';

export const LIMIT = Object.freeze({ manifest: 524288, count: 1024, value: 4096,
  total: 4194304, handoff: 131072, ipc: 787456, response: 65536 });
export const BOOT = ['C07_WORKLOAD_ACCESS_KEY_ID', 'C07_WORKLOAD_SECRET_ACCESS_KEY', 'C07_WORKLOAD_SESSION_TOKEN'];
export const NODE = '/mise/installs/node/24.22.1/bin/node';
export const NPM = '/mise/installs/node/24.22.1/bin/npm';
export const DOTENV = ['.env.production.local', '.env.local', '.env.production', '.env'];
// Fixed env -u arguments in start must match this list. Remove before Node starts.
export const HOOKS = ['NODE_OPTIONS', 'NODE_PATH', 'NODE_EXTRA_CA_CERTS', 'NODE_USE_ENV_PROXY',
  'NODE_USE_SYSTEM_CA', 'NODE_TLS_REJECT_UNAUTHORIZED', 'NODE_V8_COVERAGE', 'NODE_DEBUG',
  'NODE_DEBUG_NATIVE', 'NODE_REDIRECT_WARNINGS', 'NODE_REPL_EXTERNAL_MODULE',
  'NODE_COMPILE_CACHE', 'NODE_DISABLE_COMPILE_CACHE', 'NODE_ICU_DATA',
  'NODE_COMPILE_CACHE_PORTABLE', 'NODE_NO_WARNINGS', 'NODE_PENDING_DEPRECATION',
  'NODE_PENDING_PIPE_INSTANCES', 'NODE_PRESERVE_SYMLINKS', 'NODE_REPL_HISTORY',
  'NODE_SKIP_PLATFORM_CHECK', 'NODE_DISABLE_COLORS', 'NODE_RUN_PACKAGE_JSON_PATH',
  'NODE_RUN_SCRIPT_NAME', 'NODE_TEST_CONTEXT',
  'NODE_CHANNEL_FD', 'NODE_CHANNEL_SERIALIZATION_MODE', 'NODE_UNIQUE_ID',
  'NODE_CLUSTER_SCHED_POLICY', 'NODE_PRESERVE_SYMLINKS_MAIN',
  'OPENSSL_CONF', 'OPENSSL_MODULES', 'SSLKEYLOGFILE', 'SSL_CERT_FILE', 'SSL_CERT_DIR',
  'UV_THREADPOOL_SIZE'];
const injection = new Set(['PATH', 'HOME', 'SHELL', 'ENV', 'BASH_ENV', 'IFS', 'RUBYOPT',
  'RUBYLIB', 'PERL5OPT', 'PERL5LIB', 'JAVA_TOOL_OPTIONS', 'JDK_JAVA_OPTIONS',
  'DOTNET_STARTUP_HOOKS', 'GCONV_PATH', 'LOCPATH', 'TZDIR', 'ZDOTDIR', 'SHELLOPTS',
  'CDPATH', 'REQUESTS_CA_BUNDLE', 'CURL_CA_BUNDLE', 'BOTO_CONFIG', 'GIT_SSH',
  'GIT_SSH_COMMAND', 'GIT_CONFIG', 'GIT_CONFIG_COUNT', ...HOOKS]);
const metadata = new Set(('PORT TZ LANG LC_ALL RAILWAY_SERVICE_ID RAILWAY_PROJECT_ID RAILWAY_ENVIRONMENT_ID RAILWAY_DEPLOYMENT_ID RAILWAY_REPLICA_ID RAILWAY_PRIVATE_DOMAIN RAILWAY_PUBLIC_DOMAIN RAILWAY_DEPLOYMENT_DRAINING_SECONDS RAILWAY_BACKEND_URL RAILWAY_ENVIRONMENT_NAME RAILWAY_PROJECT_NAME RAILWAY_SERVICE_NAME RAILWAY_GIT_COMMIT_SHA RAILWAY_GIT_BRANCH RAILWAY_GIT_REPO_NAME').split(' '));
const fixed = { PYTHONUNBUFFERED: '1', PYTHONDONTWRITEBYTECODE: '1', GIT_TERMINAL_PROMPT: '0' };
const stages = new Set('assignment bootstrap identity fetch snapshot deadline handoff transport authorization'.split(' '));
export class Failure extends Error { constructor(stage) { super('c07'); this.stage = stages.has(stage) ? stage : 'transport'; } }
export const need = (v, stage = 'assignment') => { if (!v) throw new Failure(stage); };
export const bytes = s => Buffer.byteLength(s, 'utf8');
const string = s => typeof s === 'string' && !/[\uD800-\uDFFF]/u.test(s.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/gu, ''));
export const text = s => string(s) && !s.includes('\0');
export const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
export const exact = (x, names, stage = 'assignment') => need(object(x) && Object.keys(x).sort().join('\0') === [...names].sort().join('\0'), stage);
const match = (r, s) => typeof s === 'string' && r.exec(s)?.[0] === s;
const unique = xs => new Set(xs).size === xs.length;
export const appName = n => match(/^[A-Z][A-Z0-9_]{0,63}$/, n) && !injection.has(n) &&
  !metadata.has(n) && !Object.hasOwn(fixed, n) && !n.endsWith('_PROXY') &&
  !/^(C07_|MONITOR_|PYTHON|LD_|DYLD_|NPM_|npm_|OPENSSL_)/.test(n) && (n === 'NODE_ENV' || !n.startsWith('NODE_')) &&
  (n === 'RAILWAY_API_TOKEN' || !n.startsWith('RAILWAY_'));
export const metadataName = n => metadata.has(n) || Object.hasOwn(fixed, n) || (appName(n) && !/^(AWS_|INFISICAL_|RAILWAY_)/.test(n));
export const metadataValue = (n, v) => text(v) && bytes(v) <= LIMIT.value && (!Object.hasOwn(fixed, n) || v === fixed[n]);

// JSON.parse alone silently overwrites duplicate keys. Scan every object first,
// including nested objects, and reject malformed UTF-8, depth and unsafe numbers.
export function decode(raw, bound = LIMIT.manifest, stage = 'assignment') {
  try {
    need(Buffer.isBuffer(raw) && raw.length > 0 && raw.length <= bound, stage);
    const s = new TextDecoder('utf-8', { fatal: true }).decode(raw);
    let i = 0;
    const ws = () => { while (/[\t\n\r ]/.test(s[i] ?? 'x')) i++; };
    const str = () => {
      const start = i++;
      while (i < s.length) {
        if (s[i] === '\\') { i += 2; continue; }
        if (s[i++] === '"') { const v = JSON.parse(s.slice(start, i)); need(string(v), stage); return v; }
      }
      throw new Failure(stage);
    };
    const val = (depth, key) => {
      need(depth <= 64, stage); ws();
      if (s[i] === '"') return str();
      if (s[i] === '{' || s[i] === '[') {
        const obj = s[i++] === '{', end = obj ? '}' : ']', seen = new Set(); ws();
        if (s[i] === end) { i++; return; }
        for (;;) {
          let k;
          if (obj) { need(s[i] === '"', stage); k = str(); need(!seen.has(k), stage); seen.add(k); ws(); need(s[i++] === ':', stage); }
          val(depth + 1, k); ws(); if (s[i] === end) { i++; return; }
          need(s[i++] === ',', stage); ws();
        }
      }
      const m = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(s.slice(i));
      need(m, stage); if (/^-?\d/.test(m[0])) need(Number.isFinite(Number(m[0])) && Math.abs(Number(m[0])) <= Number.MAX_SAFE_INTEGER, stage);
      if (['Version', 'version', 'max_attempts'].includes(key)) need(/^-?(?:0|[1-9]\d*)$/.test(m[0]), stage);
      i += m[0].length;
    };
    val(0); ws(); need(i === s.length, stage); return JSON.parse(s);
  } catch { throw new Failure(stage); }
}
export function endpoint(partition, region, service) {
  const regions = { aws: /^(?:us-(?:east|west)|eu-(?:north|south|west|central)|ap-(?:east|south|southeast|northeast)|ca-(?:central|west)|sa-east|me-(?:south|central)|af-south|il-central|mx-central)-[1-9]$/,
    'aws-cn': /^cn-(?:north|northwest)-[1-9]$/, 'aws-us-gov': /^us-gov-(?:east|west)-[1-9]$/ };
  need(Object.hasOwn(regions, partition) && match(regions[partition], region));
  return `https://${service}.${region}.${partition === 'aws-cn' ? 'amazonaws.com.cn' : 'amazonaws.com'}`;
}
export function validate(input) {
  // Match the common loader's ensure_ascii=True document-size check as well
  // as the raw byte bound. Spaces between members also consume that budget.
  const encoded = x => {
    if (Array.isArray(x)) return '[' + x.map(encoded).join(', ') + ']';
    if (object(x)) return '{' + Object.entries(x).map(([k, v]) => encoded(k) + ': ' + encoded(v)).join(', ') + '}';
    return JSON.stringify(x)?.replace(/[\u007f-\uffff]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  };
  // Decode first to bound depth/bytes before walking any caller-owned object.
  const d = decode(Buffer.from(JSON.stringify(input)));
  need(bytes(encoded(d)) <= LIMIT.manifest);
  if (!Object.hasOwn(d, 'path')) d.path = ['/usr/local/bin', '/usr/bin', '/bin'];
  exact(d, 'schema app environment account partition region endpoint namespace generation principal_mode credential_mode principal_arn role_arn phase origins required assignments argv budget_seconds connect_seconds read_seconds max_attempts metadata path'.split(' '));
  need(d.schema === 'c07-standard-v2');
  for (const f of ['app', 'environment', 'generation', 'phase']) need(match(/^[a-z][a-z0-9-]{0,63}$/, d[f]));
  need(match(/^\d{12}$/, d.account) && d.endpoint === endpoint(d.partition, d.region, 'ssm'));
  need(d.namespace === `/c07/${d.app}/${d.environment}/${d.generation}/`);
  const own = `c07-${d.app}-${d.environment}`; need(own.length <= 64);
  if (d.principal_mode === 'iam-user') need(d.credential_mode === 'access-key' && d.role_arn === null && d.principal_arn === `arn:${d.partition}:iam::${d.account}:user/${own}`);
  else {
    need(d.principal_mode === 'assumed-role' && d.credential_mode === 'session' && d.role_arn === `arn:${d.partition}:iam::${d.account}:role/${own}`);
    const prefix = `arn:${d.partition}:sts::${d.account}:assumed-role/${own}/`;
    need(typeof d.principal_arn === 'string' && d.principal_arn.startsWith(prefix) && match(/^[A-Za-z0-9_-]{2,64}$/, d.principal_arn.slice(prefix.length)));
  }
  need(Array.isArray(d.origins) && d.origins.length >= 1 && d.origins.length <= 8 && unique(d.origins) && d.origins.every(x => match(/^[a-z][a-z0-9-]{0,63}$/, x)));
  need(Array.isArray(d.required) && d.required.length >= 1 && d.required.length <= LIMIT.count && unique(d.required) && d.required.every(appName));
  exact(d.assignments, d.required);
  for (const n of d.required) {
    const p = d.assignments[n]; exact(p, ['name', 'version', 'tier', 'purpose', 'phase']);
    need(p.name === d.namespace + n && p.tier === 'Standard' && p.purpose === 'application' && p.phase === d.phase && Number.isInteger(p.version) && p.version >= 1 && p.version <= 2147483647);
  }
  need(Array.isArray(d.argv) && d.argv.length >= 1 && d.argv.length <= 64 && d.argv.every(a => text(a) && bytes(a) > 0 && bytes(a) <= 4096 && !/[\x00-\x1f]/.test(a) && !a.includes('${')));
  need(d.argv[0].startsWith('/') && !d.argv[0].includes('/../') && d.argv.reduce((s, a) => s + bytes(a), 0) <= 16384);
  need(Array.isArray(d.path) && d.path.length >= 1 && d.path.length <= 16 && d.path.every(p => text(p) && p.startsWith('/') && !/[:\x00-\x1f\x7f-\x9f]/.test(p) && (p === '/' || p.slice(1).split('/').every(x => x && x !== '.' && x !== '..'))) && bytes(d.path.join(':')) <= 4096);
  for (const f of ['budget_seconds', 'connect_seconds', 'read_seconds']) need(typeof d[f] === 'number' && Number.isFinite(d[f]) && d[f] > 0);
  need(d.budget_seconds <= 300 && d.connect_seconds <= 3 && d.read_seconds <= 5 && d.connect_seconds + d.read_seconds < d.budget_seconds && Number.isInteger(d.max_attempts) && d.max_attempts >= 1 && d.max_attempts <= 3);
  need(Array.isArray(d.metadata) && d.metadata.length <= 64 && unique(d.metadata) && d.metadata.every(n => metadataName(n) && !d.required.includes(n)));
  return d;
}
export function protectedPath(path, { directory = false, executable = false, parents = true } = {}) {
  need(path === resolve(path));
  const check = (p, dir) => {
    const st = lstatSync(p);
    need(!st.isSymbolicLink() && (dir ? st.isDirectory() : st.isFile()) && [0, process.geteuid()].includes(st.uid) && !(st.mode & 0o022) && (!executable || dir || (st.mode & 0o111)));
    return st;
  };
  const st = check(path, directory);
  if (parents) for (let p = dirname(path);; p = dirname(p)) { check(p, true); if (p === '/') break; }
  return st;
}
export function protectedRead(path) {
  protectedPath(path);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const s = fstatSync(fd); need(s.isFile() && [0, process.geteuid()].includes(s.uid) && !(s.mode & 0o022) && s.size > 0 && s.size <= LIMIT.manifest);
    const raw = Buffer.alloc(LIMIT.manifest + 1); let size = 0;
    while (size < raw.length) { const n = readSync(fd, raw, size, raw.length - size, null); if (!n) break; size += n; }
    return decode(raw.subarray(0, size));
  }
  finally { closeSync(fd); }
}
export function credentials(d, c) {
  exact(c, d.credential_mode === 'session' ? BOOT : BOOT.slice(0, 2), 'bootstrap');
  need(match(d.credential_mode === 'session' ? /^ASIA[A-Z0-9]{16}$/ : /^AKIA[A-Z0-9]{16}$/, c[BOOT[0]]) && match(/^[A-Za-z0-9/+=]{40}$/, c[BOOT[1]]), 'bootstrap');
  if (d.credential_mode === 'session') need(match(/^[\x21-\x7e]{16,8192}$/, c[BOOT[2]]), 'bootstrap');
  return c;
}
const collision = (s, t) => bytes(s) >= 16 && t.includes(s);
export function value(v) { need(text(v) && bytes(v) > 0 && bytes(v) <= LIMIT.value && !v.includes('${'), 'snapshot'); }
export function row(d, name, p) {
  const b = d.assignments[name];
  need(object(p) && Object.keys(p).every(k => ['Name', 'ARN', 'Version', 'Selector', 'Type', 'DataType', 'Value', 'LastModifiedDate'].includes(k)) && p.Name === b.name && p.ARN === `arn:${d.partition}:ssm:${d.region}:${d.account}:parameter${b.name}` && Number.isInteger(p.Version) && p.Version === b.version && p.Selector === `:${b.version}` && p.Type === 'SecureString' && p.DataType === 'text', 'snapshot');
  if (Object.hasOwn(p, 'LastModifiedDate')) need(typeof p.LastModifiedDate === 'number' && Number.isFinite(p.LastModifiedDate), 'snapshot');
  value(p.Value); return p.Value;
}
export function rawParameters(d, name, raw) {
  const r = decode(raw, LIMIT.response, 'snapshot');
  need(object(r) && Object.keys(r).every(k => ['Parameters', 'InvalidParameters'].includes(k)) && (!Object.hasOwn(r, 'InvalidParameters') || (Array.isArray(r.InvalidParameters) && r.InvalidParameters.length === 0)) && Array.isArray(r.Parameters) && r.Parameters.length === 1, 'snapshot');
  row(d, name, r.Parameters[0]); return r;
}
export function snapshot(d, vals, meta, c) {
  exact(vals, d.required, 'snapshot'); exact(meta, d.metadata.filter(n => Object.hasOwn(meta, n)), 'handoff');
  let total = 0;
  const targets = [...d.argv, d.path.join(':')];
  for (const v of Object.values(vals)) {
    value(v); total += bytes(v);
    need(targets.every(t => !collision(v, t)), 'handoff');
  }
  need(total <= LIMIT.total, 'snapshot');
  for (const [n, v] of Object.entries(meta)) need(metadataValue(n, v) && Object.values(vals).every(s => !collision(s, v)), 'handoff');
  if (c) need(Object.values(c).every(b => [...targets, ...Object.values(meta), ...Object.values(vals)].every(t => !t.includes(b))), 'handoff');
  const env = { PATH: d.path.join(':'), ...meta, ...vals };
  need(Object.entries(env).reduce((s, [k, v]) => s + bytes(k) + bytes(v) + 10, 0) + d.argv.reduce((s, a) => s + bytes(a) + 9, 0) + 16 <= LIMIT.handoff, 'handoff');
  return env;
}
