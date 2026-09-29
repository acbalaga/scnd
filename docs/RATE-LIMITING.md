# Rate limiting

Decided 29 Sep 2026 (Fred): a Cloudflare WAF rate limiting rule was not available on the plan (it showed as an Enterprise add-on), so the limiter is in the Worker, in code.

## What it does

`src/worker.js` runs first on every request (`assets.run_worker_first` in `wrangler.jsonc`) and asks Cloudflare's Workers Rate Limiting binding (`LIMITER`) whether this visitor is over the limit.

- **Limit:** 100 requests per 10 seconds per visitor. One page load is 7 requests to our own host (`/`, `/app.css`, `/js/app.js`, `/vendor/alpine.min.js`, `/js/calc.js`, `/js/grid.js`, `/data/ph-grid.json`). Save, load, print and the two weather calls do not touch our host. A person clicking around never gets near the limit.
- **Why loose:** many Philippine mobile users share one public IP behind carrier-grade NAT. A tight limit would block real owners along with bots. Lower it only if the daily request count shows a real flood.
- **Over the limit:** `429` with `Retry-After: 10` and `Cache-Control: no-store`, and a one-line plain message.
- **Key:** the first 16 bytes of SHA-256 over `IP|UTC date`, in hex. The raw IP is never our key, and counters reset by themselves at midnight UTC. Cloudflare holds the counters. We do not log or store anything, and we never read user inputs.
- **Fails open:** if the binding is missing, errors, or there is no client IP, the visitor is served. The limiter must never take the site down.

To change the numbers, edit `ratelimits` in `wrangler.jsonc` (`limit`, and `period`, which Cloudflare allows as 10 or 60 seconds).

## Trade-offs

- **Every request is a Worker request.** Static asset requests are normally free and unlimited, but with `run_worker_first` they run the Worker. Free plan: 100,000 Worker requests a day. About 14,000 page loads a day would reach it. A flood that the limiter blocks still counts against the cap, so a big enough flood can take the site down for the rest of the day. Watch the daily request count in the Cloudflare dashboard during beta. If traffic or bots grow, move to the Workers Paid plan.
- **Counts are approximate.** The binding is per Cloudflare location and eventually consistent, so the limit is permissive, not exact. That is fine for stopping floods.
- **Preview URLs are covered too.** The limiter is in the Worker, so `workers.dev` preview URLs are limited as well.
- **Not a defence against a large distributed attack.** Cloudflare's built-in DDoS protection is the layer for that, and it is on by default.

## Checked

Under `wrangler dev` (Workers runtime, local), 150 rapid requests from one visitor gave 100 served and 50 blocked with `429`; a second visitor was unaffected; the first visitor was served again after 10 seconds; static files were served; the removed `/api/pvgis` route returned 404. Unit tests are in `test/worker.test.mjs`. Local counters are exact, production counters are approximate (above).

## Check it after deploy

From your own connection (not a shared one), expect some `429` once you pass the limit, then `200` again after about 10 seconds:

```
for i in $(seq 1 150); do curl -s -o /dev/null -w "%{http_code}\n" https://<your SCND hostname>/; done | sort | uniq -c
```
