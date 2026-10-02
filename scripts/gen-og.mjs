// Renders the link-preview image (public/icons/og.png, 1200 x 630) that Facebook, LinkedIn and others show when the
// link is shared. Dev only, same setup as gen-icons.mjs: playwright-core on the path and CHROMIUM=/path/to/chrome.
// Run: node scripts/gen-og.mjs
// Uses the wordmark and the self-hosted fonts, so the card matches the site. Pixelify Sans only on words with no
// capital C (it closes the C, see docs/NEXT.md task 12); the rest is Source Sans 3.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const PUB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const font = (f) => pathToFileURL(path.join(PUB, 'fonts', f)).href;
const logo = readFileSync(path.join(PUB, 'icons', 'logo.svg'), 'utf8').replace('<svg ', '<svg width="245" height="108" ');

const html = `<!doctype html><html><head><style>
@font-face { font-family:"Pixelify Sans"; font-weight:700; src:url("${font('pixelify-sans-latin-700-normal.woff2')}"); }
@font-face { font-family:"Source Sans 3"; font-weight:400; src:url("${font('source-sans-3-latin-400-normal.woff2')}"); }
@font-face { font-family:"Source Sans 3"; font-weight:600; src:url("${font('source-sans-3-latin-600-normal.woff2')}"); }
html, body { margin:0; }
body { width:1200px; height:630px; box-sizing:border-box; padding:72px 80px; background:#0A1424;
  background-image:linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px);
  background-size:30px 30px; color:#E8EEF6; font-family:"Source Sans 3", sans-serif; display:flex; flex-direction:column; }
h1 { font:700 76px/1.05 "Pixelify Sans", sans-serif; margin:52px 0 22px; color:#fff; }
p { font-size:34px; line-height:1.3; margin:0; color:#C9D6E6; max-width:960px; }
.foot { margin-top:auto; display:flex; justify-content:space-between; align-items:flex-end; font-size:28px; color:#9DB0C7; }
.foot b { color:#FFC83D; font-weight:600; font-size:32px; }
</style></head><body>
${logo}
<h1>Is your solar doing its job?</h1>
<p>A free check for Philippine rooftop solar, from your own bill and inverter app. What you type stays in your browser.</p>
<div class="foot"><span>Performance, savings and questions for your installer</span><b>myscnd.app</b></div>
</body></html>`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--no-sandbox', '--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
const tmp = path.join(PUB, '..', 'scripts', '.og.html');
const { writeFileSync, unlinkSync } = await import('node:fs');
writeFileSync(tmp, html);
await page.goto(pathToFileURL(tmp).href);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: path.join(PUB, 'icons', 'og.png') });
unlinkSync(tmp);
await browser.close();
