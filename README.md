# SCND

**Your second meter.** A free, private checker for Philippine rooftop solar owners: **S**olar performance, **C**onsumption split, **N**et-metering bill, **D**egradation.

An owner types their system details and a few numbers from each bill and inverter app. SCND says whether the system is producing what it should, whether a shortfall was the weather or the system, what the export credit is worth, and what to ask the installer. It never gives a verdict, only questions.

Static site on Cloudflare (Workers static assets, no server code). No backend, no accounts, no database, no cookies. Everything the owner types stays in the browser.

Start here: `CLAUDE.md` (project rules), `docs/SPEC.md` (spec), `docs/NEXT.md` (task queue), `docs/DEPLOY-GATE.md`.

## What it does

| | Feature |
| --- | --- |
| F1 | Performance ratio (PR) per bill against a typical year's sun, with a wider dry-season amber band |
| F2 | Bill decoder: import, export credit at the generation charge, and why fixed charges keep the bill above zero (plain-English walk-through) |
| F3 | Findings sheet: a one-page report (summary, system, performance table, numbered questions, information requested, basis and limitations, notes space) for the installer, no installer names |
| F4 | Weather or system: satellite and NASA POWER cross-checked, labelled "uncertain" or "inferred" when they disagree or one is missing |
| F5 to F7 | Energy split, savings against the promised payback (chart with hover, table view and payback time at your own pace), load-shift value |
| F8 | Year-over-year degradation against the module warranty, after 13 months of bills |
| F9 | Hybrid systems: battery round-trip efficiency, implied house load, battery value, grid-charging flag |

Save and load use a JSON file on the owner's own device. "Try an example" fills a made-up system and two bills so a first-time owner sees a full result in one tap.

## Privacy

- User inputs never leave the browser. The only outbound calls are weather lookups to Open-Meteo and NASA POWER, made when the owner clicks "Check the weather", with the location rounded to 0.1° (about 11 km).
- The typical-year sun data is a static file (`public/data/ph-grid.json`), so F1 needs no lookup.
- The only thing stored on your device is your Auto, Light or Dark choice (in the browser's local storage), and only if you pick one. There are no cookies.
- SCND runs no server code. Cloudflare serves the files and sees visitors' IP addresses, like any web host; nothing of SCND's logs or stores them.

## Layout

- `public/`: `index.html`, `app.css`, `manifest.webmanifest`, `icons/`, `js/` (`calc.js` all the maths, `grid.js`, `weather.js`, `findings.js`, `data.js`, `app.js`), `data/ph-grid.json`, `vendor/alpine.min.js` (Alpine 3.17.4, MIT), `fonts/` (Pixelify Sans, DSEG7 Classic, Chivo and Chivo Mono for the app, Source Serif 4 and Source Sans 3 for the printed report, plus a ₱-only file per family, all SIL Open Font Licence 1.1, licences alongside), `icons/` (logo and app icons). Everything is self-hosted so the page makes no third-party request
- `public/_headers`: the security headers, CSP included, for every file (there is no Worker script; `wrangler.jsonc` serves `public/` as static assets)
- `scripts/`: `build-grid.mjs` (builds the sun grid), `gen-poa-reference.py` (pvlib reference cases), `gen-logo.mjs` and `gen-icons.mjs` (the seven-segment SCND logo and app icons)
- `test/`: golden-case tests
- `docs/`: spec, task queue, deploy gate, custom domain guide, feedback form setup, audits (`docs/RATE-LIMITING.md` is kept as a record of the retired limiter)

## Develop

- Tests: `node --test` (94 tests, no dependencies)
- Run locally: `npx wrangler dev`
- Rebuild the sun grid: `NODE_USE_ENV_PROXY=1 node scripts/build-grid.mjs` (the env var is only needed behind an HTTP proxy)
- Regenerate the pvlib reference cases: `python3 scripts/gen-poa-reference.py` (needs `pip install pvlib`)

## Deploy

Cloudflare Workers, Git-connected. Every push to `main` deploys to https://myscnd.app (custom domain, production only, live 2 Oct 2026). Preview URLs and the `scnd.<account>.workers.dev` address are off (`preview_urls` and `workers_dev` are `false` in `wrangler.jsonc`, 2 Oct 2026). Domain notes are in `docs/CUSTOM-DOMAIN.md`.

Pages and files are static assets: no Worker script runs, so there is no daily request cap to run out of (static asset requests are free and unlimited on the Free plan). The in-code rate limiter was retired on 14 Nov 2026 for this reason (ticket #37); `docs/RATE-LIMITING.md` keeps the record. Tests run on every push (`.github/workflows/test.yml`), and `docs/DEPLOY-GATE.md` has the Cloudflare build command that stops a failing commit from deploying.

## Feedback

Set `FEEDBACK_URL` in `public/js/app.js` to a Google Form link to show a "Give feedback" link in the footer. See `docs/FEEDBACK-FORM.md`. The link is a plain link the visitor chooses to click, and it passes none of their numbers to the form.

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
