// Vendored files must not change unnoticed (ticket #41). A new Alpine version is a dependency change: ask Fred first
// (CLAUDE.md working agreement), then update the version and hash here in the same commit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// sha256 of alpinejs@3.17.4 dist/cdn.min.js from npm, checked against the vendored file in the pre-launch audit (2 Oct 2026).
const ALPINE_VERSION = '3.17.4';
const ALPINE_SHA256 = '232519394c6c8fdba6f362b1d9da16106db513cdbf899011f00daab4051df31c';

test('vendored Alpine is the npm release, plus a one-line header naming its version', () => {
  const text = readFileSync(new URL('../public/vendor/alpine.min.js', import.meta.url), 'utf8');
  const nl = text.indexOf('\n');
  assert.match(text.slice(0, nl), new RegExp(`^/\\* Alpine\\.js ${ALPINE_VERSION.replaceAll('.', '\\.')}, MIT licence`));
  assert.equal(createHash('sha256').update(text.slice(nl + 1)).digest('hex'), ALPINE_SHA256);
});
