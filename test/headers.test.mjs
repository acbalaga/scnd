// Headers and hosting config (ticket #37, 14 Nov 2026). SCND is static assets only, so public/_headers is the one place
// headers are set, and no Worker script may run: a Worker-first path on the Free plan has a daily request cap, and over
// it Cloudflare answers 429 until midnight UTC.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// public/_headers: '# comment', a path pattern at column 0, then indented 'Name: value' lines.
function parseHeaders(text) {
  const rules = {};
  let path = null;
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) { path = line.trim(); rules[path] = {}; continue; }
    const i = line.indexOf(':');
    rules[path][line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  return rules;
}
const all = parseHeaders(read('public/_headers'))['/*'] ?? {};
const CSP = all['content-security-policy'] ?? '';

test('headers: every path gets the CSP and the security headers', () => {
  assert.ok(CSP, 'public/_headers must set Content-Security-Policy on /*');
  assert.equal(all['referrer-policy'], 'no-referrer');
  assert.equal(all['x-content-type-options'], 'nosniff');
  assert.match(all['permissions-policy'], /geolocation=\(self\)/);
  assert.match(all['permissions-policy'], /camera=\(\)/);
  assert.equal(all['x-frame-options'], 'DENY');
  assert.equal(all['cross-origin-opener-policy'], 'same-origin');
  assert.match(CSP, /(^|; )upgrade-insecure-requests(;|$)/);
});

test('headers: fonts are cached for a year as immutable, nothing else is', () => {
  const rules = parseHeaders(read('public/_headers'));
  assert.equal(rules['/fonts/*']['cache-control'], 'public, max-age=31536000, immutable');
  assert.equal(all['cache-control'], undefined);
});

test('headers: CSP allows only this origin, the two irradiance hosts and Cloudflare analytics for connections', () => {
  assert.match(CSP, /(^|; )default-src 'self'(;|$)/);
  assert.match(CSP, /connect-src 'self' https:\/\/satellite-api\.open-meteo\.com https:\/\/power\.larc\.nasa\.gov https:\/\/cloudflareinsights\.com(;|$)/);
  assert.match(CSP, /script-src 'self' 'sha256-[^']+' https:\/\/static\.cloudflareinsights\.com(;|$)/);
  assert.doesNotMatch(CSP, /unsafe-eval/);   // ticket #46: Alpine's CSP build needs no eval
  for (const d of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"]) assert.ok(CSP.includes(d), d);
});

test('headers: the CSP script hash matches the inline theme script on every page', () => {
  const hash = CSP.match(/'(sha256-[^']+)'/)?.[1];
  const pages = ['public/index.html', ...readdirSync(new URL('../public/guide/', import.meta.url)).filter((f) => f.endsWith('.html')).map((f) => `public/guide/${f}`)];
  for (const p of pages) {
    const inline = [...read(p).matchAll(/<script>([\s\S]*?)<\/script>/g)];
    assert.equal(inline.length, 1, `${p}: one inline script`);
    assert.equal(`sha256-${createHash('sha256').update(inline[0][1]).digest('base64')}`, hash, p);
  }
});

test('wrangler: static assets only, no Worker script, unknown paths get the 404 page', () => {
  const cfg = JSON.parse(read('wrangler.jsonc').replace(/^\s*\/\/.*$/gm, ''));
  assert.equal(cfg.main, undefined, 'no Worker script: pages would count against the Free plan daily cap');
  assert.equal(cfg.assets.run_worker_first, undefined);
  assert.equal(cfg.ratelimits, undefined);
  assert.equal(cfg.assets.directory, './public');
  assert.equal(cfg.assets.not_found_handling, '404-page');
  assert.equal(cfg.workers_dev, false);
  assert.equal(cfg.preview_urls, false);
  assert.ok(!existsSync(new URL('../src/worker.js', import.meta.url)));
});
