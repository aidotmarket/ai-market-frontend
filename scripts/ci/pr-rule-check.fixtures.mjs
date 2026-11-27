import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { newFindings } from './pr-rule-check.mjs';
import { hasRuleAnswers } from './pr-rule-description.mjs';

const template = readFileSync(new URL('../../.github/pull_request_template.md', import.meta.url), 'utf8');
const prompts = template.split('\n').filter(line => /^\d\. /.test(line)).map(line => line.slice(3));
const answers = [
  'A revoked seller could still publish.',
  'The publish handler returns 403 when fresh approval is absent.',
  'Checking at sign-in missed revocation between sessions.',
  'Sellers have to refresh their approval and the reviewer checks its rationale.',
];
const answered = '## Rule check\n\n' + answers.join(' ');
const approval = "if (!hasApproval()) return Response.json({ error: 'Approval required' }, { status: 403 });";
const source = (path, before, after) => ({ path, before, after });
const scan = (...changes) => [...newFindings(changes)];

test('accepts prose, loose labels, headings and answers beneath numbered prompts', () => {
  const equivalentBodies = [
    answered,
    '# **Max’s Rule Check** #\n\n' + answers.join('\n'),
    '**Rule check:** ' + answers.join(' '),
    'Rule check\n' + answers.join('\n'),
    '## Restriction rationale\n\n' + answers.join(' '),
    'Rule check\n----------\n' + ['Harm', 'Effect', 'Prior approach', 'Cost']
      .map((label, i) => `- **${label}:** ${answers[i]}`).join('\n'),
    ['Harm', 'Effect', 'Prior approach', 'Cost'].map((label, i) => `**${label}:** ${answers[i]}`).join('\n\n'),
    '### Rule check (if applicable)\n#### Why change it?\n' + answers.join(' ') + '\n## Testing\nFixtures passed.',
    ...['   ', '    ', '\t'].map(indent => '## Rule check\n\n' + prompts
      .map((prompt, i) => `${i + 1}. **${prompt}**\n\n${indent}${answers[i]}`).join('\n\n')),
  ];
  for (const body of equivalentBodies) assert.equal(hasRuleAnswers(body), true, body);
});

test('ignores an untouched template, examples, prompts and placeholders', () => {
  for (const body of [
    template, null, '## Summary\nNormal description.',
    '## Rule check\n<!-- Explanations -->\n## Testing\nFixtures passed.',
    '## Rule check\n- **Harm:** TBD\n- **Effect**\n- [ ]\n- **Cost:** N/A',
    '## Rule check\n' + prompts.map((prompt, i) => `${i + 1}. **${prompt}**`).join('\n'),
    '## Rule check\n\n```md\n' + answers.join('\n') + '\n```',
    '## Rule check\n\n    ' + answers.join(' '),
    answered.split('\n').map(line => '> ' + line).join('\n'),
  ]) assert.equal(hasRuleAnswers(body), false, body);
});

test('flags direct HTTP, throw, JSX and fail-closed enforcement', () => {
  const changes = [
    source('app/api/publish/route.ts', '', `export function POST() { ${approval} }`),
    source('lib/check.cjs', '', 'function run() { if (!context.hasRequiredProof) throw new ProofRequiredError(); }'),
    source('components/Publish.tsx', '', 'const action = <button disabled={!proofVerified}>Publish</button>;'),
    source('middleware.mjs', '', 'function verify() { try { verifyProof(); } catch { return new Response(null, {status: 403}); } }'),
    source('app/api/admin/route.js', '', 'const get = () => isAuthorized() ? openPage() : new Response(null, {status: 401});'),
  ];
  assert.deepEqual(scan(...changes).map(({ path, confirmed }) => [path, confirmed]),
    changes.map(({ path }) => [path, true]));
});

test('does not infer restriction behavior from UI copy or ordinary code', () => {
  assert.deepEqual(scan(
    source('components/Status.jsx', '', 'if (approvalPending) return <p>Blocked pending required proof</p>;'),
    source('components/Rule.tsx', '', 'const copy = "This gate refuses access if approval is missing";'),
    source('components/Submit.tsx', '', 'const action = <button disabled={saving}>Publish</button>;'),
    source('lib/parse.ts', '', "function read(value) { if (!value) throw new Error('Proof required'); }"),
    source('app/api/report/route.ts', '', 'if (!isAuthorized()) new Response(null, { status: 403 });'),
    source('app/api/inspect/route.ts', '', 'if (!isAuthorized()) return new Response(null, {status: 403, ...opts});'),
  ), []);
});

