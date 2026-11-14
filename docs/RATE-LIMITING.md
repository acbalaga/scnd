# Rate limiting (retired 14 Nov 2026)

**Retired (Fred, 14 Nov 2026, ticket #37).** The limiter below ran in a Worker on every page request. On the Free plan that gave the site a daily cap of 100,000 Worker requests, and in production the limiter did not block (see "Observed in production"), so one fast client could spend the day's quota in about 22 minutes and leave the site answering `429` until 08:00 PH. SCND is now static assets only: `wrangler.jsonc` has no `main`, headers come from `public/_headers`, and static asset requests are free and unlimited. Cloudflare's built-in DDoS protection still applies. The Worker code is in git history, last at commit `fb8fc5a`. The rest of this file is the record of what it did.


Decided 29 Sep 2026 (Fred): a Cloudflare WAF rate limiting rule was not available on the plan (it showed as an Enterprise add-on), so the limiter is in the Worker, in code.

## What it does

`src/worker.js` runs first on the page itself (`/`, unknown paths and 404s; `assets.run_worker_first` in `wrangler.jsonc`) and asks Cloudflare's Workers Rate Limiting binding (`LIMITER`) whether this visitor is over the limit. Static files (`/js/`, `/vendor/`, `/fonts/`, `/icons/`, `/data/`, `app.css`, the manifest) go straight to the asset server and are not counted (changed 2 Oct 2026, pre-launch audit H-2).

- **Limit:** 100 requests per 10 seconds per visitor, counted on page requests only. One page load is 1 Worker request (it was 14 when static files ran the Worker too: the page, stylesheet, 7 scripts, 3 fonts, 2 icons, measured in headless Chromium). Save, load, print and the two weather calls do not touch the Worker. A person clicking around never gets near the limit.
- **Why loose:** many Philippine mobile users share one public IP behind carrier-grade NAT. A tight limit would block real owners along with bots. Lower it only if the daily request count shows a real flood.
- **Over the limit:** `429` with `Retry-After: 10` and `Cache-Control: no-store`, and a one-line plain message.
- **Key:** the first 16 bytes of SHA-256 over `IP|UTC date`, in hex. The raw IP is never our key, and counters reset by themselves at midnight UTC. Cloudflare holds the counters. We do not log or store anything, and we never read user inputs.
- **Fails open:** if the binding is missing, errors, or there is no client IP, the visitor is served. The limiter must never take the site down.

To change the numbers, edit `ratelimits` in `wrangler.jsonc` (`limit`, and `period`, which Cloudflare allows as 10 or 60 seconds).

## Trade-offs

- **Only the page is a Worker request.** Static asset requests are free and unlimited, so they skip the Worker. Free plan: 100,000 Worker requests a day, so about 100,000 page loads a day (it was about 7,000 when every file ran the Worker). Over the cap, Cloudflare answers `429` on Worker-first paths, which includes the page, until the count resets at 00:00 UTC (8 am in the Philippines). A flood that the limiter blocks still counts against the cap. Watch the daily request count in the Cloudflare dashboard after the public share. If traffic or bots grow, move to the Workers Paid plan.
- **Static files carry `nosniff` and `no-referrer` from `public/_headers`,** not from the Worker. The CSP stays on the page, where it applies.
- **Counts are approximate.** The binding is per Cloudflare location and eventually consistent, so the limit is permissive, not exact. That is fine for stopping floods.
- **Preview URLs are covered too.** The limiter is in the Worker, so `workers.dev` preview URLs are limited as well.
- **Not a defence against a large distributed attack.** Cloudflare's built-in DDoS protection is the layer for that, and it is on by default.

## Checked

Under `wrangler dev` (Workers runtime, local), 150 rapid requests from one visitor gave 100 served and 50 blocked with `429`; a second visitor was unaffected; the first visitor was served again after 10 seconds; static files were served; the removed `/api/pvgis` route returned 404. Unit tests are in `test/worker.test.mjs`. Local counters are exact, production counters are approximate (above).

## Observed in production (2 Oct 2026)

Three runs of 150 requests from one connection against https://myscnd.app/ (one sequential, two with `xargs -P 20`, the fastest about 75 requests a second) all returned `200`, none `429`. The `x-limiter` response header read `ok` on every request, which means the binding was present and `limit()` ran without error. So in production the limiter did not block at the configured 100 per 10 seconds, although it did under `wrangler dev`. The likely cause is that the binding is per location and eventually consistent (see Trade-offs), but this is not confirmed. Treat it as a loose backstop against floods, not a hard cap. The daily request count against the Free plan limit and Cloudflare's built-in DDoS protection are the real protection.

`x-limiter` is on every response: `ok`, `blocked`, `open-no-ip`, `open-no-binding` or `open-error`. Check it with `curl -sI https://myscnd.app/ | grep -i x-limiter`.

## Check it after deploy

From your own connection (not a shared one), expect some `429` once you pass the limit, then `200` again after about 10 seconds:

```
for i in $(seq 1 150); do curl -s -o /dev/null -w "%{http_code}\n" https://<your SCND hostname>/; done | sort | uniq -c
```
