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
