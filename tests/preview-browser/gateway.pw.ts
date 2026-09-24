import { test, expect } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { createHash } from 'node:crypto';

const body = Buffer.alloc(1024 * 1024, 0x41);
const sha256 = createHash('sha256').update(body).digest('hex');
const seen: Array<{ token: string | null; range: string | undefined; referer: string | undefined }> = [];
let door: Server;
let origin: string;

const permission = (token: string) => ({
  token, jti: token, start_deadline: '', transfer_deadline: '', resume_offset: 0,
  download_url: `${origin}/v1/files/ab12`, browser_url: `${origin}/v1/files/ab12?t=${token}`,
});
const delivery = (current: ReturnType<typeof permission> | null) => ({
  door_url: origin, hold: { state: 'held_until', until: '2026-09-25T12:00:00Z', disputable: true }, problem: null,
  files: [{ file_id: 'ab12', display_name: 'file-ab12.bin', size_bytes: body.length, sha256,
    state: 'not_started', transmitted_bytes: 0, permission: current,
    reissue: { allowed: true, remaining_24h: 5, blocked_code: null } }],
});

test.beforeAll(async () => {
  door = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname !== '/v1/files/ab12') { response.writeHead(404); response.end(); return; }
    const range = request.headers.range;
    seen.push({ token: url.searchParams.get('t'), range, referer: request.headers.referer });
    const match = range && /^bytes=(\d+)-$/.exec(range);
    const start = match ? Number(match[1]) : 0;
    if (start >= body.length) { response.writeHead(416); response.end(); return; }
    response.writeHead(range ? 206 : 200, {
      'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="file-ab12.bin"',
      'Accept-Ranges': 'bytes', 'Content-Length': body.length - start,
      ...(range ? { 'Content-Range': `bytes ${start}-${body.length - 1}/${body.length}` } : {}),
      'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range',
      'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store',
    });
    if (url.searchParams.get('t') === 'interrupt' && !range) {
      response.write(body.subarray(0, 65536));
      setTimeout(() => response.destroy(), 20);
    } else response.end(body.subarray(start));
  });
  await new Promise<void>((resolve) => door.listen(0, '127.0.0.1', resolve));
  const address = door.address();
  if (!address || typeof address === 'string') throw new Error('No local door');
  origin = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => { await new Promise<void>((resolve) => door.close(() => resolve())); });

test('real delivery link navigates without Referer; Range resumes the interrupted bytes', async ({ page }) => {
  seen.length = 0;
  await page.route('https://api.preview.test/**', route => route.fulfill({
    status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': 'http://127.0.0.1:4178', 'access-control-allow-credentials': 'true' },
    body: JSON.stringify(delivery(permission('interrupt'))),
  }));
  await page.goto('/tests/preview-browser/index.html?gateway=1');
  const link = page.getByRole('link', { name: 'Download file' });
  await expect(link).toHaveAttribute('href', permission('interrupt').browser_url);
  await expect(link).toHaveAttribute('referrerpolicy', 'no-referrer');
  await link.click();
  await expect.poll(() => seen.length).toBeGreaterThan(0);
  expect(seen[0]).toEqual({ token: 'interrupt', range: undefined, referer: undefined });
  const resumed = await page.evaluate(async url => {
    const response = await fetch(url, { headers: { Range: 'bytes=65536-' } });
    return { status: response.status, size: (await response.arrayBuffer()).byteLength, contentRange: response.headers.get('Content-Range') };
  }, permission('interrupt').browser_url);
  expect(resumed).toEqual({ status: 206, size: body.length - 65536, contentRange: `bytes 65536-${body.length - 1}/${body.length}` });
  expect(seen[1]).toMatchObject({ token: 'interrupt', range: 'bytes=65536-' });
});

test('real Restart control requests restart, renders the new URL, and completes from byte zero', async ({ page }) => {
  seen.length = 0;
  const posts: unknown[] = [];
  let current: ReturnType<typeof permission> | null = null;
  await page.route('https://api.preview.test/**', async route => {
    if (route.request().method() === 'POST') {
      posts.push(route.request().postDataJSON());
      current = permission('reissued');
      await route.fulfill({ status: 201, contentType: 'application/json', headers: { 'access-control-allow-origin': 'http://127.0.0.1:4178', 'access-control-allow-credentials': 'true' }, body: JSON.stringify(current) });
    } else await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': 'http://127.0.0.1:4178', 'access-control-allow-credentials': 'true' }, body: JSON.stringify(delivery(current)) });
  });
  await page.goto('/tests/preview-browser/index.html?gateway=1');
  await page.getByRole('button', { name: 'Restart download' }).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts).toEqual([{ mode: 'restart' }]);
  const link = page.getByRole('link', { name: 'Download file' });
  await expect(link).toHaveAttribute('href', permission('reissued').browser_url);
  const download = page.waitForEvent('download');
  await link.click();
  expect(await (await download).failure()).toBeNull();
  expect(seen[0]).toEqual({ token: 'reissued', range: undefined, referer: undefined });
});

test('Verify file in the real component reports both a match and a mismatch', async ({ page }) => {
  await page.route('https://api.preview.test/**', route => route.fulfill({
    status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': 'http://127.0.0.1:4178', 'access-control-allow-credentials': 'true' },
    body: JSON.stringify(delivery(null)),
  }));
  await page.goto('/tests/preview-browser/index.html?gateway=1');
  const picker = page.getByLabel('Verify file');
  await picker.setInputFiles({ name: 'file-ab12.bin', mimeType: 'application/octet-stream', buffer: body });
  await expect(page.getByRole('status')).toHaveText('File matches the committed SHA-256.');
  await picker.setInputFiles({ name: 'file-ab12.bin', mimeType: 'application/octet-stream', buffer: Buffer.from('different') });
  await expect(page.getByRole('status')).toHaveText('File does not match. Report a problem.');
});
