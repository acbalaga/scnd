# SCND

**Your second meter.** A free, private checker for Philippine rooftop solar owners: **S**olar performance, **C**onsumption split, **N**et-metering bill, **D**egradation.

Static site served by a Cloudflare Worker (static assets only). No backend, no accounts, no stored user data.

## Current stage: spike

`public/index.html` tests whether the browser can call Open-Meteo and NASA POWER directly (CORS), for Manila, Cebu and Davao, over the last complete month. The result decides the weather source for the "weather or system?" check (F4).

Open the deployed URL on a phone and a laptop and record PASS/FAIL per source.

## Deploy

Cloudflare Workers, Git-connected. Every push to `main` deploys; other versions get preview URLs.

Local: `npx wrangler dev`
