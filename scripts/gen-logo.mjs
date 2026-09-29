// Generates the SCND logo and app icon as SVG: the letters drawn on a seven-segment LCD, like the display on
// a kWh meter. "5Cnd" on a seven-segment display reads as SCND. Run: node scripts/gen-logo.mjs
// Output: public/icons/logo.svg (wordmark), public/icons/icon.svg (2 by 2 tile). No dependencies.
// PNG icons (apple-touch-icon.png, icon-192.png, icon-512.png, icon-512-maskable.png) are rendered from these
// with scripts/gen-icons.mjs, which needs playwright-core installed locally (dev only).
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const T = { ink: '#0E1B2C', lit: '#FFC83D', ghost: '#FFFFFF' };
const SEGS = { S: 'afgcd', C: 'afed', N: 'egc', D: 'bcdeg', '2': 'abged' };

// One digit cell of width w and height h with segment thickness t. Returns polygon point strings by segment.
function digit(w, h, t, gap = 0.5) {
  const q = t / 2, ym = h / 2;
  const hor = (yc) => `${q + gap},${yc} ${2 * q + gap},${yc - q} ${w - 2 * q - gap},${yc - q} ${w - q - gap},${yc} ${w - 2 * q - gap},${yc + q} ${2 * q + gap},${yc + q}`;
  const ver = (xc, y0, y1) => `${xc},${y0} ${xc + q},${y0 + q} ${xc + q},${y1 - q} ${xc},${y1} ${xc - q},${y1 - q} ${xc - q},${y0 + q}`;
  return {
    a: hor(q), g: hor(ym), d: hor(h - q),
    f: ver(q, q + gap, ym - gap), b: ver(w - q, q + gap, ym - gap),
    e: ver(q, ym + gap, h - q - gap), c: ver(w - q, ym + gap, h - q - gap),
  };
}

function cells(text, w, h, t, x0, y0, gapX, gapY, perRow) {
  const d = digit(w, h, t), out = [];
  [...text].forEach((ch, i) => {
    const cx = x0 + (i % perRow) * (w + gapX), cy = y0 + Math.floor(i / perRow) * (h + gapY);
    const on = SEGS[ch] || '';
    let g = `<g transform="translate(${cx} ${cy})">`;
    for (const [k, pts] of Object.entries(d)) g += `<polygon points="${pts}" fill="${on.includes(k) ? T.lit : T.ghost}" ${on.includes(k) ? '' : 'opacity=".1"'}/>`;
    out.push(g + '</g>');
  });
  return out.join('');
}

// Wordmark: SCND on one line, slightly slanted like an LCD.
{
  const w = 14, h = 24, t = 3.4, pad = 6, gapX = 3.2, W = 2 * pad + 4 * w + 3 * gapX + 4, H = 2 * pad + h;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W.toFixed(1)} ${H}" role="img" aria-label="SCND"><rect width="${W.toFixed(1)}" height="${H}" rx="6" fill="${T.ink}"/><g transform="translate(${pad + 2} ${pad}) skewX(-6)">${cells('SCND', w, h, t, 0, 0, gapX, 0, 4)}</g></svg>\n`;
  writeFileSync(path.join(OUT, 'logo.svg'), svg);
  console.log('logo.svg', W.toFixed(1), 'x', H);
}

// App icon: SC over ND on a square meter face.
{
  const w = 17, h = 23, t = 3.8, gapX = 5, gapY = 5, S = 64, cw = 2 * w + gapX, ch = 2 * h + gapY;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" role="img" aria-label="SCND"><rect width="${S}" height="${S}" rx="14" fill="${T.ink}"/><g transform="translate(${((S - cw) / 2).toFixed(1)} ${((S - ch) / 2).toFixed(1)})">${cells('SCND', w, h, t, 0, 0, gapX, gapY, 2)}</g></svg>\n`;
  writeFileSync(path.join(OUT, 'icon.svg'), svg);
  console.log('icon.svg');
}
