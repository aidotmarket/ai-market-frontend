import { test, expect } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';

test.use({ launchOptions: { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' } });

let server: Server;
let origin: string;
let directory: string;
let workerCode: string;
const body = Buffer.alloc(1024 * 1024, 0x41);
const size = body.length;
const requests: Array<{ token: string; range: string | undefined }> = [];

test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'gateway-door-'));
  const result = await build({ entryPoints: ['components/orders/verifyGatewayFile.worker.ts'], bundle: true, write: false, format: 'iife', platform: 'browser' });
  workerCode = result.outputFiles[0].text;
  server = createServer((request, response) => {
    if (request.url === '/worker.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript' });
      response.end(workerCode);
      return;
    }
    if (request.url?.startsWith('/verify')) {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end('<input id="picked" type="file"><p id="result"></p><script>document.querySelector("input").onchange=()=>{const worker=new Worker("/worker.js");worker.onmessage=e=>{if(e.data.result)document.querySelector("#result").textContent=e.data.result};worker.postMessage({file:document.querySelector("input").files[0],expected:new URLSearchParams(location.search).get("sha")})}</script>');
      return;
    }
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname !== '/v1/files/ab12') { response.writeHead(404); response.end(); return; }
    const token = url.searchParams.get('t') ?? '';
    const range = request.headers.range;
    requests.push({ token, range });
    let start = 0;
    let end = size - 1;
    if (range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range);
      if (!match) { response.writeHead(416); response.end(); return; }
      start = Number(match[1]);
      end = match[2] ? Number(match[2]) : end;
    }
    if (start > end || end >= size) { response.writeHead(416); response.end(); return; }
    response.writeHead(range ? 206 : 200, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="file-ab12.bin"',
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}),
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store',
    });
    if (token === 'interrupt' && !range) {
      response.write(body.subarray(0, 65536));
      setTimeout(() => response.destroy(), 20);
    } else response.end(body.subarray(start, end + 1));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No local door');
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(directory, { recursive: true, force: true });
});

test('navigation starts an interrupted download; Range resumes its remaining bytes', async ({ page }) => {
  requests.length = 0;
  await page.goto(`${origin}/verify`);
  await page.setContent(`<a href="${origin}/v1/files/ab12?t=interrupt">Download</a>`);
  await page.getByText('Download').click();
  await expect.poll(() => requests.length).toBeGreaterThan(0);
  expect(requests[0]).toEqual({ token: 'interrupt', range: undefined });
  const result = await page.evaluate(async (url) => {
    const response = await fetch(url, { headers: { Range: 'bytes=65536-' } });
    return { status: response.status, length: (await response.arrayBuffer()).byteLength, contentRange: response.headers.get('Content-Range') };
  }, `${origin}/v1/files/ab12?t=interrupt`);
  expect(result).toEqual({ status: 206, length: size - 65536, contentRange: `bytes 65536-${size - 1}/${size}` });
});

test('a re-issued browser URL restarts at byte zero and completes', async ({ page }) => {
  requests.length = 0;
  await page.goto(`${origin}/verify`);
  const download = page.waitForEvent('download');
  await page.setContent(`<a href="${origin}/v1/files/ab12?t=reissued">Restart download</a>`);
  await page.getByText('Restart download').click();
  const item = await download;
  expect(await item.failure()).toBeNull();
  expect(requests[0]).toEqual({ token: 'reissued', range: undefined });
});

test('the actual worker verifies a generated 2 GiB file in Chromium', async ({ page }) => {
  test.setTimeout(180000);
  const path = join(directory, 'two-gib.bin');
  const handle = await open(path, 'w');
  await handle.truncate(2 * 1024 * 1024 * 1024);
  await handle.close();
  const hash = createHash('sha256');
  const zero = Buffer.alloc(8 * 1024 * 1024);
  for (let i = 0; i < 256; i++) hash.update(zero);
  await page.goto(`${origin}/verify?sha=${hash.digest('hex')}`);
  await page.locator('#picked').setInputFiles(path);
  await expect(page.locator('#result')).toHaveText('match', { timeout: 150000 });
});
