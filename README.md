# SCND

**Your second meter.** A free, private checker for Philippine rooftop solar owners: **S**olar performance, **C**onsumption split, **N**et-metering bill, **D**egradation.

Static site served by a Cloudflare Worker (static assets only). No backend, no accounts, no stored user data.

Start here: `CLAUDE.md` (project rules), `docs/SPEC.md` (Phase 1 spec), `docs/NEXT.md` (task queue).

## Current stage: pre-beta

The app is in `public/`: `index.html`, `app.css`, `js/` (calc core, grid lookup, weather fetch, findings sheet, save/load) and `data/ph-grid.json` (typical-year sun). All maths is in `public/js/calc.js`, with golden-case tests.

- Tests: `node --test`
- Rebuild the sun grid: `NODE_USE_ENV_PROXY=1 node scripts/build-grid.mjs` (the env var is only needed behind an HTTP proxy)
- Regenerate the pvlib reference cases: `python3 scripts/gen-poa-reference.py` (needs `pip install pvlib`)

The spike pages and the `/api/pvgis` and `/api/gsa` proxy routes were removed in task 8. They are in git history (last present at commit `fba1128`); the spike results are below and in `docs/NEXT.md`.

Spike 1 (29 Sep 2026): Open-Meteo and NASA POWER both pass browser CORS on desktop Chrome and iOS Brave.

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
