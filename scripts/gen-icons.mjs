// Renders the PNG app icons from public/icons/icon.svg with headless Chromium. Dev only.
// Needs playwright-core installed somewhere on the path, and CHROMIUM=/path/to/chrome.
// Run: node scripts/gen-icons.mjs
// PNGs are full-bleed squares: iOS and Android apply their own corner mask. The maskable icon keeps the mark inside the inner 80%.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const svg = readFileSync(path.join(DIR, 'icon.svg'), 'utf8').replace(' rx="14"', ' rx="0"');
const maskable = svg.replace(/(<g transform="translate\()([^)]*)(\)">)/, (_, a, xy, c) => { const [x, y] = xy.split(' ').map(Number); return `<g transform="translate(6.4 6.4) scale(.8) translate(${x} ${y})">`; });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--no-sandbox'] });
for (const [file, size, body] of [['apple-touch-icon.png', 180, svg], ['icon-192.png', 192, svg], ['icon-512.png', 512, svg], ['icon-512-maskable.png', 512, maskable]]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<html><body style="margin:0">${body.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: path.join(DIR, file) });
  await page.close();
}
await browser.close();
