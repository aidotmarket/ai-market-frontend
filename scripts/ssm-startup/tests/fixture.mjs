import { readFileSync, writeSync, closeSync } from 'node:fs';
import dns from 'node:dns';
import { Agent } from 'node:https';
import { decode, snapshot } from '../contract.mjs';

export async function fixture(mode) {
  const input = decode(readFileSync(0), 787456), d = input.document;
  if (mode === 'dns') {
    dns.lookup = () => { writeSync(3, 'dns-entered'); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0); };
    // No real network: DNS never completes. Any unexpected completed DNS path
    // fails closed instead of obtaining a connection.
    const { send } = await import('../transport.mjs');
    await send(d, input.credentials, 'identity', undefined, () => 1);
    process.exit(79);
  }
  const vals = Object.fromEntries(d.required.map(n => [n, 'synthetic-' + n]));
  const environment = snapshot(d, vals, input.metadata, input.credentials);
  if (mode === 'oversize') { writeSync(3, 'x'.repeat(787457)); process.exit(0); }
  if (mode === 'malformed') { writeSync(3, '{'); process.exit(0); }
  if (mode === 'stall') { writeSync(3, 'entered'); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0); }
  if (mode === 'missing') delete environment[d.required[0]];
  if (mode === 'metadata') environment.NODE_ENV = 'different';
  if (mode === 'path') environment.PATH = '/evil';
  writeSync(3, JSON.stringify({ environment, diagnostics: [] })); closeSync(3);
  if (mode === 'complete-stall') Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
  process.exit(mode === 'bad-exit' ? 42 : 0);
}
