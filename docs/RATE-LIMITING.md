# Rate limiting

Decided 29 Sep 2026 (Fred): use a Cloudflare WAF rate limiting rule on the custom domain. No code, nothing stored by us, no Worker requests used. `src/worker.js` stays a pass-through.

## Why this way

- Requests for static files never run the Worker, and Cloudflare does not bill or cap static asset requests. A bot hitting the page costs nothing and there is no backend or paid upstream behind it.
- The only real cost of bot traffic is noise in any counter we might add later. A rule at the edge stops it before it reaches the site.
- A Worker-based limiter would need `run_worker_first`, so every request becomes a Worker call. That is billable, and a flood could hit the free daily cap and take the site down. It would also key on IP inside our own code, which stretches CLAUDE.md rule 2.

## What a normal visit looks like

One page load is 7 requests to our own host (`/`, `/app.css`, `/js/app.js`, `/vendor/alpine.min.js`, `/js/calc.js`, `/js/grid.js`, `/data/ph-grid.json`), measured in headless Chromium. Everything else the app does is in the browser: save, load, print, and the two weather calls go to Open-Meteo and NASA POWER, not to us. A person clicking around never gets near 20 requests in 10 seconds.

## The rule (set in the Cloudflare dashboard by Fred)

Security, then WAF, then Rate limiting rules, then Create rule, on the zone that holds the SCND custom domain.

| Setting | Suggested value |
| --- | --- |
| Rule name | `scnd bot flood` |
| If incoming requests match | Custom filter expression: `(http.host eq "<your SCND hostname>")` |
| Characteristics | IP |
| Requests | 100 |
| Period | 10 seconds |
| Action | Block |
| Duration | 10 seconds (or the longest your plan allows) |

Why 100 per 10 seconds and not tighter: many Philippine mobile users share one public IP behind carrier-grade NAT, so a strict limit would block real owners along with bots. Treat 100 as a starting point and lower it only if the Security events log shows a real flood.

Plan limits change: the number of rules, the allowed periods and the allowed durations depend on the Cloudflare plan. Check what the dashboard offers for your plan and pick the closest values. If only one rule is allowed, use the one above.

## Not covered

- Per-version preview URLs (`*.workers.dev`) are not on the zone, so the rule does not apply to them. They are unlisted and for beta testers.
- This does not stop a determined, distributed attack. Cloudflare's built-in DDoS protection is the layer for that and is on by default.

## Check it works

From a terminal, after saving the rule (expect HTTP 429 or a block page once you pass the limit, then normal again after the duration):

```
for i in $(seq 1 150); do curl -s -o /dev/null -w "%{http_code}\n" https://<your SCND hostname>/; done | sort | uniq -c
```

Then look at Security, then Events, to confirm the rule name shows up. Do this from your own connection, not a shared one.

## Privacy note

Cloudflare sees visitor IPs on any host it serves, and the rate limiter counts by IP at its edge. We do not receive, log or store those counts. This does not change the claim that the user's inputs never leave the browser.
