# Frontend SSM startup package

This package implements the server-only Node port of the plural common
loader at `7b3cdd0abd05845cebb417e41ae8f1335fb3d3f4`. It does not activate SSM
startup. `npm start` remains `next start`, and Nixpacks still starts `npm start`.
No app routes, lazy factories, feature flags or deployment settings change.

`assignment.json` is the published generation-01 manifest: its bytes match the
accepted publisher candidate and the three Standard SecureString/version-1
metadata records from 4 November 2026. The qualified origin reference is
`c07-ai-market-frontend-production-ssm-read`; it records policy provenance, while
the actual region/source-address restrictions live in that reader policy.
`assignment.prospective.json` remains the preparatory example with an unresolved
origin marker; do not use it as an activation manifest. Adding the final file
does not reference `start` from deployment settings or activate retrieval.
Canonical custody, Max-only reader issuance, staging and rollout facts are kept
in the current Infisical runbook. Effective access, actual startup/health/feature
and rollback acceptance remain separate from this nonsecret source publication.

The three assignments are `AI_CRAWL_BEACON_KEY`,
`KEYSTATIC_GITHUB_CLIENT_SECRET` and `KEYSTATIC_SECRET`, each at
`/c07/ai-market-frontend/production/g-s1869-ai-market-frontend-01/<ENV_NAME>:1`.
All three are required because the names-only runtime observation selected all
three. A future generation omitting the beacon must omit it from both
`required` and `assignments`. Failure to fetch a selected member is always fatal.

The separate nonsecret `KEYSTATIC_GITHUB_CLIENT_ID` is required and nonempty,
as are the observed `PORT` and `NODE_ENV` members (`NODE_ENV=production`). The
explicit metadata allowlist also selects the qualified API/site URLs, public
Keystatic slug, existing public feature inputs and revision provenance names.
Their individual presence/absence is preserved. Nothing else is inherited.
Public `NEXT_PUBLIC_*`, Next config `env`, rewrites and other build inputs remain
build-time inputs. This package performs no private retrieval during `npm ci`
or `next build`, adds no Docker ARG, and cannot regenerate compiled public values.

## Future startup command and delivered context

The supported alternate command, and exact future Railway start override, is:

```sh
/app/scripts/ssm-startup/start
```

The executable has a fixed `/bin/sh` shebang (observed `/usr/bin/dash`) and a
single `exec /usr/bin/env` command. Every `-u NAME` and subsequent argument is
literal. It removes Node preload, module-path, CA, TLS, proxy, debug, warning-file,
coverage, compile-cache and other documented Node configuration hooks **before
Node starts**, then runs the qualified absolute Node, loader and protected
`/app/scripts/ssm-startup/assignment.json`. There is no secret argv or shell
value interpolation. Do not invoke the JS directly through ambient `node`, npm,
or `NODE_OPTIONS`; deleting hooks inside JavaScript would be too late. Trust in
the native launcher and deployment-owned executable files is a prerequisite,
as with the original loader. This is not protection against replacement of code
by a deployment-authorized actor.

Future packaging must retain this directory and the complete locked production
SDK dependency closure from `npm ci`, deliver the selected nonsecret manifest
read-only, and protect the code/manifest and every ancestor from symlinks and
group/world writes, owned by root or the service UID. The parent checks those
conditions and fixed `/app`, Node, npm and `/usr/bin/env` executables. It accepts
the qualified distro `/bin -> /usr/bin` and `/bin/sh -> /usr/bin/dash` layout;
it does not reject those useful normal system links. Exact Node 24.22.1, Linux
and `process.execve` are required by the frontend CLI. No spawn fallback exists.

`.railwayignore` and `.dockerignore` exclude the four fixed app-root dotenv
names from upload/build contexts. The delivered artifact must also exclude
them (including generated layers/mounts). Immediately before fetch and again
before handoff, the loader refuses any entry at `.env.production.local`,
`.env.local`, `.env.production` or `.env`, including dangling links. It checks
names/stat metadata only, never file contents, and never bypasses Next's env
loader. Artifact/image qualification must verify exclusions on the actual
delivery path; ignore files alone do not attest a built image.

After successful fetch the parent reaps the worker, closes its anonymous pipes,
removes its timers and TERM/INT/HUP listeners, then replaces itself with
`process.execve('/mise/installs/node/24.22.1/bin/npm', ['npm', 'start'], env)`.
PATH is exactly `/mise/installs/node/24.22.1/bin:/usr/bin:/bin`; npm's ordinary
lifecycle `.bin` resolution and existing `next start` behavior remain in place.
No persistent loader parent, custom server or standalone Next server is added.
Cancellation kills/reaps the worker and releases pipes/timers/listeners before
re-raising the original signal, including cancellation during exceptional cleanup.
Other failures exit 78 with a fixed value-free diagnostic and no application
launch. Npm's own existing signal relay is not redefined or measured here.

