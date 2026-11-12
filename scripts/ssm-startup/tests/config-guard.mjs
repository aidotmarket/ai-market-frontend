// Fresh process: install tripwires BEFORE SDK modules capture config functions.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
const require = createRequire(import.meta.url);
const config = require('@smithy/core/config');
const providers = require('@aws-sdk/credential-provider-node');
const original = config.loadConfig;
let invoked = 0;
config.loadConfig = (...args) => {
  // Creating a deferred provider is harmless; resolving it reads ambient config.
  original(...args);
  return async () => { invoked++; throw new Error('shared config forbidden'); };
};
providers.defaultProvider = () => async () => { invoked++; throw new Error('default provider forbidden'); };
const { send, Transient, clientConfig } = await import('../transport.mjs');
const { document: d, credentials: c } = JSON.parse(readFileSync(0, 'utf8'));
const n = d.required[0], p = d.assignments[n];
const xml = `<GetCallerIdentityResponse><GetCallerIdentityResult><Arn>${d.principal_arn}</Arn><Account>${d.account}</Account></GetCallerIdentityResult></GetCallerIdentityResponse>`;
const json = JSON.stringify({ Parameters: [{ Name: p.name, ARN: `arn:aws:ssm:eu-north-1:${d.account}:parameter${p.name}`, Version: p.version, Selector: ':1', Type: 'SecureString', DataType: 'text', Value: 'synthetic-only' }] });
for (const [op, body, status] of [['identity', xml, 200], ['parameter', json, 200], ['parameter', '{"__type":"ThrottlingException"}', 429], ['parameter', '{"__type":"AccessDeniedException"}', 403]]) {
  const handler = () => ({ destroy() {}, async handle() { return { response: { statusCode: status, headers: {}, body: Readable.from([body]) } }; } });
  try { await send(d, c, op, n, () => 5, handler); if (status !== 200) process.exit(2); }
  catch (e) { if (status === 200 || (status === 429 && !(e instanceof Transient)) || (status === 403 && e.stage !== 'authorization')) process.exit(3); }
}
if (invoked) process.exit(4);
// Mutation control: omitting explicit retryMode MUST resolve the tripwire.
const { SSMClient, GetParametersCommand } = await import('@aws-sdk/client-ssm');
const options = clientConfig(d, c, 'ssm', { destroy() {}, async handle() { process.exit(5); } });
delete options.retryMode;
const mutated = new SSMClient(options);
try { await mutated.send(new GetParametersCommand({ Names: [p.name + ':1'], WithDecryption: true })); process.exit(6); }
catch { if (invoked === 0) process.exit(7); }
finally { mutated.destroy(); }
