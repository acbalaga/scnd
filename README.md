# SCND

**Your second meter.** A free, private checker for Philippine rooftop solar owners: **S**olar performance, **C**onsumption split, **N**et-metering bill, **D**egradation.

Static site served by a Cloudflare Worker (static assets only). No backend, no accounts, no stored user data.

## Current stage: spike

`public/index.html` tests whether the browser can call Open-Meteo and NASA POWER directly (CORS), for Manila, Cebu and Davao, over the last complete month. The result decides the weather source for the "weather or system?" check (F4).

Open the deployed URL on a phone and a laptop and record PASS/FAIL per source.

Result (29 Sep 2026): both sources pass CORS on desktop Chrome and iOS Brave, but disagree by up to 40% (Manila, Aug 2026).

`public/spike2.html` compares Open-Meteo archive, Open-Meteo satellite (Himawari) and NASA POWER against PVGIS SARAH-3 for five cities, monthly 2020 to 2023. PVGIS blocks browser calls, so `src/worker.js` proxies it at `/api/pvgis` (PH coordinates only, cached a week). Pass rule: wet-season (Jun to Oct) bias within ±10% in every city.

## Deploy

Cloudflare Workers, Git-connected. Every push to `main` deploys; other versions get preview URLs.

Local: `npx wrangler dev`
