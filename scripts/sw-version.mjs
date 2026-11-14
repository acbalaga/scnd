// Updates BUILD in public/sw.js to a hash of the files its SHELL lists (ticket #51). Run after changing any of them:
//   node scripts/sw-version.mjs
// test/sw.test.mjs fails until BUILD matches, so a deploy cannot leave visitors on an old device copy.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const SW = path.join(ROOT, 'sw.js');

// Shell entries are URLs; clean URLs map to their .html file the way Cloudflare serves them.
export function fileFor(url) {
  if (url === '/') return path.join(ROOT, 'index.html');
  if (/^\/guide\/[^./]+$/.test(url)) return path.join(ROOT, `${url}.html`);
  if (url === '/404') return path.join(ROOT, '404.html');
  return path.join(ROOT, url);
}
export function shellOf(text) {
  return JSON.parse(text.slice(text.indexOf('const SHELL = ') + 'const SHELL = '.length, text.indexOf(';\n// SHELL-END')));
}
export function buildHash(text) {
  const h = createHash('sha256');
  for (const url of shellOf(text)) h.update(url).update('\0').update(readFileSync(fileFor(url))).update('\0');
  return h.digest('hex').slice(0, 12);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = readFileSync(SW, 'utf8'), build = buildHash(text);
  writeFileSync(SW, text.replace(/const BUILD = '[^']*';/, `const BUILD = '${build}';`));
  console.log(`public/sw.js BUILD = ${build}`);
}
