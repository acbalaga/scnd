import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';

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
