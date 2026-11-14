# Offline service worker

Added 14 Nov 2026 (ticket #51, Fred). `public/sw.js` keeps this site's own files on the visitor's device so the installed app opens without a signal. It never stores user data and never touches requests to other sites (the weather services, Cloudflare analytics).

- **Strategy:** network first for every file, falling back to the device copy only when the network fails, so a deploy shows on the next online load. Fonts come from the device copy first: they never change under the same name.
- **After changing a listed file:** run `node scripts/sw-version.mjs`. It sets `BUILD` in `sw.js` to a hash of the listed files; `test/sw.test.mjs` fails until it matches. A new `BUILD` makes browsers store a fresh copy and delete the old one.
- **Adding a page or script:** add it to `SHELL` in `sw.js` (the test fails for a missing script module or guide page), then run the script above.
- `public/_headers` serves `/sw.js` with `Cache-Control: no-cache`, so browsers check it on every visit.
- Local development: the app registers the worker only off `localhost`, or with `?sw` in the address.

## Kill switch

If the service worker ever misbehaves, replace `public/sw.js` with the file below and deploy. On each visitor's next visit it deletes SCND's stored copy, unregisters itself and reloads open pages from the network. Keep it deployed for a few weeks, then remove the registration from `app.js` (search for `serviceWorker`) before deleting `sw.js`.

```js
// SCND service worker kill switch: removes the offline copy and this worker from every visitor.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('scnd-')).map((k) => caches.delete(k)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach((c) => c.navigate(c.url));
  })());
});
```
