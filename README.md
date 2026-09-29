# SCND

**Your second meter.** A free, private checker for Philippine rooftop solar owners: **S**olar performance, **C**onsumption split, **N**et-metering bill, **D**egradation.

Static site served by a Cloudflare Worker (static assets only). No backend, no accounts, no stored user data.

## Current stage: spike

`public/index.html` tests whether the browser can call Open-Meteo and NASA POWER directly (CORS), for Manila, Cebu and Davao, over the last complete month. The result decides the weather source for the "weather or system?" check (F4).

Open the deployed URL on a phone and a laptop and record PASS/FAIL per source.

Result (29 Sep 2026): both sources pass CORS on desktop Chrome and iOS Brave, but disagree by up to 40% (Manila, Aug 2026).

`public/spike2.html` compares Open-Meteo archive, Open-Meteo satellite (Himawari) and NASA POWER, as 2020 to 2023 calendar-month means, against Global Solar Atlas long-term monthly GHI for five cities. PVGIS SARAH-3 was the first choice of reference but does not cover the Philippines (PVGIS returns HTTP 400 and offers only ERA5 reanalysis there). `src/worker.js` proxies GSA at `/api/gsa` and PVGIS at `/api/pvgis` (PH coordinates only, cached a week). Pass rule: wet-season (Jun to Oct) bias within ±10% in every city.

## Deploy

Cloudflare Workers, Git-connected. Every push to `main` deploys; other versions get preview URLs.

Local: `npx wrangler dev`

## Spike 2 result (29 Sep 2026)

Against Global Solar Atlas long-term monthly GHI, 2020 to 2023:

| Source | Worst wet-season bias | Month-to-month agreement with NASA (r) |
| --- | --- | --- |
| NASA POWER | ±4.8% (PASS) | n/a |
| Open-Meteo satellite (Himawari) | +13.1% (FAIL, but consistent) | 0.90 to 0.96 |
| Open-Meteo archive (reanalysis) | +11.8% (FAIL, Manila) | 0.81 to 0.89 |

Decision: NASA POWER climatology for the typical year (F1). Himawari as a ratio to its own climatology for the weather index (F4), cross-checked monthly against NASA. Reanalysis dropped.
