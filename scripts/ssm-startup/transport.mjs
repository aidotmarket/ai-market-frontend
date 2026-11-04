// Imported only inside the owned worker. Public SDK, explicit credentials only.
import { Agent } from 'node:https';
import { Readable } from 'node:stream';
import { SSMClient, GetParametersCommand } from '@aws-sdk/client-ssm';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { HttpResponse } from '@smithy/protocol-http';
import { need, Failure, LIMIT, BOOT, endpoint, rawParameters } from './contract.mjs';

const quiet = Object.freeze({ trace() {}, debug() {}, info() {}, warn() {}, error() {} });
export class Transient extends Error {}
export async function boundedBody(body) {
  const parts = []; let size = 0;
  try {
    const input = typeof body === 'string' || body instanceof Uint8Array ? [body] : body;
    for await (const chunk of input) {
      const b = Buffer.from(chunk); size += b.length;
      need(size <= LIMIT.response, 'snapshot'); parts.push(b);
    }
    return Buffer.concat(parts);
  } catch (e) { body?.destroy?.(); throw e; }
}
// One instance per logical attempt, including retries. Even SDK clock-skew or
// redirect retry mutations cannot send a second request or change destination.
export function guardedHandler(inner, d, operation, name) {
  let sends = 0;
  const url = new URL(endpoint(d.partition, d.region, operation === 'identity' ? 'sts' : 'ssm'));
  return {
    metadata: { handlerProtocol: 'http/1.1' },
    destroy: () => inner.destroy(),
    async handle(req, options) {
      need(++sends === 1 && req.protocol === 'https:' && req.hostname === url.hostname && (req.port === undefined || req.port === 443) && req.path === '/' && req.method === 'POST' && !req.username && !req.password && !req.fragment && (!req.query || Object.keys(req.query).length === 0), 'transport');
      if (operation === 'parameter') {
        const b = d.assignments[name];
        const expected = JSON.stringify({ Names: [`${b.name}:${b.version}`], WithDecryption: true });
        need(req.headers['x-amz-target'] === 'AmazonSSM.GetParameters' &&
          (typeof req.body === 'string' || req.body instanceof Uint8Array) &&
          Buffer.from(req.body).equals(Buffer.from(expected)), 'transport');
      } else need(typeof req.body === 'string' && req.body === 'Action=GetCallerIdentity&Version=2011-06-15', 'transport');
      const { response } = await inner.handle(req, options);
      const body = await boundedBody(response.body);
      need(Number.isInteger(response.statusCode), 'transport');
      if (response.statusCode === 200 && operation === 'parameter') rawParameters(d, name, body);
      return { response: new HttpResponse({ ...response, body: Readable.from([body]) }) };
    },
  };
}
export function clientConfig(d, c, service, requestHandler) {
  return {
    credentials: { accessKeyId: c[BOOT[0]], secretAccessKey: c[BOOT[1]], ...(c[BOOT[2]] ? { sessionToken: c[BOOT[2]] } : {}) },
    credentialDefaultProvider: () => async () => { throw new Failure('bootstrap'); },
    region: d.region, endpoint: endpoint(d.partition, d.region, service),
    requestHandler, maxAttempts: 1, retryMode: 'standard', defaultsMode: 'standard',
    useFipsEndpoint: false, useDualstackEndpoint: false, tls: true,
    endpointDiscoveryEnabled: false, ignoreConfiguredEndpointUrls: true,
    disableHostPrefix: true, disableClockSkewCorrection: true,
    authSchemePreference: ['aws.auth#sigv4'], sigv4aSigningRegionSet: [],
    userAgentAppId: '', defaultUserAgentProvider: async () => [['c07-node-startup', '1']],
    logger: quiet,
  };
}
export async function send(d, c, operation, name, remaining, innerFactory) {
  const service = operation === 'identity' ? 'sts' : 'ssm';
  need(operation === 'identity' || operation === 'parameter', 'transport');
  const ms = remaining() * 1000;
  const agent = new Agent({ keepAlive: false, maxSockets: 1, rejectUnauthorized: true });
  const inner = innerFactory ? innerFactory() : new NodeHttpHandler({
    httpsAgent: agent, connectionTimeout: Math.min(d.connect_seconds * 1000, ms / 2),
    socketTimeout: Math.min(d.read_seconds * 1000, ms / 2),
    requestTimeout: ms, throwOnRequestTimeout: true, logger: quiet,
  });
  const handler = guardedHandler(inner, d, operation, name);
  const client = service === 'sts' ? new STSClient(clientConfig(d, c, service, handler)) : new SSMClient(clientConfig(d, c, service, handler));
  try {
    const command = service === 'sts' ? new GetCallerIdentityCommand({}) : new GetParametersCommand({ Names: [`${d.assignments[name].name}:${d.assignments[name].version}`], WithDecryption: true });
    const r = await client.send(command);
    need(r.$metadata?.httpStatusCode === 200, 'transport'); remaining();
    if (service === 'sts') return r;
    need(Array.isArray(r.Parameters) && r.Parameters.length === 1 && (!r.InvalidParameters || r.InvalidParameters.length === 0), 'snapshot');
    // Raw row validation has already run before the SDK can coerce or drop fields.
    return r.Parameters[0];
  } catch (e) {
    if (e instanceof Failure) throw e;
    const status = e.$metadata?.httpStatusCode;
    if ([429, 500, 502, 503, 504].includes(status) || ['ThrottlingException', 'Throttling', 'RequestLimitExceeded', 'TimeoutError'].includes(e.name) || ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'EAI_AGAIN', 'ENOTFOUND', 'ENETUNREACH', 'EHOSTUNREACH'].includes(e.code)) throw new Transient();
    throw new Failure([401, 403].includes(status) || e.name === 'AccessDeniedException' ? 'authorization' : 'transport');
  } finally { client.destroy(); agent.destroy(); }
}
