// Service worker (ticket #51).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { shellOf, buildHash, fileFor } from '../scripts/sw-version.mjs';

const text = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const shell = shellOf(text);

test('sw: every file in the shell exists', () => {
  for (const url of shell) assert.ok(existsSync(fileFor(url)), url);
});
test('sw: BUILD matches the shell files (run `node scripts/sw-version.mjs` after changing one)', () => {
  assert.equal(text.match(/const BUILD = '([^']*)';/)[1], buildHash(text));
});
test('sw: every script module and guide page is in the shell, so the app works offline', () => {
  for (const f of readdirSync(new URL('../public/js/', import.meta.url)).filter((f) => f.endsWith('.js'))) assert.ok(shell.includes(`/js/${f}`), f);
  for (const f of readdirSync(new URL('../public/guide/', import.meta.url)).filter((f) => f.endsWith('.html'))) assert.ok(shell.includes(`/guide/${f.slice(0, -5)}`), f);
  assert.ok(shell.includes('/') && shell.includes('/data/ph-grid.json') && shell.includes('/vendor/alpine.min.js'));
});
test('sw: requests to other sites (weather services, analytics) are never handled', () => {
  assert.match(text, /url\.origin !== self\.location\.origin/);
  assert.doesNotMatch(text, /open-meteo|nasa\.gov|cloudflareinsights/);
});
test('sw: served uncached, and allowed by the CSP', () => {
  const h = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
  assert.match(h, /\n\/sw\.js\n\s+Cache-Control: no-cache/);
  assert.match(h, /Content-Security-Policy: [^\n]*worker-src 'self'/);
});
