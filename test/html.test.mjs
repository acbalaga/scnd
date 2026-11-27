import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

// Pre-launch audit H-4: the link is shared on Facebook and LinkedIn, which build the preview from these tags.
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const meta = (attr, key) => html.match(new RegExp(`<meta ${attr}="${key}" content="([^"]+)"`))?.[1];

test('html: share preview tags are present and the image is an absolute URL to a file we ship', () => {
  for (const k of ['og:title', 'og:description', 'og:url', 'og:image', 'og:type', 'og:image:width', 'og:image:height', 'og:image:alt']) assert.ok(meta('property', k), k);
  assert.equal(meta('name', 'twitter:card'), 'summary_large_image');
  const img = meta('property', 'og:image');
  assert.match(img, /^https:\/\/myscnd\.app\//);
  assert.ok(existsSync(new URL('../public' + new URL(img).pathname, import.meta.url)), img);
  assert.match(html, /<link rel="canonical" href="https:\/\/myscnd\.app\/">/);
  assert.equal(meta('property', 'og:url'), 'https://myscnd.app/');
});

// Tip line and footer (2 Oct 2026): plain links only, hidden when their constant is empty, no third-party embed.
const app = readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');

test('html: tip and feedback links are plain, hardened, and driven by constants', () => {
  assert.match(app, /const KOFI_URL = 'https:\/\/ko-fi\.com\/alfredbalaga';/);
  assert.match(app, /const QR_PH_SRC = '\/assets\/qr-ph\.png';/);
  assert.match(app, /const PAYEE_NAME = '/);
  assert.match(app, /const FEEDBACK_URL = '/);
  const anchors = [...html.matchAll(/<a [^>]*target="_blank"[^>]*>/g)].map((m) => m[0]);
  assert.ok(anchors.length >= 3, 'feedback and two Ko-fi links');
  for (const a of anchors) assert.match(a, /rel="noopener noreferrer"/);
  for (const a of anchors.filter((x) => /kofiHref|feedbackHref/.test(x))) assert.match(a, /x-show="(kofiHref|feedbackHref)( && [^"]+)?"/);
  assert.doesNotMatch(html, /ko-fi\.com\/widget|storage\.ko-fi|<iframe/i);
});

test('html: the footer Ko-fi link hides while the tip box shows, so only one Ko-fi link is on screen', () => {
  const foot = html.slice(html.indexOf('<footer class="foot">'));
  assert.match(html, /class="card tipjar" x-show="showSheet && sheet"/);
  assert.match(foot, /<a :href="kofiHref" x-show="kofiHref && !\(showSheet && sheet\)"/);
});

test('html: the tip block sits after the findings sheet, so it never shows on landing or above the results', () => {
  assert.ok(html.indexOf('class="card tipjar"') > html.indexOf('id="findings"'));
  assert.match(html, /class="card tipjar" x-show="showSheet && sheet"/);
  assert.match(html, /<template x-if="qrOk">\s*<details class="qr">/);   // the image is not requested until the probe finds the file
  assert.match(html, /<img :src="qrSrc"[^>]* alt="QR Ph code/);
});

// Pre-launch audit M-6, M-7, M-11 (2 Oct 2026).
test('html: a failed script start leaves a visible message, and app.js removes it on a good start', () => {
  assert.match(html, /<p id="boot" class="boot boot-js" role="status">[^<]+<\/p>\s*<noscript>/);
  assert.ok(html.indexOf('id="boot"') < html.indexOf('<main x-data'), 'the message sits outside <main>, which x-cloak hides');
  assert.match(app, /document\.getElementById\('boot'\)\?\.remove\(\)/);
});

test('html: there is a 404 page with a way home, and wrangler serves it', () => {
  const page = readFileSync(new URL('../public/404.html', import.meta.url), 'utf8');
  assert.match(page, /<a href="\/">/);
  assert.match(page, /noindex/);
  assert.match(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'), /"not_found_handling": "404-page"/);
});

test('html: the footer says who runs SCND and where a data question goes', () => {
  const foot = html.slice(html.indexOf('<footer class="foot">'));
  assert.match(foot, /Alfred Balaga, who runs SCND as a personal project/);
  assert.match(foot, /to have a feedback answer deleted, use "Give feedback"/);
  assert.match(foot, /<p class="foot-note" x-show="feedbackHref">Please leave bill and account numbers out of feedback\.<\/p>/);
});

test('html: the footer links to the source code and names its licence (AGPL-3.0 section 13)', () => {
  const foot = html.slice(html.indexOf('<footer class="foot">'));
  assert.match(foot, /<a href="https:\/\/github\.com\/acbalaga\/scnd" target="_blank" rel="noopener noreferrer">Source code<\/a> \(AGPL-3\.0\)\./);
  assert.match(readFileSync(new URL('../LICENSE', import.meta.url), 'utf8'), /GNU AFFERO GENERAL PUBLIC LICENSE\s+Version 3/);
});

// Guide pages (Reach batch, 31 Oct 2026): plain HTML for search and sharing. No script beyond the theme line, which
// must be byte-identical to index.html's so the CSP hash in public/_headers covers it.
import { readdirSync } from 'node:fs';
const guideDir = new URL('../public/guide/', import.meta.url);
const guides = readdirSync(guideDir).filter((f) => f.endsWith('.html'));
const themeLine = html.match(/<script>try\{var t=localStorage[^<]*<\/script>/)[0];

test('guides: each page has a title, description, matching canonical and only the shared theme script', () => {
  assert.ok(guides.length >= 4);
  for (const f of guides) {
    const g = readFileSync(new URL(f, guideDir), 'utf8'), slug = f.replace(/\.html$/, '');
    assert.match(g, /<title>[^<]+ \| SCND<\/title>/, f);
    assert.match(g, /<meta name="description" content="[^"]{60,}">/, f);
    assert.ok(g.includes(`<link rel="canonical" href="https://myscnd.app/guide/${slug}">`), f);
    const scripts = g.match(/<script[\s\S]*?<\/script>/g) ?? [];
    assert.deepEqual(scripts, [themeLine], f);
    assert.ok(!g.includes('—'), `${f} has an em dash`);
    assert.equal((g.match(/<h1>/g) ?? []).length, 1, f);
  }
});
test('guides: sitemap and footer links point at files we ship', () => {
  const sitemap = readFileSync(new URL('../public/sitemap.xml', import.meta.url), 'utf8');
  const locs = [...sitemap.matchAll(/<loc>https:\/\/myscnd\.app(\/[^<]*)<\/loc>/g)].map((m) => m[1]);
  const linked = [...html.matchAll(/href="(\/guide\/[^"]+)"/g)].map((m) => m[1]);
  for (const p of [...locs.filter((x) => x !== '/'), ...linked]) assert.ok(existsSync(new URL('../public' + p + '.html', import.meta.url)), p);
  assert.equal(locs.length, guides.length + 1);
});

// Ticket #46: Alpine's CSP build parses template expressions without eval and refuses x-html, arrow functions, `delete`,
// `if` statements, optional chaining, several statements in one handler, writes to DOM properties and globals such as
// Math. Put that logic in a component method instead. A test here is cheaper than finding it in the browser console.
test('templates use only expressions the Alpine CSP build can run', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /\sx-html=/, 'x-html: use paintSvg($el, markup) via x-effect');
  const exprs = [...html.matchAll(/\s((?:x-[\w:.-]+|@[\w.:-]+|:[\w.-]+))="([^"]*)"/g)].map((m) => [m[1], m[2]]);
  const quoted = /'(?:[^'\\]|\\.)*'/g;   // ignore what sits inside string literals
  for (const [name, expr] of exprs) {
    const code = expr.replace(quoted, "''");
    for (const [bad, why] of [[/=>/, 'arrow function'], [/\bdelete\b/, 'delete'], [/\bif\s*\(/, 'if statement'], [/\?\./, 'optional chaining'],
      [/;/, 'more than one statement'], [/\bMath\./, 'global Math'], [/\$el\.[\w]+\s*=(?!=)/, 'write to a DOM property'], [/`/, 'template literal']]) {
      assert.doesNotMatch(code, bad, `${name}="${expr.slice(0, 80)}": ${why}`);
    }
  }
});

// Ticket #55: the README said "94 tests" long after the count moved on. A count goes stale with every ticket, so it is not stated.
test('README does not state a test count', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  assert.doesNotMatch(readme, /\b\d+ tests\b/);
});

// UI audit, 14 Nov 2026 (docs/ui-audit-2026-11-14.md): the order of the lower page is part of the design.
test('html: lower page runs bills, add a bill, weather, totals, next steps; footer keeps the feedback caveat under its link', () => {
  const at = (x) => { const i = html.indexOf(x); assert.ok(i > 0, x); return i; };
  const order = ['<article class="card">', 'id="bills-end"', 'Was it the weather?', 'class="group-h"', 'Payback so far', 'Year over year', 'class="card next"', 'id="findings"', '<footer class="foot">'].map(at);
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  const foot = html.slice(at('<footer class="foot">'));
  assert.ok(foot.indexOf('class="foot-note"') < foot.indexOf('class="foot-guides"'), 'caveat sits before the guides');
  assert.match(foot, /class="foot-data">[^\n]*NASA POWER[^\n]*Weather data by Open-Meteo\.com[^\n]*CC BY 4\.0/, 'a short data credit stays in view');
});
