import { performance } from 'node:perf_hooks';
import { writeSync, closeSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { validate, decode, LIMIT, credentials, need, Failure, exact, snapshot, value, metadataValue } from './contract.mjs';
import { send, Transient } from './transport.mjs';

export async function prepare(input, call = send, diagnostic = () => {}) {
  exact(input, ['document', 'credentials', 'metadata']);
  const d = validate(input.document), c = credentials(d, input.credentials);
  need(input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata), 'handoff');
  need(Object.entries(input.metadata).every(([n, v]) => d.metadata.includes(n) && metadataValue(n, v)), 'handoff');
  // Check bootstrap containment even when a transport later fails.
  const started = performance.now(), deadline = started + d.budget_seconds * 1000;
  const remaining = () => { const s = (deadline - performance.now()) / 1000; need(s > 0, 'deadline'); return s; };
  const invoke = async (op, name) => {
    for (let attempt = 1; attempt <= d.max_attempts; attempt++) {
      remaining();
      try { const r = await call(d, c, op, name, remaining); remaining(); return r; }
      catch (e) {
        if (!(e instanceof Transient)) throw e;
        diagnostic({ stage: op === 'identity' ? 'identity' : 'fetch', attempt, elapsed_ms: Math.min(300000, Math.max(0, Math.floor(performance.now() - started))) });
        need(attempt < d.max_attempts, 'transport');
        const delay = (0.25 + Math.random() * 0.25) * 2 ** (attempt - 1);
        need(delay < remaining(), 'deadline'); await sleep(delay * 1000);
      }
    }
  };
  // An empty synthetic complete set lets the same containment rules check
  // argv/PATH/metadata before any authentication without emitting material.
  need(Object.values(c).every(b => [...d.argv, d.path.join(':'), ...Object.values(input.metadata)].every(v => typeof v === 'string' && !v.includes(b))), 'handoff');
  const identity = await invoke('identity');
  need(identity.Account === d.account && identity.Arn === d.principal_arn, 'identity');
  const vals = {};
  for (const name of d.required) {
    const p = await invoke('parameter', name);
    // Full raw validation is in the production send seam; SDK converts date.
    need(p.Name === d.assignments[name].name && p.ARN === `arn:${d.partition}:ssm:${d.region}:${d.account}:parameter${p.Name}` && p.Version === d.assignments[name].version && p.Selector === `:${p.Version}` && p.Type === 'SecureString' && p.DataType === 'text', 'snapshot');
    value(p.Value); vals[name] = p.Value;
  }
  const env = snapshot(d, vals, input.metadata, c); remaining(); return env;
}
export async function main() {
  let message; const diagnostics = [];
  try {
    const chunks = []; let size = 0;
    for await (const chunk of process.stdin) { size += chunk.length; need(size <= LIMIT.ipc, 'handoff'); chunks.push(chunk); }
    const input = decode(Buffer.concat(chunks), LIMIT.ipc, 'handoff');
    const environment = await prepare(input, send, r => diagnostics.push(r));
    message = { environment, diagnostics };
  } catch (e) { message = { failure: e instanceof Failure ? e.stage : 'transport', diagnostics }; }
  try {
    const raw = Buffer.from(JSON.stringify(message)); need(raw.length <= LIMIT.ipc, 'handoff');
    let offset = 0; while (offset < raw.length) offset += writeSync(3, raw, offset);
    closeSync(3); process.exit(0);
  } catch { process.exit(78); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