test('makes uncertain guards advisory', () => {
  const changes = [
    source('lib/check.ts', '', 'function run() { if (!proofVerified) return false; }'),
    source('lib/auth.ts', '', 'function run() { if (unknownCondition) return new Response(null, { status: 403 }); }'),
    source('middleware.ts', '', 'const r = lookupListing().catch(failClosed);'),
    source('components/Publish.tsx', '', 'const action = <button disabled={!proofVerified || saving}>Publish</button>;'),
    source('components/Spread.tsx', '', 'const action = <button disabled={!proofVerified} {...props}>Publish</button>;'),
    source('lib/broken.js', '', 'export function {'),
  ];
  assert.deepEqual(new Map(scan(...changes).map(({ path, confirmed }) => [path, confirmed])),
    new Map(changes.map(({ path }) => [path, false])));
});

test('keeps existing, equivalent and moved guards eligible', () => {
  const wrap = (body) => `function publish() { ${body} }`;
  assert.deepEqual(scan(
    source('app/route.ts', wrap(approval), wrap(approval.replace('Approval required', 'Sorry, approval is required'))),
    source('app/old.js', wrap(approval), ''),
    source('app/current.ts', '', wrap("return hasApproval() ? publishListing() : Response.json({}, { status: 403 });")),
    source('lib/check.ts', wrap(approval), wrap("if (hasApproval()) { publishListing(); } else return Response.json({}, { status: 403 });")),
  ), []);
});

test('pairs one old guard with at most one rewrite or move', () => {
  const wrap = (body) => `function publish() { ${body} }`;
  const rewrite = approval.replace('hasApproval()', 'hasHumanApproval()');
  assert.deepEqual(scan(
    source('app/route.ts', wrap(approval), wrap(rewrite + '\n' + approval.replace('hasApproval()', 'proofVerified'))),
  ).map(({ confirmed }) => confirmed), [false, true]);
  assert.deepEqual(scan(
    source('app/route.ts', wrap(approval.replace('hasApproval()', 'mayPublish()')), wrap(approval)),
  ).map(({ confirmed }) => confirmed), [false]);
  assert.equal(scan(
    source('app/old.js', wrap(approval), ''),
    source('app/moved.ts', '', wrap(approval)),
    source('app/duplicate.ts', '', wrap(approval)),
  ).filter(({ confirmed }) => confirmed).length, 1);
});

test('CLI reads Git blobs at the merge base and the latest PR description', () => {
  const dir = mkdtempSync(join(process.env.KD_BRIDGE_JOB_SCRATCH || tmpdir(), 'rule-check-'));
  try {
    const git = (...args) => {
      const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      return result.stdout.trim();
    };
    const write = (file, text) => writeFileSync(join(dir, file), text);
    const commit = (message) => {
      git('add', '--all');
      git('commit', '-qm', message);
      return git('rev-parse', 'HEAD');
    };
    const route = 'app/route.ts';
    const normal = 'export function POST() { return Response.json({ ok: true }); }';
    const restriction = normal.replace('return Response', approval + '\nreturn Response');
    git('init', '-q');
    git('config', 'user.name', 'Rule check test');
    git('config', 'user.email', 'rule-check@example.invalid');
    git('config', 'commit.gpgsign', 'false');
    git('config', 'core.hooksPath', '/dev/null');
    mkdirSync(join(dir, 'app'));
    write(route, normal);
    const common = commit('Original route');
    write(route, restriction);
    const base = commit('Base independently added same guard');
    git('checkout', '--detach', common);
    mkdirSync(join(dir, 'tests'));
    mkdirSync(join(dir, 'docs'));
    for (const path of ['tests/fixture.js', 'docs/example.mjs', 'app/route.test.tsx']) write(path, restriction);
    const ordinary = commit('Add test and docs examples');
    write(route, restriction + "\nimport { writeFileSync } from 'node:fs';\nwriteFileSync('ran-source', 'yes');");
    const head = commit('Add runtime restriction');
    write(route, normal);

    const eventPath = join(dir, 'event.json');
    const run = (action, sha, body) => {
      write('event.json', JSON.stringify({ action, pull_request: { base: { sha: base }, head: { sha }, body } }));
      const entry = fileURLToPath(new URL('./pr-rule-check.mjs', import.meta.url));
      const result = spawnSync(process.execPath, [entry], {
        cwd: dir, encoding: 'utf8', env: { ...process.env, GITHUB_EVENT_PATH: eventPath },
      });
      assert.equal(result.stderr, '');
      return result;
    };

    assert.equal(run('opened', ordinary, template).status, 0);
    const missing = run('synchronize', head, '$(touch ran-body)\n' + template);
    assert.equal(missing.status, 1);
    assert.match(missing.stdout, /Rule check finding: app\/route.ts:1/);
    assert.match(missing.stdout, /Saving the description reruns this check/);
    const edited = run('edited', head, answered);
    assert.equal(edited.status, 0);
    assert.match(edited.stdout, /Rule check finding: app\/route.ts:1/);
    assert.equal(existsSync(join(dir, 'ran-source')), false);
    assert.equal(existsSync(join(dir, 'ran-body')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