## Contract and process boundary

`contract.mjs` imports only stdlib. It rejects duplicate/unknown schema keys,
invalid UTF-8/lone surrogates, unsafe numbers, incorrect modes, phase/purpose,
namespace/name/version/tier mismatches and injection/discovery metadata. The
same `c07-standard-v2` schema supports IAM-user access-key pairs and explicit
assumed-role session triples; runtime never calls AssumeRole or issues/refreshes
credentials. Only the three `C07_WORKLOAD_*` bootstrap names are read, after
parent validation. IAM-user mode rejects even an empty session-token member.

Bounds retain manifest 524288 bytes, 1024 required members, 4096 UTF-8 bytes per
value, 4194304 total fetched bytes, 787456 bytes per anonymous IPC direction,
131072 bytes of environment/argv including NUL/pointer overhead, 64 argv entries,
16384 argv bytes, 64 metadata names, 1–16 absolute PATH directories and 4096
joined PATH bytes. Paths/argv reject traversal and control/injection forms.
Metadata has the common fixed-value exceptions and no provider discovery names.
Fetched application-purpose AWS/Infisical names remain supported by the common
schema, separate from bootstrap. Values must be nonempty, contain no NUL or
unresolved `${...}` reference, and satisfy UTF-8 size limits. Bootstrap material
in argv/PATH/metadata/values fails unconditionally; fetched material of at least
16 bytes colliding with argv/PATH/metadata also fails. Parent checks the entire
handoff again, exact key membership, PATH and original metadata equality.

One owned process contains all SDK imports, signing/authentication, native DNS,
TLS/HTTP, retry/backoff and snapshot construction. It starts with a constructed
environment containing only fixed PATH; bootstrap and selected metadata travel
over bounded anonymous stdin, and the complete snapshot returns on a separate
anonymous pipe. Stdout/stderr are discarded. No secret files, caches, LKG,
ambient secret fallbacks, partial environments or app imports are used. The
parent owns an independent monotonic aggregate deadline, including spawn, IPC
and worker exit. It kills with SIGKILL and awaits child close/reap on native
stall, cancellation, malformed/oversized IPC and any failed handoff. A complete
message followed by a stalled or nonzero worker is a failure.

`transport.mjs` uses explicitly pinned production AWS/Smithy dependencies.
Clients receive explicit in-memory credentials, region and regional HTTPS STS/
SSM endpoints, TLS-verifying direct HTTPS agents, disabled configured endpoint
URLs/discovery/FIPS/dualstack, explicit defaults/retry/auth/user-agent settings,
and a failing default-credential provider. No ambient profiles, IMDS/ECS,
web-identity, proxy, CA override or config provider is resolved. The worker's
clean pre-Node environment also prevents module/cache/config injection. Exact
STS account/ARN binding precedes every SSM read. Each binding uses its own
`GetParameters` request with one exact `Name:Version` and `WithDecryption:true`.

The handler checks exact destination, method, target and serialized request
bytes and refuses a second wire send per client attempt, including redirect or
SDK retry mutations. Success responses are bounded to 65536 raw bytes and
validated before SDK deserialization: strict UTF-8/JSON, duplicate keys, closed
plural envelope, one row, empty invalid list, exact name/ARN/account/region,
integer version, selector, SecureString/text and row/value types. This prevents
lossy SDK conversion from hiding malformed rows. No singular/list/path reads.

Total startup budget is <=300s, connect <=3s/read <=5s, both clamped to remaining
time. SDK attempts are exactly one; loader attempts are 1–3 per operation.
Only timeout/connection/rate/qualified server categories retry with bounded
0.25–0.5s then 0.5–1s jitter inside the same total budget. This manifest chooses
10s total, 1s connect, 2s read, one attempt, four maximum wire sends. Diagnostics
contain only fixed stage/category and bounded ordinal/elapsed numbers; provider
bodies, exception messages, names/selectors, private values/hashes and auth
headers never reach logs. The native parent bound is independent of JS timers
in the child. The app receives readiness only through ordinary Next startup.

