// Vendored files must not change unnoticed (ticket #41). A new Alpine version is a dependency change: ask Fred first
// (CLAUDE.md working agreement), then update the version and hash here in the same commit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// sha256 of @alpinejs/csp@3.17.4 dist/cdn.min.js from npm (tarball sha1 e679eb03 and sha512 checked against the registry,
// 14 Nov 2026, ticket #46). The CSP build parses template expressions without eval, so the CSP needs no 'unsafe-eval'.
const ALPINE_VERSION = '3.17.4';
const ALPINE_SHA256 = '0d18d7f8d7910e2e0212f0f056b12f50bebc3abb7d88d2f7c7cb4c336fe4519a';

test('vendored Alpine is the npm CSP build, plus a one-line header naming its version', () => {
  const text = readFileSync(new URL('../public/vendor/alpine.min.js', import.meta.url), 'utf8');
  const nl = text.indexOf('\n');
  assert.match(text.slice(0, nl), new RegExp(`^/\\* Alpine\\.js CSP build \\(@alpinejs/csp\\) ${ALPINE_VERSION.replaceAll('.', '\\.')}, MIT licence`));
  assert.equal(createHash('sha256').update(text.slice(nl + 1)).digest('hex'), ALPINE_SHA256);
});
