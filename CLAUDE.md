# SCND — project rules for Claude

SCND ("second") is a free, private checker for Philippine rooftop solar owners: **S**olar performance, **C**onsumption split, **N**et-metering bill, **D**egradation. Tagline: "Your second meter." Full spec: `docs/SPEC.md`. Current work queue: `docs/NEXT.md`.

Owner: Fred (Alfred Balaga), renewable energy O&M practitioner. Personal project, built on personal hardware and time.

## Hard rules

1. **Static and private.** No backend of ours holding user data, no accounts, no database, no cookies, no analytics beyond an optional cookieless counter. User inputs (system details, bills, generation) never leave the browser. The only allowed outbound calls from the app are irradiance lookups with coordinates rounded to 0.1°.
2. **No server code of ours.** The site is Cloudflare static assets only: `wrangler.jsonc` has no `main`, and security headers, the CSP included, live in `public/_headers` (Fred, 14 Nov 2026, ticket #37; replaces the rate-limited Worker, see `docs/RATE-LIMITING.md`). Pages must stay static assets: on the Free plan a Worker-first page path has a daily request cap, and past it the site answers 429 until 08:00 PH. A Worker script may come back only to proxy a public data source that blocks browser calls, on its own path; it never receives user inputs beyond rounded coordinates and never logs or stores anything. Ask Fred first.
3. **Calc core before UI.** All maths lives in one pure JS module (`public/js/calc.js`, no DOM, no fetch) with golden-case tests. No formula ships without a test. Tests run with `node --test`.
4. **No company data.** Nothing from Fred's employer (NAC Energy / NAC EnerTech / EPI): no plant data, pyranometer data, SCADA exports, documents or templates. If a task seems to need it, stop and ask.
5. **No hard-coded tariffs.** Rates are always read from the user's own bill. Meralco figures appear only in examples and tests, labelled with their date.
6. **Rates of change are stated, not assumed.** Any claim in UI copy about regulation, rates or programs cites its source and date in a code comment next to the copy.

## Irradiance sources (decided, 29 Sep 2026; see README "Spike 2 result")

- **Typical year (F1 expected yield):** NASA POWER climatology, pre-computed into `public/data/ph-grid.json` by a build script. Within ±5% of Global Solar Atlas in the wet season, but reads up to ~8% low in the dry season (Laoag, Davao), so the dry-season amber band is wider.
- **Actual-month weather index (F4):** Open-Meteo satellite API (Himawari, 5 km), used only as a ratio to its own climatology so its +4 to +13% absolute bias cancels. Cross-check each month against NASA POWER; if the two weather indices differ by more than 5 points, label the weather call "uncertain".
- **Not used:** PVGIS (SARAH-3 does not cover the Philippines; ERA5 only), Open-Meteo archive/reanalysis (weakest month-to-month agreement, +12% bias in Manila).
- **Global Solar Atlas** is the validation reference only. Do not use its API in the app or in build scripts until Fred confirms its terms allow it.

## Stack

- Plain HTML + Alpine.js + ES modules. No build step, no framework, no bundler.
- Fonts: Pixelify Sans (display headings), DSEG7 Classic (LCD digits), Chivo (body and UI text) and Chivo Mono (figures: stats, values, tables), all SIL OFL 1.1, self-hosted in `public/fonts/` with their licences. Do not use the pixel face for numbers (its 5 reads as S). The printed findings sheet is a report page in Source Serif 4 (headings) and Source Sans 3 (text), also SIL OFL, self-hosted. The Latin font files have no peso sign, so each family also has a ₱-only file (`*-peso-wght-normal.woff2`, about 1 KB) on a `unicode-range: U+20B1` face; `scripts/fetch-fonts.py` makes them.
- Inline SVG charts, hand-rolled. Print stylesheet + `window.print()` for the findings sheet.
- Cloudflare Workers (static assets only, no Worker script). `wrangler.jsonc`, deploys on push to `main` via Git integration. Preview URLs and the workers.dev address are off (2 Oct 2026). The deploy gate is in `docs/DEPLOY-GATE.md`.
- Local dev: `npx wrangler dev`.
- Build scripts (e.g. grid generation) live in `scripts/`, run locally with Node or Python, and commit their output. They are never run by the deployed site.

## Product decisions

- Hybrid systems are first-class (F9): PV yield, battery charge, battery discharge, optional home load. PR uses PV yield, not inverter AC output.
- Language: English UI throughout, including bill-decoder explanations, tooltips and nudges (plain English, no Taglish). The findings sheet is English too (it goes to the installer).
- Red flag only after two consecutive red months. Findings sheet is framed as "questions to ask your installer", never a verdict; no installer names are stored or shown.
- Separate product from Fred's PV module obsolescence tracker idea. Deliberately in the same naming family as SCNTL (Fred's private BESS sizing tool), but no code or data is shared with it.

## Copy and voice (UI text, README, commit messages)

- Plain, grounded practitioner tone. No filler ("leverage", "seamless", "unlock", "dive into").
- No em dashes. Use periods, commas or parentheses.
- Numbers carry units. State claims plainly; hedge only where uncertainty changes the answer.
- Owners are non-technical. Explain PR, kWh and export credit in one plain sentence the first time they appear.

## Working agreement

- Ask Fred before: adding a dependency, adding any network call, changing an irradiance source, or changing a pass/fail threshold.
- Work task by task from `docs/NEXT.md`. Tick the box and note the result in the same commit.
- Commit messages: imperative subject, short body with the why.
