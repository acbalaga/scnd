import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import worker from '../src/worker.js';
import { CSP, THEME_SCRIPT_HASH } from '../src/headers.js';

const asset = new Response('static file', { status: 200 });
const req = (ip) => new Request('https://scnd.example/', { headers: ip ? { 'cf-connecting-ip': ip } : {} });
const envWith = (limit) => ({ ASSETS: { fetch: async () => asset.clone() }, LIMITER: { limit } });

test('worker golden: under the limit serves the static file', async () => {
  const res = await worker.fetch(req('203.0.113.7'), envWith(async () => ({ success: true })));
  assert.equal(res.status, 200); assert.equal(await res.text(), 'static file');
});
test('worker golden: over the limit returns 429 with Retry-After and no-store, and does not serve the file', async () => {
  const res = await worker.fetch(req('203.0.113.7'), envWith(async () => ({ success: false })));
  assert.equal(res.status, 429); assert.equal(res.headers.get('retry-after'), '10'); assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.match(await res.text(), /Too many requests/);
});
test('worker: the limiter key is a hash, never the raw IP, and is stable within a day', async () => {
  const keys = [];
  const env = envWith(async ({ key }) => { keys.push(key); return { success: true }; });
  await worker.fetch(req('203.0.113.7'), env); await worker.fetch(req('203.0.113.7'), env); await worker.fetch(req('198.51.100.9'), env);
  assert.ok(!keys[0].includes('203') && !keys[0].includes('.'));
  assert.match(keys[0], /^[0-9a-f]{32}$/); assert.equal(keys[0], keys[1]); assert.notEqual(keys[0], keys[2]);
});
test('worker edge: fails open when the limiter throws, is missing, or there is no client IP', async () => {
  assert.equal((await worker.fetch(req('203.0.113.7'), envWith(async () => { throw new Error('down'); }))).status, 200);
  assert.equal((await worker.fetch(req('203.0.113.7'), { ASSETS: { fetch: async () => asset.clone() } })).status, 200);
  let called = false;
  assert.equal((await worker.fetch(req(null), envWith(async () => { called = true; return { success: false }; }))).status, 200);
  assert.equal(called, false);
});

test('worker golden: every response carries the CSP and security headers, including 429s', async () => {
  for (const limit of [async () => ({ success: true }), async () => ({ success: false })]) {
    const res = await worker.fetch(req('203.0.113.7'), envWith(limit));
    assert.equal(res.headers.get('content-security-policy'), CSP);
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.match(res.headers.get('permissions-policy'), /geolocation=\(self\)/);
  }
});
test('worker: CSP allows only this origin plus the two irradiance hosts for connections', () => {
  assert.match(CSP, /connect-src 'self' https:\/\/satellite-api\.open-meteo\.com https:\/\/power\.larc\.nasa\.gov(;|$)/);
  assert.match(CSP, /frame-ancestors 'none'/);
});
test('worker: THEME_SCRIPT_HASH matches the inline script in index.html', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(inline.length, 1);
  assert.equal(`sha256-${createHash('sha256').update(inline[0][1]).digest('base64')}`, THEME_SCRIPT_HASH);
});

test('worker golden: x-limiter header names the path taken', async () => {
  const h = async (r, env) => (await worker.fetch(r, env)).headers.get('x-limiter');
  assert.equal(await h(req('203.0.113.7'), envWith(async () => ({ success: true }))), 'ok');
  assert.equal(await h(req('203.0.113.7'), envWith(async () => ({ success: false }))), 'blocked');
  assert.equal(await h(req('203.0.113.7'), envWith(async () => { throw new Error('down'); })), 'open-error');
  assert.equal(await h(req('203.0.113.7'), { ASSETS: { fetch: async () => asset.clone() } }), 'open-no-binding');
  assert.equal(await h(req(null), envWith(async () => ({ success: true }))), 'open-no-ip');
});

// workerd treats every named export of the main module as an entrypoint and refuses to start when one is not a
// handler ("Incorrect type for map entry 'CSP'"), so `wrangler dev` crashed. Constants live in src/headers.js.
test('worker: the main module exports only the default handler', async () => {
  const mod = await import('../src/worker.js');
  assert.deepEqual(Object.keys(mod), ['default']);
});
