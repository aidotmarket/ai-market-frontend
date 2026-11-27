// After npm run build, run with node --test and two reserved KD_BRIDGE ports.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

const { detail: [, , listing] } = JSON.parse(readFileSync(
  new URL('./fixtures/s1922-composed-detail.json', import.meta.url), 'utf8',
));
const marker = 'Near-limit approved presentation';
const suffix = ' End of near-limit approved presentation.';
const preview = listing.approved_presentation;
const paragraph = `<p>${marker}${suffix}</p>`;
const padding = 'a'.repeat(99_900 - Buffer.byteLength(preview.rendered_html + paragraph));
preview.rendered_html = preview.rendered_html.replace('</body>', `<p>${marker}${padding}${suffix}</p></body>`);
preview.render_hash = createHash('sha256').update(preview.rendered_html).digest('hex');
assert.equal(Buffer.byteLength(preview.rendered_html), 99_900);

const versions = ['active', 'superseded', 'quarantined', 'foreign', 'unknown'].map((status, index) => ({
  status, version_id: `00000000-0000-0000-0000-00000000000${index + 1}`, version_label: `v${5 - index}`,
  published_at: '2026-06-01T00:00:00Z', total_size_bytes: 1000, object_count: 1,
}));
const visible = versions.slice(0, 2);
const versionPath = `/api/v1/listings/${listing.id}`;
const listingPath = `/listings/${listing.slug}`;
const dispositionPath = `/api/v1/public/listing-disposition/${listing.slug}`;
const fullReadPath = `/api/v1/public${listingPath}`;
const requests = [];
const api = createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  requests.push(url.pathname + url.search);
  if (url.pathname === dispositionPath) {
    const version = url.searchParams.get('version');
    response.writeHead(version === null || visible.some(row => row.version_id === version) ? 204 : 404).end();
    return;
  }
  const body = {
    [fullReadPath]: listing,
    [`/api/v1/public/listings/${listing.id}/documents`]: [],
    [`${versionPath}/versions`]: visible,
    [versionPath]: { access_window_days: 30 },
  }[url.pathname];
  if (body === undefined) response.writeHead(404).end();
  else response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body));
});

async function waitForNext(server, origin) {
  for (let attempt = 0; attempt < 100; attempt++) {
    assert.equal(server.exitCode, null, 'next start exited before becoming ready');
    try {
      await (await fetch(`${origin}/robots.txt`, { signal: AbortSignal.timeout(500) })).text();
      return;
    } catch {
      await delay(100);
    }
  }
  assert.fail('next start did not become ready');
}

test('next start preserves version disposition and forwards a 99,900-byte presentation', { timeout: 60_000 }, async t => {
  const base = Number(process.env.KD_BRIDGE_PORT_BASE);
  assert.ok(Number.isInteger(base) && base > 0 && Number(process.env.KD_BRIDGE_PORT_COUNT) >= 2,
    'Set KD_BRIDGE_PORT_BASE and reserve at least two consecutive ports');
  const origin = `http://127.0.0.1:${base}`;
  await new Promise((resolve, reject) => {
    api.once('error', reject);
    api.listen(base + 1, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve, reject) => api.close(error => error ? reject(error) : resolve())));

  await t.test('versioned requests', { timeout: 25_000 }, async state => {
    const server = spawn('rtk', ['proxy', 'npm', 'run', 'start', '--', '--hostname', '127.0.0.1', '--port', String(base)], {
      env: {
        ...process.env,
        API_URL: `http://127.0.0.1:${base + 1}`,
      },
      detached: true,
      stdio: 'inherit',
    });
    const closed = once(server, 'close');
    state.after(async () => {
      if (server.exitCode === null && server.signalCode === null) process.kill(-server.pid, 'SIGTERM');
      await closed;
    });
    await waitForNext(server, origin);

    for (const rsc of [false, true]) {
      const headers = rsc ? { RSC: '1' } : {};
      for (const version of versions) {
        await state.test(`${rsc ? 'RSC' : 'HTML'} ${version.status}`, async () => {
          const query = `?version=${version.version_id}`;
          const start = requests.length;
          const response = await fetch(origin + listingPath + query, { headers });
          const body = await response.text();
          assert.equal(response.headers.get('x-aim-listing-data'), null);
          assert.equal(response.headers.get('x-middleware-request-x-aim-listing-data'), null);
          if (visible.includes(version)) {
            assert.equal(response.status, 200);
            assert.match(response.headers.get('content-type'), rsc ? /text\/x-component/ : /text\/html/);
            assert.ok(body.includes(listing.title));
            assert.ok(body.includes(marker + padding + suffix), 'complete approved presentation renders');
            assert.ok(body.includes(rsc
              ? `"initialVersionId":"${version.version_id}"`
              : `value="${version.version_id}" selected=""`), 'requested version is rendered');
            assert.deepEqual(requests.slice(start).filter(path => path === fullReadPath || path.startsWith(dispositionPath)),
              [dispositionPath + query, fullReadPath]);
          } else {
            assert.equal(response.status, 404);
            assert.ok(!body.includes(listing.title) && !body.includes(marker), 'no listing metadata or presentation leaks');
            assert.deepEqual(requests.slice(start), [dispositionPath + query]);
          }
        });
      }

      await state.test(`${rsc ? 'RSC' : 'HTML'} repeated superseded version`, async () => {
        const [active, superseded] = visible;
        const query = `?version=${superseded.version_id}`;
        for (const second of [superseded, active]) {
          const start = requests.length;
          const response = await fetch(`${origin}${listingPath}${query}&version=${second.version_id}`, { headers });
          const body = await response.text();
          assert.equal(response.status, 200);
          assert.ok(body.includes(rsc
            ? `"initialVersionId":"${superseded.version_id}"`
            : `value="${superseded.version_id}" selected=""`), 'the first version is selected');
          assert.deepEqual(requests.slice(start).filter(path => path === fullReadPath || path.startsWith(dispositionPath)),
            [dispositionPath + query, fullReadPath]);
        }
      });

      const start = requests.length;
      const malformed = await fetch(`${origin}/listings/%E0`, { headers });
      assert.equal(malformed.status, 404);
      await malformed.text();
      assert.deepEqual(requests.slice(start), []);
    }
  });
});