The unchanged `policy.template.json` is the authoritative common rendering
template, not an applied grant. Preserve only exact own-generation parameter
ARNs with `ssm:GetParameters`, the existing managed `aws/ssm` decrypt key/context
and regional ViaService, exact principal/origin conditions and separate app
grants. Effective IAM/KMS/SCP/origin restrictions, Standard tier, capacity and
high-throughput-OFF require publication qualification; neither client nor ARN
appearance proves them. Do not widen a union, invent CIDRs/key ARNs or publish
parameters from this template.

## Provenance, tests and remaining acceptance

`source-provenance.json` records the base, exact authoritative plural-source
commit/file hashes, registry versions and lock integrities. The source matches
the preparation snapshot hashes, but the reference here is the current 7b3
checkout, not an old singular loader.

The public registry selected `@aws-sdk/client-ssm@3.1161.0`,
`@aws-sdk/client-sts@3.1161.0`, `@smithy/node-http-handler@4.14.1` and
`@smithy/protocol-http@5.5.1`. All four are exact production dependencies;
the lock adds 25 entries without changing existing entries. Installed primary
source qualification used these `dist-cjs` anchors (hashes in provenance):

| Source | Relevant behavior |
| --- | --- |
| SSM `index.js:7919`, `:7952`; STS `index.js:820`, `:864` | Nullish defaults for credential/config/retry/region/auth/user-agent fields; supplied explicit settings prevent provider resolution. |
| Smithy core `submodules/endpoints/index.js:279` and `:150` | Explicit custom endpoint and ignore-configured-endpoint handling. |
| Node HTTP handler `index.js:279`, `:368`, `:449` | Direct `https.request`, external explicit HTTPS agent, supplied connect/socket/request timeouts, no redirect-following handler. |
| AWS core `submodules/httpAuthSchemes/index.js:344` | Lazy clock-skew config provider; explicitly disabled by client config. |

The fresh-process config tripwire runs before SDK import and refuses any
shared-config/default-credential provider resolution on success and error
paths. Its mutation control deletes explicit retry mode and requires the
tripwire to fire. Wire mutation controls independently require destination,
payload and duplicate-send refusals. Public primary references are the locked
registry tarballs and [Node's pinned CLI documentation](https://nodejs.org/download/release/v24.22.1/docs/api/cli.html)
and [execve documentation](https://nodejs.org/download/release/v24.22.1/docs/api/process.html#processexecvefile-args-env).

Preparation source and runtime metadata:

- `/Users/max/koskadeux-state/evidence/ops13-s1869/frontend-node-startup-preparation/decision-facts.md`
- `/Users/max/koskadeux-state/evidence/ops13-s1869/frontend-node-runtime-launch-metadata.json`

The 05:34 UTC runtime observation qualified Node 24.22.1, `/app`, `execve`,
root-owned regular npm and env executables, dash linkage, absence of all four
dotenv entries and presence of selected names. It read no values or files and
does not prove a future image. The preparation's pinned Next/Keystatic source
establishes runtime hydration compatibility; it is not a generated artifact or
live OAuth/beacon acceptance. The existing merged lazy factory is reused.

Run `npm run test:ssm-startup`. Normal Frontend CI runs it after the existing
frontend checks on Node 24.22.1. Offline tests exercise the real production SDK
send/HTTP seam with synthetic STS/SSM responses and mutation negatives, raw
duplicate/type/shape bounds, one-wire destination guards, retry exhaustion,
identity-before-fetch, complete snapshots, protected paths, pre-Node hook
removal, native DNS blocked in an owned child, cancellation/reaping and
complete-then-stall/nonzero exits. They import no application, call no actual
credential provider and create no provider connections. Synthetic fixtures may
use temporary files; runtime private material only uses anonymous pipes/memory.

Local results in `validation.json`: 92 startup tests and all 4369 existing tests
across 251 frontend files passed on official checksum-verified Node 24.22.1 for
Darwin arm64; lint passed with six existing warnings and typecheck passed.
Actual Linux `/app`/`/mise` npm handoff and a Next build/start were not executed.
Earlier host Node 25.3.0 frontend failures and port-development failures are
retained in full private evidence alongside the final successful logs; they
are not represented as supported-runtime results.

Actual manifest publication and canonical source versions/folders, bootstrap
custody/rotation, effective reader/origin/KMS authority, final image dependency/
path/dotenv qualification, normal remote CI and controlled rollout acceptance
remain outstanding. Production activation must wait for those actual inputs.
Bootstrap integration retains the accepted <=90-day rotation policy, targeting
replacement by day 60 with consumer adoption/drain before retirement. Published
selected parameter versions must remain available through drain/rollback;
startup never mutates or falls back to a newer generation.
No frontend key issuance, provider calls, app build/start, deployment, autostart,
browser/customer/payment/native-product journey or flags change is performed.
