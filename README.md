# SCND

**Your second meter.** A free, private checker for Philippine rooftop solar owners: **S**olar performance, **C**onsumption split, **N**et-metering bill, **D**egradation.

An owner types their system details and a few numbers from each bill and inverter app. SCND says whether the system is producing what it should, was it the weather or the system, what the export credit is worth, and what to ask the installer. It never gives a verdict, only questions.

Static site served by a Cloudflare Worker. No backend, no accounts, no database, no cookies. Everything the owner types stays in the browser.

Start here: `CLAUDE.md` (project rules), `docs/SPEC.md` (spec), `docs/NEXT.md` (task queue), `docs/RATE-LIMITING.md`.

## What it does

| | Feature |
| --- | --- |
| F1 | Performance ratio (PR) per bill against a typical year's sun, with a wider dry-season amber band |
| F2 | Bill decoder: import, export credit at the generation charge, and why fixed charges keep the bill above zero (Taglish walk-through) |
| F3 | Findings sheet: one printable page of questions for the installer, no installer names |
| F4 | Weather or system: satellite and NASA POWER cross-checked, labelled "uncertain" or "inferred" when they disagree or one is missing |
| F5 to F7 | Energy split, true savings against the promised payback, load-shift value |
| F8 | Year-over-year degradation against the module warranty, after 13 months of bills |
| F9 | Hybrid systems: battery round-trip efficiency, implied house load, battery value, grid-charging flag |

Save and load use a JSON file on the owner's own device.

## Privacy

- User inputs never leave the browser. The only outbound calls are weather lookups to Open-Meteo and NASA POWER, made when the owner clicks "Check the weather", with the location rounded to 0.1° (about 11 km).
- The typical-year sun data is a static file (`public/data/ph-grid.json`), so F1 needs no lookup.
- The Worker rate-limits requests per visitor with a daily-rotating hash of the IP, never the raw IP. It logs and stores nothing.

## Layout

- `public/`: `index.html`, `app.css`, `js/` (`calc.js` all the maths, `grid.js`, `weather.js`, `findings.js`, `data.js`, `app.js`), `data/ph-grid.json`, `vendor/alpine.min.js` (Alpine 3.17.4, MIT, vendored so the page makes no third-party request)
- `src/worker.js`: serves `public/` and rate-limits
- `scripts/`: `build-grid.mjs` (builds the sun grid), `gen-poa-reference.py` (pvlib reference cases)
- `test/`: golden-case tests
- `docs/`: spec, task queue, rate limiting

## Develop

- Tests: `node --test` (94 tests, no dependencies)
- Run locally: `npx wrangler dev`
- Rebuild the sun grid: `NODE_USE_ENV_PROXY=1 node scripts/build-grid.mjs` (the env var is only needed behind an HTTP proxy)
- Regenerate the pvlib reference cases: `python3 scripts/gen-poa-reference.py` (needs `pip install pvlib`)

## Deploy

Cloudflare Workers, Git-connected. Every push to `main` deploys; other versions get preview URLs.

The Worker runs first on every request (`run_worker_first`) so it can rate-limit: 100 requests per 10 seconds per visitor, failing open if the limiter is unavailable. Every request is therefore a Worker request (Free plan: 100,000 a day). Watch the daily count during beta. Details and the trade-offs are in `docs/RATE-LIMITING.md`.

## Status

Pre-beta. Tasks 1 to 9 in `docs/NEXT.md` are built and tested. Open: the 5-minute first-time-owner check on a phone, printing the findings sheet on Safari mobile, the private beta (five owners across three DUs, at least two hybrids), and the deploy.

## Sources decision (29 Sep 2026)

Against Global Solar Atlas long-term monthly GHI, 2020 to 2023:

| Source | Worst wet-season bias | Month-to-month agreement with NASA (r) |
| --- | --- | --- |
| NASA POWER | ±4.8% (PASS) | n/a |
| Open-Meteo satellite (Himawari) | +13.1% (FAIL, but consistent) | 0.90 to 0.96 |
| Open-Meteo archive (reanalysis) | +11.8% (FAIL, Manila) | 0.81 to 0.89 |

Decision: NASA POWER climatology for the typical year (F1). Himawari as a ratio to its own 2020 to 2025 baseline for the weather index (F4), cross-checked against NASA. Reanalysis dropped. The spike pages and the `/api/pvgis` and `/api/gsa` proxy routes are in git history (last at commit `fba1128`).
