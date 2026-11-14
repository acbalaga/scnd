// SCND service worker (ticket #51, Fred, 14 Nov 2026): the installed app opens without a signal.
// It stores this site's own files on the device, never user data (bills live in page memory, a save file, or the opt-in
// kept copy in local storage, none of which pass through here). Requests to other sites (the two weather services,
// Cloudflare analytics) are not touched, so the weather check needs a connection as before.
// Strategy: network first for every file, so a new deploy shows on the next online load; the device copy is used only
// when the network fails. Fonts never change under the same name (public/_headers caches them a year), so they come
// from the device copy first. Serving scripts from the device copy first would mix a new page with old scripts for one
// load after each deploy.
// BUILD is a hash of the files in SHELL: test/sw.test.mjs fails when a listed file changes and BUILD does not, and
// `node scripts/sw-version.mjs` updates it. A new BUILD installs a fresh copy and deletes the old one.
// Kill switch: docs/SERVICE-WORKER.md has a sw.js that removes itself and its cache from every visitor.
const BUILD = 'f37d26f7ca26';
const CACHE = `scnd-${BUILD}`;
// SHELL-START
const SHELL = [
  "/",
  "/404",
  "/app.css",
  "/manifest.webmanifest",
  "/js/app.js",
  "/js/calc.js",
  "/js/cities.js",
  "/js/data.js",
  "/js/engine.js",
  "/js/examples.js",
  "/js/findings.js",
  "/js/grid.js",
  "/js/reminder.js",
  "/js/sources.js",
  "/js/weather.js",
  "/vendor/alpine.min.js",
  "/data/ph-grid.json",
  "/data/source-status.json",
  "/icons/icon.svg",
  "/icons/logo.svg",
  "/icons/icon-192.png",
  "/fonts/chivo-latin-wght-normal.woff2",
  "/fonts/chivo-peso-wght-normal.woff2",
  "/fonts/chivo-mono-latin-wght-normal.woff2",
  "/fonts/chivo-mono-peso-wght-normal.woff2",
  "/fonts/dseg7-classic-latin-400-normal.woff2",
  "/fonts/dseg7-classic-latin-700-normal.woff2",
  "/fonts/pixelify-sans-latin-400-normal.woff2",
  "/fonts/pixelify-sans-latin-700-normal.woff2",
  "/guide/net-metering-bill",
  "/guide/app-vs-bill",
  "/guide/performance-ratio",
  "/guide/method",
  "/guide/solar-quote-check"
];
// SHELL-END

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('scnd-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname === '/sw.js') return;
  e.respondWith(url.pathname.startsWith('/fonts/') ? deviceFirst(req) : networkFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') return (await cache.match('/')) ?? Response.error();
    return Response.error();
  }
}

// Fonts, including the report fonts, which are stored the first time the findings sheet loads them.
async function deviceFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type === 'basic') cache.put(req, res.clone());
  return res;
}
