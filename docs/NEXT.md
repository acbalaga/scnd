# SCND — next tasks

Work top to bottom. Each task ends with its checks passing and a commit. Ask Fred at any **Decision** line before proceeding.

## Done

- [x] **Spike 1: browser CORS.** Open-Meteo and NASA POWER both callable from the browser (desktop Chrome, iOS Brave). `public/spike1.html`, removed in task 8 (in git history).
- [x] **Spike 2: source validation.** Against Global Solar Atlas, 2020 to 2023, five cities. NASA POWER for typical year, Himawari (Open-Meteo satellite) for weather index. `public/spike2.html` (removed in task 8, in git history), results in README.

- [x] **Explainer section.** Inline HTML/SVG "What is SCND?" card (purpose, S/C/N/D tiles, 3-step flow). Hidden on load; opened by "About" in the header or "What is SCND?" in the hero, closed with "Close". Nothing stored. No new request or dependency. Video not used: it needs a rendered binary and a re-render per copy change. Can be a later task if wanted.
- [x] **Landing copy cleanup (SlopDoctor case 820a67d9, 3 Oct 2026).** One h1 in every state, one "Your system" heading, explainer heading renamed "About SCND". Privacy promise kept in the hero and "Your data" only; "not a verdict" and advice caveats folded into one note below the bills and the Limits section. No new facts, no new request.
- [x] **One three-step path (SlopDoctor case 820a67d9, second pass, 3 Oct 2026).** The explainer's numbered "How it works" list is now one sentence pointing at the step rail, so the page has a single path (system, bill, answer). The four S/C/N/D labels are bold labels, not h3s inside list items.
- [x] **Charges as amounts or per kWh (owner feedback, 4 Oct 2026).** Each bill has a "₱ amount / ₱ per kWh" switch for the generation and variable charges, because some utilities print only the peso amount. `calc.billCharges` turns either into the generation rate and variable pesos using the kWh bought (2 tests). New bills default to amounts and copy the last bill's choice. Save files from before open as amounts, with the generation amount worked out from the saved rate (2 tests). Example placeholders read "e.g." in italic in both modes. No new request or dependency.

## 1. Typical-year irradiance grid

Build `scripts/build-grid.mjs` (Node, no dependencies) that writes `public/data/ph-grid.json`.

- Source: NASA POWER **climatology** API, community `RE`, parameters `ALLSKY_SFC_SW_DWN` (GHI), `ALLSKY_SFC_SW_DIFF` (diffuse horizontal) and `T2M` (air temperature), monthly long-term means. NASA provides diffuse directly, so no decomposition model is needed.
- Coverage: Philippines bounding box, lat 4.5 to 21.0, lon 116.5 to 127.0, 0.5° steps. Prefer the regional endpoint to cut the number of calls; throttle politely (NASA asks for modest request rates) and cache raw responses in `scripts/.cache/` (gitignored) so reruns are cheap.
- Output shape (compact): `{ "meta": { source, parameters, period, built, step }, "lat0", "lon0", "step", "nLat", "nLon", "ghi": [[12 values] per cell], "dif": [...], "t2m": [...] }`, values rounded to 2 decimals, GHI and diffuse in kWh/m²/day. Record the climatology period NASA returns in `meta.period`.
- Add `public/js/grid.js`: load the JSON once, bilinear-interpolate the four surrounding cells for a given lat/lon.
- **Checks**
    - [x] File under 250 KB. Result: 141.8 KB, 748 cells, none empty. Period 2001 to 2020.
    - [x] Interpolated GHI at Manila (14.6, 121.0) is within ±5% of Global Solar Atlas on the annual mean. Reference (GSA, kWh/m²/month, Jan to Dec, fetched 29 Sep 2026): 115.26, 128.82, 163.99, 180.03, 180.64, 158.64, 143.59, 142.91, 133.83, 126.08, 116.37, 107.05. Store as a test fixture. Result: +3.9% (1763 vs 1697 kWh/m²/yr).
    - [x] Laoag, Iloilo, Cebu and Davao annual GHI within ±8% of the spike 2 NASA monthly means (sanity check that the grid and interpolation are wired correctly). Result: Laoag -3.8%, Iloilo -0.7%, Cebu +1.6%, Davao +1.9% (Manila +5.1%, for reference).
    - [x] Diffuse fraction is between 0.3 and 0.7 for every cell and month (sanity bound for PH climate). Decided 29 Sep 2026: bound stays 0.3 to 0.7, except cells flagged by `isLowDiffuse` (any month under 0.3), which get a floor of 0.27 and a UI caveat (copy comes with task 3). Result: 42 cell-months (26 cells) in Feb to Apr (Mindoro, Panay, northern Palawan, seas west of Luzon) sit at 0.279 to 0.300; max is 0.634.

## 2. Calc core

`public/js/calc.js`: pure functions, no DOM, no fetch. Tests in `test/calc.test.mjs`, run with `node --test`.

- **Plane-of-array irradiation for a month** from monthly mean GHI and diffuse, tilt, azimuth (0 = south, 90 = west, −90 = east, matching PVGIS convention), latitude. Method: integrate hour by hour over the month's mean day (Liu-Jordan / Collares-Pereira-Rabl hourly apportioning of daily global and diffuse), isotropic sky, ground albedo 0.2. Return kWh/m²/month.
- **Golden cases for POA:** generate reference values once with `pvlib` (Python, dev-only, in `scripts/`) for at least: Manila tilt 10° south, Manila tilt 15° east, Davao tilt 5° north, Laoag tilt 20° south, for January and July. Commit the reference numbers as fixtures. Pass rule: within ±3% of pvlib.
- **PR, weather split, energy split, savings, load-shift value, degradation, hybrid balance** exactly as in `docs/SPEC.md` "Calculation method" (F1, F4 to F9).
- **Edge cases with tests:** S < 0 (period misalignment) returns an error object, not a number; zero export after net-metering activation raises a flag; DC/AC above 1.3 raises a clipping flag; hybrid with C > PV surplus raises grid-charging flag; F8 returns null under 13 months.
- **Checks**
    - [x] `node --test` passes, every exported function has at least one golden case and one edge case. Result: 57 tests pass. POA vs pvlib 0.16.1 reference: worst case 0.07% across the 8 cases (limit 3%). The reference shares the hourly apportioning method with calc.js, so it validates geometry and transposition, not the apportioning model itself.

**Decision (Fred, 29 Sep 2026): proposal accepted, implemented in `PR_BANDS` (`public/js/calc.js`).** PR band thresholds for dry season given NASA's up to −8% dry bias: green ≥ 0.75, amber 0.62 to 0.75, red < 0.62 in Nov to May; unchanged in Jun to Oct.

## 3. Input flow and F1, F5, F6, F7

System setup once (location, kWp, tilt, facing, inverter AC kW, commissioning month, hybrid yes/no), then one card per bill. Results for F1, F5, F6, F7. Mobile first. English UI, including help text.

- **Checks**
    - [ ] A first-time owner can finish setup plus one bill in under 5 minutes on a phone. Not verified: needs a real first-time owner. Setup is 6 required fields, a bill is 8.
    - [x] Network tab shows no request other than static files and the rounded-coordinate irradiance calls. Result (headless Chromium, 390 px wide, 3 bills): 7 requests, all static files from this origin, zero irradiance calls (typical-year sun comes from `public/data/ph-grid.json`), no console errors.

## 4. F2 bill decoder

- [x] Done. `billDecode` in `public/js/calc.js` (3 tests), and a plain-English "Decode this bill" walk-through in each bill card. Copy claims cite the SPEC sources (29 Sep 2026) in a comment next to the copy. A credit larger than the variable charges is flagged, not modelled, because how it carries over is not verified.

Annotated walk-through of the user's own bill numbers. Explain export credit at the generation charge, and why fixed charges keep the bill above zero.

## 5. F4 weather check

Himawari monthly ratio to its own climatology, cross-checked against NASA POWER; "uncertain" label when they disagree by more than 5 points.

**Himawari history check (29 Sep 2026, `satellite_radiation_seamless`, daily `shortwave_radiation_sum`, Manila, Laoag, Cebu, Davao):**
- Data starts 3 Jul 2015 at all four points. Full calendar years 2016 to 2025 have at least 25 valid days in every month at every point.
- 2026 has holes: Manila has 3 or fewer valid days per month for Jan to Apr and none for May to Aug; Laoag misses Jul and Aug; Cebu misses Feb to May; Davao is nearly complete. Sep 2026 is present to about the 14th. `jma_jaxa_himawari` behaves the same. Calling without `models` returns a full 2026, but it is a different product (values differ on almost every day; mean difference up to -0.45 kWh/m²/day at Davao), so it is not a drop-in fill.
- The series steps down 2 to 6% between 2016 to 2019 and 2022 to 2025 at all four points (Manila 5.28 to 4.96, Davao 5.91 to 5.57 kWh/m²/day). Cause not established.

**Decided (Fred, 29 Sep 2026):** baseline 2020 to 2025 (`BASELINE_FROM`, `BASELINE_TO` in `public/js/calc.js`; the NASA index uses the same window for its own baseline). Open-Meteo call approved. Months with no satellite data fall back to NASA POWER alone and are shown to the user as "Inferred", not cross-checked.

**Done:** `weatherBaseline`, `weatherIndexPeriod`, `weatherCall` (accepts a missing source) in `calc.js`, 8 tests. `public/js/weather.js` fetches Open-Meteo satellite and NASA POWER daily GHI only when the user clicks "Check the weather", location rounded to 0.1°. Verified end to end against live data (Manila, 2 bills): 2 external calls after the click and none before; a bill with satellite gaps shows the Inferred notice; a bill with both sources shows none. The index is on GHI and applied to POA (actual diffuse is not available per period).

**Was:** Himawari climatology baseline period (the API's history depth decides this; check how far back `satellite_radiation_seamless` goes for PH points).

## 6. F3 findings sheet, save/load JSON

- [x] Done. `public/js/data.js` (save/load, copies only known fields, rejects text in number fields, bad dates, wrong version, files over 1 MB; no installer field exists) and `public/js/findings.js` (the questions), 13 tests. UI: "Save my data", "Load saved data", "Findings sheet for my installer" with a print stylesheet.
- Verified in headless Chromium: save, reload, load restores all bills and results; a hostile file is rejected with a plain message; the sheet prints on one page in A4 and Letter in the worst case I could build (6 bills shown, 5 questions, 3 uncertainty notes, 851 px of the ~965 px Letter limit); zero external requests during save, load and print.
- **Not verified:** Safari mobile printing (the SPEC "done when" line stays unticked). Needs a real iPhone.
- The table shows the latest 6 bills. The questions use all bills.

## 7. F8 degradation, F9 hybrid

- [x] Done. Both open thresholds decided by Fred, 29 Sep 2026 (see below).
- **F9:** hybrid bills take battery charged, battery discharged and an optional app home load. Per bill: round-trip efficiency (out / in), worked-out house load with the gap to the app's load, battery value, and the grid-charging flag. Summary card: battery earned so far, and the share of battery cost if given. Warranty and battery cost are optional setup fields. PV curtailment is not modelled: it needs daily battery state of charge, which monthly numbers do not have. Outage hours are already noted, not priced.
- **F8:** same-month weather-adjusted PR (from the F4 check), bills paired by the month and year of their midpoint. Hidden until the bills span 13 months and have a weather check. Card states that month-to-month noise is far larger than a year's degradation.
- Verified in headless Chromium with live weather data (14 hybrid bills, Cebu): all cards render, grid-charging flag fires on the one bill built to trigger it, save and load restore the battery and warranty fields, no console errors. Old save files without the new fields still load.
- **Decided (Fred, 29 Sep 2026):** the sheet raises a degradation question only from 6 same-month pairs (`MIN_DEGRADATION_PAIRS`, `public/js/findings.js`). Below that, the on-screen card shows an "Early reading" notice and the sheet lists it as an awareness note under "How sure are these numbers?", not as a question.
- **Decided (Fred, 29 Sep 2026):** battery efficiency flag = the latest 2 bills are both 5 or more points below the average of the first 3 bills (`efficiencyDrop`, `RTE_DROP_POINTS`, `RTE_BASELINE_BILLS`, `RTE_RUN` in `public/js/calc.js`). Needs 5 bills with a value. Shown on the Battery card and as a sheet question. 90 tests pass.

## 8. Clean-up before beta

- [x] Remove spike pages and the `/api/pvgis` and `/api/gsa` proxy routes (keep them in git history). Done: `spike1.html`, `spike2.html` and both routes are gone; `src/worker.js` is now a pass-through to the static files. Last commit that has them: `fba1128`.
- Private beta: Fred is recruiting five owners across three DUs, at least two hybrids.

## 9. Rate limiting

Added 29 Sep 2026 at Fred's request. A Cloudflare WAF rate limiting rule was not available on Fred's plan (Enterprise add-on), so it is in code. See `docs/RATE-LIMITING.md`.

- [x] Worker runs first (`run_worker_first`) and checks the Workers Rate Limiting binding: 100 requests per 10 seconds per visitor, keyed by a daily-rotating hash of the IP, fails open. `src/worker.js`, `wrangler.jsonc`, 4 tests.
- [x] Checked in the Workers runtime under `wrangler dev`: 150 rapid requests gave 100 served and 50 `429`; another visitor unaffected; recovered after 10 seconds; static files served; `/api/pvgis` returns 404.
- [ ] **Fred, after deploy:** run the curl check in the doc against the live hostname, and watch the daily Worker request count during beta (Free plan cap is 100,000 a day, and every request now counts).

## 10. SLC pass before beta (Simple, Lovable, Complete)

Requested by Fred 29 Sep 2026 after testing on Safari (iPhone). Decided: answer first, "meter dial" look, and all four extras.

- [x] **Safari fixes** (own commit): date and month inputs no longer overflow or overlap, checkboxes sit beside their labels, the findings table no longer runs off the right edge on phones. Checked at 320, 375 and 390 px in Chromium. **Not run on Safari itself** (no WebKit here): please re-check on the iPhone.
- [x] **Simple:** one job. A hero and a 3-step indicator (system, bill, answer). Setup collapses to a one-line summary once done, optional fields sit under "More details", coordinates under "Not on the list?". Each bill leads with a PR dial and one plain sentence; weather, energy split, savings, battery and the bill decoder are one tap each with a one-line teaser.
- [x] **Lovable:** the dial (zones come from `PR_BANDS`, season-aware; the needle sweeps once and respects reduced motion), night-blue and sun-yellow palette, light and dark, system fonts only (rounded numerals on iOS), plain-language empty states and headlines.
- [x] **Complete:** "Try an example" (made-up system and two bills, banner, "Start with mine"), a save prompt after the first answer, weather check button that says what it needs, a redesigned findings sheet (masthead, summary tiles, chips, striped table, tick boxes), home-screen icons and manifest.
- [x] **Feedback link:** superseded by the Google Form link in 10c.
- Verified in headless Chromium (phone width, live weather data): manual hybrid flow with 8 bills, dial, empty state, two-low-months flag, save nudge, weather teaser, worst-case sheet on one page (868 px of about 964 on Letter, A4 also one page), save and load, no horizontal overflow at 320/375/390 px, example and reset, only static files plus the click-triggered weather calls, no console errors. `node --test` 94 pass.
- **Not verified:** Safari (iPhone) rendering and printing, and the 5-minute first-time-owner check.

### 10b. Visual round two (Fred, 29 Sep 2026)

- [x] **Payback chart rebuilt.** The old chart drew no savings line at all (my redesign had removed the `--accent` colour it used). Now: clean axis ticks and real dates, area under the savings line, a promised-pace line, a legend for two series (none for one), a hover and keyboard tooltip, "Show as a table", three stat tiles (saved so far, promised pace and % ahead or behind, payback time at the owner's own pace), and one direct label. Colours checked with the dataviz validator in light and dark (blue `#0B5FB0` / `#3D8BDB`, amber `#B45309` / `#C4820F`). Maths in `calc.js` (`promisedSavings`, `paybackYearsAtPace`, 4 tests).
- [x] **Fonts.** Pixelify Sans for words and DSEG7 Classic for LCD digits, both SIL OFL 1.1, self-hosted (about 26 KB in all) with licence files. Numbers stay in the system font because the pixel face's 5 reads as S.
- [x] **Logo.** Drawn as vector segments on a seven-segment LCD, so "5Cnd" reads as SCND, like a kWh meter display. Wordmark and 2 by 2 app icon, generated by `scripts/gen-logo.mjs`. Hero shows a "2nd" LCD panel. PNG icons regenerated.
- [x] **Visual polish.** Graph-paper backdrop, hard-shadow cards and buttons, LCD readout inside the dial, LCD tile on the findings sheet, tidier sheet print.
- [x] **Light/dark toggle.** Auto (follows the phone), Light, Dark. Stored in local storage on the device only and applied before first paint. Printing is always light.
- Verified in headless Chromium (phone width): 98 unit tests, e2e including theme persistence, chart lines and colours, tooltip, table, single-series case, fonts from our own host, no overflow at 320/375/390 px, worst-case sheet 812 px and still one Letter page with 110 px of extra content added. Also fixed: the sheet's real print headroom was being eaten by the page's bottom padding.
- **Not verified:** Safari (iPhone), and how the pixel fonts look on your phone.

### 10c. Report-style findings sheet, feedback and domain (Fred, 29 Sep 2026)

- [x] **Findings sheet redesigned as a report.** Masthead with reference number and date, serif title, one-sentence summary and three key figures, system table, ruled performance table with a plain-word assessment column, numbered questions (Q1, Q2...), information requested, basis and limitations (sources and uncertainty), a notes box for the installer's response, and a footer disclaimer. Source Serif 4 and Source Sans 3 (SIL OFL 1.1, self-hosted, about 96 KB, loaded only when the sheet is opened). Paper-white in dark mode so the preview matches the print. Amounts are written PHP because those fonts have no peso sign. Question wording tightened (no repeated "Question:" labels).
- [x] Worst case I could build (5 questions firing, every note, 5 bills) prints on one A4 page and one Letter page (905 px of about 950 usable on Letter). Beyond that it breaks cleanly onto a second page (headings and rows do not split).
- [x] **Feedback:** the mailto is replaced by `FEEDBACK_URL` for a Google Form link (hidden until set, opens in a new tab, footer asks people to leave out bill and account numbers; name and email are optional). Setup and suggested questions in `docs/FEEDBACK-FORM.md`. Form created and `FEEDBACK_URL` set to https://forms.gle/uaUyhAR2PLqakpME8 (30 Sep 2026).
- [x] **Custom domain guide** in `docs/CUSTOM-DOMAIN.md` (three paths, steps, undo). Written without access to Cloudflare's docs, so check menu names against the dashboard. Superseded 2 Oct 2026 by section 13.
- **Not verified:** Safari (iPhone) printing of the sheet.


## 11. Audit while waiting for beta feedback (30 Sep 2026)

Requested by Fred: look for what was missed, keep to Simple, Lovable, Complete. Read calc, app, findings, save/load, weather, Worker and the SPEC end to end.

**Fixed (bugs, no threshold or source changed):**
- [x] **Hybrid savings overstated.** Savings and "whole-house use" used S = G − X, which counts battery losses (C − D) as solar used in the house. At 120 kWh in and 108 out that is 12 kWh a month, about PHP 145 at PHP 12/kWh, every bill. `energySplit` now takes C and D: S = G − X − C + D, and L matches `hybridBalance`. Hybrids need both battery numbers before savings show. 2 tests.
- [x] **Stale weather after a location change.** Editing the location after "Check the weather" kept the old point's weather data and applied it to the new one. It is now dropped when the rounded point changes.
- [x] **Findings sheet over-claimed.** With no questions raised, the sheet said "PR was within the usual range in every bill reviewed" even when an older bill was amber or red. It now says that only when every bill is green (`allGreen` in `findings.js`, 1 test).
- [x] **Dates in UTC.** The sheet date, its reference number and the save file name used UTC, so before 8 am in PH they showed yesterday. Now local.
- [x] Small: expected yield reads `PR_BANDS.green` instead of a second hard-coded 0.75; sheet table rows keyed by index (two bills with the same dates broke the key).
- Checked in headless Chromium at 390 px: hybrid split equals the F9 balance, weather resets on a move and not on a re-save, sheet wording, no console errors. `node --test`: 101 pass.

**Decided (Fred, 30 Sep 2026): items 1 to 5, and the prompt for item 6. Done.**
- [x] **1. Judge on weather-adjusted PR once the weather call is trusted.** `judgedPr` in `calc.js`: with a weather call that is not "uncertain", a bill's PR, expected kWh, band, chip, dial, headline, two-low-months flag and sheet row all use the weather-adjusted figures. Unchecked, uncertain or missing weather stays against a typical year. An inferred call (one source) is used; it already carries its own notice. Dial says which basis it used; the sheet adds a basis line and marks an unused index "(not used)". Two cloudy months at WI 0.75 and typical PR 0.58 now read 0.77, green, no flag; with the sources 7 points apart they stay red and flagged. 2 tests.
- [x] **2. Payback question waits.** Raised only after about a year of bills (`PAYBACK_MIN_DAYS` = 360) or when more than 15% behind (`PAYBACK_GAP`), in `findings.js`. Before that a gap is an awareness note under "Basis and limitations". 1 test.
- [x] **3. Skipped months break the run.** `isConsecutive` in `calc.js`: the next bill must start within 7 days (`CONSECUTIVE_GAP_DAYS`) of the previous one's end for two red bills to count as in a row. 2 tests.
- [x] **4. Overlapping bills flagged.** `overlapDays` in `calc.js`; the later bill (or the second copy of the same dates) gets "These dates overlap another bill, so savings and payback count the shared days twice." One shared day is let through as a reading-date slip. 2 tests.
- [x] **5. Zero-export hybrids.** Kept the default. With the battery box ticked, setup says "Battery set to zero export (nothing sent to the grid)? Leave this unticked.", and the 0 kWh export flag ends with "If your system is set to zero export, untick net metering in setup."
- [x] **6. Unsaved-changes prompt.** Leaving the page asks first when setup or bills differ from the last save or load. It compares what a save would write with what was last written; nothing is stored. Off for the example. **Limit:** iPhone Safari ignores leave-page prompts, so on iPhones the save nudge is still the only guard.
- Checked in headless Chromium: every case above, plus the handler blocks only when there are changes (the native prompt itself does not show under automation). No console errors. `node --test`: 108 pass.

- [x] **7. Content-Security-Policy and security headers (1 Oct 2026).** Set in `src/worker.js` on every response, 429s included (`_headers` files do not apply under `run_worker_first`). `connect-src 'self'` plus the Open-Meteo and NASA POWER hosts, `Referrer-Policy: no-referrer`, `nosniff`, `frame-ancestors 'none'`, `Permissions-Policy` with geolocation for self only. `script-src` carries `'unsafe-eval'` (Alpine standard build) and the sha256 of the inline theme script; a test fails if that hash drifts from `index.html`. `style-src` has `'unsafe-inline'` for the `style=""` attributes. Checked in headless Chromium through the real Worker code: page loads, Alpine initialises, no CSP violations. **Not yet checked under `wrangler dev`** (not installed here); check the preview URL once for a weather check and a save-file download. `node --test`: 111 pass.

**Noted, not proposed for v1:** temperature is in the grid (`t2m`) but unused; the dry-season band already absorbs heat loss. No offline mode although the app installs to the home screen.

## 12. UI critique and refinement (1 Oct 2026)

Requested by Fred: critique the UI and refine it. Two independent reviews (design review with screenshots at 390 and 1440 px, light and dark; automated detector plus browser checks) scored it 26/40 on Nielsen's heuristics. Fred chose all P1 fixes, legibility and accessibility first.

- [x] **Pixel face misread.** Pixelify Sans closes its capital C at every weight ("Oheck my system", "What is SOND?"). It now stays on h1, h2, the answer headline and the LCD panel only. Buttons, summaries, step labels, stat labels and h3 use the system font.
- [x] **Dial.** The arc spans PR 0.45 to 0.95 instead of 0 to 1, so red is 40% of the dial, not 65%, and an amber month no longer reads as a failure. Needle clamps at the ends; the LCD shows the true PR. Display only: `PR_BANDS` unchanged.
- [x] **Weather failure.** When neither source gives usable data the status is `failed`: the teaser says "Couldn't check" (was "No data"), the bill section and the card say the check did not get through and the PR still stands against a typical year, and the button reads "Try again".
- [x] **Accessibility.** Focus ring is blue in light mode (yellow was 1.43:1 on the page), yellow in dark. Input borders at least 3:1 (`--field`). Placeholders and an unpicked city in muted italic. A live region reads the latest answer; setup and weather errors are `role="alert"`, and a setup error moves focus to the first missing field. Every button and summary is at least 44 px tall. Number spinners hidden.
- [x] **Chart tooltip.** An empty tip box stuck over the payback chart after "Add another bill" (`:style` string cleared `x-show`'s `display:none`). Style is now an object.
- [x] **Decided (Fred, 1 Oct 2026), replacing two 30 Sep decisions in task 11:** net metering is **unticked** by default (owners not yet switched were getting a false zero-export flag); the payback question waits for **a year of bills** with no 15% exception (`PAYBACK_GAP` removed), because a wet-season start reads far behind. 1 test.
- Checked in headless Chromium at 390 and 1440 px, light and dark: focus after a setup error, live-region text, weather failure copy (the sandbox blocks both APIs), tooltip hidden, no button or summary under 44 px, sheet holds the payback question at 92 days. `node --test`: 112 pass.
- [x] **Bill card split (`/impeccable layout`, Fred chose "answer stays below").** Inputs are three fieldsets by source: Billing period (dates), From your inverter app (solar or PV yield, battery fields), From your bill (bought, sent, generation charge, variable charges, total). Each "Ano ito?" sits under the fields it explains; tighter rows inside a group, a rule between groups. Outage hours folds behind "Had brownouts? Add outage hours" so nothing optional sits between the dates and solar kWh; it opens on render when it holds a value. Summary renamed "Numbers for this period" (it holds app figures too). Tab order checked equal to visual order, standard and hybrid, 390 and 1440 px.
- [x] **Bill card polish (`/impeccable polish`).** "Remove" on a bill with numbers asks first ("This cannot be undone", focus on "Keep it"); an empty bill still goes at once. A minus sign now gives "These cannot be below zero: sent to the grid. Check the minus sign." and a red field border, instead of calc's developer text; bill number inputs carry `min="0" step="any"` so decimals stay valid. One date style everywhere ("1 Sep 2026"): en-GB wrote "Sept", the chart and table used en-PH month-first. The PR definition shows under the first answer only; the healthy line and the basis stay on every dial. Chip wraps cleanly beside the title on phones. Checked at 390 and 1440 px, light and dark.
- [x] **Re-critique (run 2, 26/40 on deeper paths) and add-bill polish.** "Add another bill" scrolled to the end of the list, leaving the new bill about 1,200 px above the screen on phones; it now scrolls the new bill to the top and puts the cursor in its start date. After Remove, focus goes to the bill that took its place, not the top of the page. The findings sheet's questions use the screen's "1 Sep to 1 Oct 2026" (`period` passed to `findings()`, raw dates as fallback, 1 test). Dark-mode focus ring on the white findings paper is blue (yellow was 1.55:1). Checked at 390 and 1440 px. `node --test`: 113 pass.
- [x] **Red result flag (`/impeccable layout`).** The two-low-months flag was a red-on-pink paragraph with no way to act. It is now a neutral block, red only on a marked label, with the question copy and the next steps in order: "Check the weather first" (only while unchecked; a cloudy stretch can clear the flag) and "Open findings sheet" (opens and scrolls to it). After a failed check the button reads "Try the weather again" and a line says the sheet shows PR against a typical year. Checked at 390 and 1440 px, light and dark.
- [x] **Bill decoder hardened (`/impeccable harden`).** Steps 3 and 4 said things the numbers contradicted. Now: total below the worked-out charges gives "Hindi tugma ang total" with the gap in pesos (was "₱0.00 ay fixed charges… hindi kailanman zero"), and the teaser reads "Check the total"; credit above the variable charges says so and names the uncounted excess (was "₱3,600 minus ₱4,850 ay ₱0.00"); a total equal to what is left after the credit says nothing is left for fixed charges and that they were probably entered with the variable charges. `billDecode` returns `excess` and `noFixed`, and the mismatch flag allows 50 centavos for rounding (`ROUND_PHP`), 1 test. Checked the four cases at 390 px.
- [x] **Payback tiles clarified (`/impeccable clarify`).** Before a year of bills (`PAYBACK_MIN_DAYS`, same as the sheet) the pace tiles carry an amber tag worded for the season the bills cover: "Early: rainy months read low" (all Jun to Oct), "Early: sunny months read high" (all Nov to May) or "Early: under a year of bills" (mixed). The paragraph under them no longer repeats the tile numbers early on; it says the pace and payback year will move until about a year of bills. After a year the old "rough guide until a full year" line is gone. Also fixed a regression from the decoder pass: the "Check the total" teaser read `decode(b).flags` while a bill could not be decoded yet (page error on every keystroke until then).
- **Re-critique run 3 (25/40; 26, 26, 25 across runs that each tested deeper paths).** All run-2 fixes verified, zero page errors. New P1s: the on-screen PR definition describes module efficiency, not PR (`index.html:271`; the sheet's is right); ticking battery after bills silently drops savings and payback; a weather click disables the focused button so focus drops to the page.
- [x] **PR definition corrected (`/impeccable clarify`).** Under the first dial it said "how much of the sun's energy on your panels became electricity", which is module efficiency (about 20%), so "healthy is 0.75" read as 75% conversion. Now: "PR compares what your panels made with what panels their size would make in the sun they got, if nothing were lost. Heat, dust, wiring and the inverter always take some, so real systems sit below 1.00." Matches the sheet and SPEC F1. The other PR wording in the app was already right.
- [x] **Savings capped at the variable charges (Fred, 1 Oct 2026).** `savings()` takes `creditCap` (the bill's variable charges); credit above it is left out and shown under "What solar saved you" as not counted, ask your utility whether it carries over (`uncountedCredit`). Matches the decoder. 500 kWh exported at 9.70 against PHP 1,200 variable charges now saves PHP 1,200 of credit, not PHP 4,850. 1 test.
- [x] **Gaps between bills flagged (Fred, 1 Oct 2026).** `billGaps()` in `calc.js` (a next bill starting more than `CONSECUTIVE_GAP_DAYS` after the last one ends), 2 tests. The later bill says "No bill for 1 Aug to 1 Sep 2026" and why it matters; the sheet adds a basis line. Red-flag and payback logic unchanged.
- [x] **Battery and savings nudge.** Once PR shows, a bill missing savings inputs says which ("also add battery charged and battery discharged"); this also tells first-timers the bill numbers are only for savings. Saving setup with battery ticked opens bills that lack battery numbers.
- [x] **Weather clicks keep focus.** Buttons use `aria-disabled` while loading (a guard in `checkWeather` stops double runs), so keyboard focus stays put. The two-low-months block has a `role="status"` line: "Checking the weather for these dates", then the cause on failure.
- Polish pass at 390 px: all four checked in Chromium with no page errors; fixed "No bill between X to Y" to "No bill for X to Y". `node --test`: 117 pass.
- **Re-critique run 4 (26/40; trend 26, 26, 25, 26).** Run-3 fixes verified, zero page errors. New P1s: the findings sheet opens with zero bills and claims "the latest bill is within the usual range" (`allClear` is only "no questions", `findings.js`); focus drops to the page after Continue, Try an example, Start with mine, Keep it, Edit and Save changes.
- [x] **PR above 0.90 flagged (Fred, 1 Oct 2026).** `PR_PLAUSIBLE_MAX` = 0.90 and `prTooHigh` in `calc.js`. A bill above it gets band `check`: chip "check numbers", headline "Higher than panels this size can make. Check the dates and kWh.", sheet row "Check figures" with a basis note; never "healthy" or "within range". The dial turns grey (one grey arc, grey needle and digits, `--d-grey` per theme) so the gauge reads as "check this", not a result (Fred). 2 tests.
- [x] **Weather index rejected when it alone pushes PR above 0.90 (Fred, 1 Oct 2026).** Found testing the example: Manila, Aug 2026, satellite has no data and NASA POWER alone gives an index of 0.657 (a very cloudy month in its data), so the example's made-up PR 0.79 became 1.20. `judgedPr` now keeps the typical-year PR in that case (`weatherRejected`, `prWeather`), the bill and sheet say why, the weather column reads "(not used)", and the year-over-year check skips that period. A PR already above 0.90 before weather keeps the adjustment, since the inputs are the suspect. Example banner says the weather check uses real weather and will not match the made-up numbers. Checked in Chromium with the real NASA and satellite responses for that point. `node --test`: 119 pass.
- [x] **Run-4 P1s closed (2 Oct 2026).** The sheet with no reviewable bill says "Nothing to review yet" instead of an all-clear. Focus now lands on the next thing after Continue (first bill), Try an example (first bill), Start with mine (city field), Edit (city field), Save changes (Edit button) and Keep it (that bill's Remove button). Checked in headless Chromium at 390 px, no page errors. `node --test`: 119 pass.
- **Not done, later (Fred, 1 Oct 2026):** battery-toggle leftovers (sheet "n/a" with no reason, payback card vanishes); one full dial on the latest bill only; no h1 after setup; unnamed focusable chart; retry button has three labels; sheet band words differ from screen. per-field setup errors, hybrid-toggle nudge, neutral weather-failure note, one-line ledger for past bills.
- **Re-critique run 5 (2 Oct 2026): 28/40** (design review, up from 25 to 26), plus a detector and browser pass with no P0 or P1 (the 43 detector hits were cross-theme print variables, a chart legend swatch and the committed graph-paper world; computed contrast, overflow, focus rings, reduced motion and one-page print all clean).
- [x] **Run-5 fixes.** Setup error sits above the fields (it was below the fold on phones while focus jumped to the top). A visually hidden h1 after setup (the page had none). "Give feedback" link and checkbox labels are 44 px tall. One yellow primary button at a time: "Check the weather" until a check has run, then "Findings sheet for my installer". Checked at 390 and 1440 px, no page errors. `node --test`: 119 pass.
- **Run-5 left, not done:** collapse earlier bills to a one-line summary once a newer one exists (long scroll at 390 px); move the weather card above the actions row; chart axis text renders about 10 px at 390 px; no footer landmark; no "I don't know" path for panel and inverter size; "Use my location" sits under coordinates.
- **Re-critique run 6 (2 Oct 2026): 27/40** (stricter reviewer). Earlier bills fold to one line, the weather card moved above the actions row, setup hints say what to do when unsure, 12 px chart text, footer landmark (Fred asked for 30/40 before public deployment; Fred has already tried the weather check, save-file download and Safari on a real iPhone).
- [x] **Run-6 fixes (error prevention, efficiency, error recovery).** A new bill starts on the last bill's end date and repeats its generation charge (an untouched prefill does not count as data, so an empty new bill still removes without asking). Setup errors sit under each missing field (`aria-invalid`, `aria-describedby`, cleared on typing) as well as on top. Weather error lines fold under "What went wrong". Remove and Show details name their bill; the four "Ano ito?" toggles name their topic; Total due marked optional; the chart has a name; zero-export hint says "Leave net metering unticked".
- **Re-critique run 7 (2 Oct 2026): 29/40.** Only flexibility (2) is below 3. Run-7 fixes: the weather card appears once a bill can be checked, with the privacy detail behind "What is sent?"; error text spaced off its field; duplicate "or try an example" removed; help toggles start with "?".
- **Run 7 re-score: 29/40 (flexibility 2).** Fixes: the landing shows the hero only and opens the setup form on "Check my system"; while typing a bill, fields show last bill's numbers as placeholders (reference only, never stored or used), and variable charges shows "about N at last bill's rate" once kWh bought is typed; payback inputs marked optional; battery hint says where to look. 119 tests pass.
- **Run 8 (2 Oct 2026): 30/40, target reached** (flexibility 2 to 3; every other heuristic at 3, none at 4). Fixed after: empty Step 1 card on landing (hidden until the form opens), truncated variable-charges placeholder (shorter, rate explained in the hint). **Left, not done:** fold "Numbers for this period" once a bill has its first answer and reveal "From your bill" only after PR (verdict sits below 9 inputs on phones); keyboard path to the next bill; weather result still apart from its bill; magnitude sanity warnings at entry.

## 13. Go live on myscnd.app (2 Oct 2026)

Decided by Fred, 2 Oct 2026: path B, new domain bought in Cloudflare, attached to the `scnd` Worker, production only. alfredbalaga.com is not touched (Porkbun registrar, DNS split with Hostinger). See `docs/CUSTOM-DOMAIN.md`.

- [x] **`wrangler.jsonc`:** `"preview_urls": false` and `"routes": [{ "pattern": "myscnd.app", "custom_domain": true }]`, each with a comment. `workers_dev` left on for beta testers. `npx wrangler deploy --dry-run` passes (bindings LIMITER and ASSETS listed, no errors); `node --test` 119 of 119 pass. Not deployed from the session.
- [x] **Docs:** `docs/CUSTOM-DOMAIN.md` rewritten for what was done, path C shrunk to a rejection note; README deploy section and SPEC hosting line updated.
- [ ] **Smoke test the live site.** Not run from the build sandbox: its proxy answers 403 to CONNECT for myscnd.app:443, so nothing could be fetched or checked. Run by hand, on a phone over mobile data: the page loads over https with a padlock; enter a sample bill; the result and dial show; print the findings sheet; fonts show (pixel headings, LCD digits); no broken images or console errors. On a laptop, in the browser dev tools Network tab, check no 404s and that `.js` is `text/javascript`, `.json` is `application/json` and `.woff2` is `font/woff2`.
- [x] **Rate-limit check: the production counter did not trip (Fred, 2 Oct 2026).** Three runs against myscnd.app, 150 requests each, no `429`: sequential; parallel (`xargs -P 20`) in 2.0 s; parallel in 1.8 s with the `x-limiter` header, all 150 `ok`. So the Worker runs (CSP header present), `LIMITER` is bound (dashboard, namespace 1001), `limit()` does not throw (`ok`, not `open-error`), and it still approved about 75 requests a second from one IP against a configured 100 per 10 seconds. Local `wrangler dev` blocked correctly. Cause not confirmed: the likely one is that the binding is per location and eventually consistent, so it is looser than configured. **Decided (Fred, 2 Oct 2026): keep as is,** a loose backstop. Watch the daily request count against the Free plan cap of 100,000; revisit (Workers Paid or a stricter limit) only if it shows real bot traffic. Not changing the 100 per 10 s threshold without Fred's say-so. `docs/RATE-LIMITING.md` now says production enforcement is approximate and was not observed at the configured number.
- [x] **Cloudflare dashboard, by hand (confirmed by Fred, 2 Oct 2026):** toggle **Preview URLs** off for the `scnd` Worker (the file now says so, the dashboard setting should match); confirm the Custom Domain is production only; confirm the Git-connected deploy after this merge keeps the domain.
- [x] **Beta over (Fred, 2 Oct 2026):** `"workers_dev": false` in `wrangler.jsonc`. After the deploy, the workers.dev address stops answering; tell testers to use myscnd.app. In the dashboard, check the workers.dev subdomain toggle for `scnd` matches.
- [ ] **Separate cleanup:** duplicate `_dmarc` record on alfredbalaga.com.
- [ ] **Doorway link** on the author site to https://myscnd.app (plain link, no iframe).

## 14. Pre-launch audit (2 Oct 2026)

Requested by Fred before the public LinkedIn and Facebook share. Full report: `docs/pre-launch-audit.md`. Branch `pre-launch-fixes`, not deployed.

- [x] **H-1** Worker entry module exported constants, so `wrangler dev` 4.146.0 would not start. Moved to `src/headers.js`.
- [x] **H-2** Every static file ran the Worker (14 Worker requests per visit against the Free plan's 100,000 a day). Static files now bypass it; `public/_headers` gives them `nosniff` and `no-referrer`. This replaces the note in task 11 item 7 that `_headers` files do not apply: they do now, for the excluded paths.
- [x] **H-3** Two-low-months question and headline now say when the months were judged against a typical year without a weather check.
- [x] **H-4** Open Graph and Twitter tags, `public/icons/og.png` (`scripts/gen-og.mjs`), canonical link.
- [x] **H-5** "Privacy and limits" footer section and a visible estimates line.
- `node --test`: 124 pass. Checked under `wrangler dev` and headless Chromium at 390 px.
- [ ] **Fred:** deploy, then the post-deploy checklist in the report; dashboard items (workers.dev and preview toggles, DNSSEC, HSTS, no-mail DNS records); decide the Medium items and L-5 (employer names in two docs, repo private).

## 15. Tip line and footer (2 Oct 2026)

Requested by Fred. Plain links only: no Ko-fi widget, script, cookie or request from the page.

- [x] **Tip line** under the findings sheet (`index.html`, `aside.tipjar`), only while the sheet is open. One sentence, a Ko-fi link, and a QR Ph `<details>` that appears only if `/assets/qr-ph.png` exists (probed once by `probeQr()` in `app.js`). Payee line reads `PAYEE_NAME` and stays hidden while it is still the `[PAYEE_NAME]` placeholder. Not printed.
- [x] **Footer:** "Give feedback" (`FEEDBACK_URL`, already set to the Google Form on 30 Sep) is the first item, Ko-fi second, then one privacy line. Each link hides when its constant is empty. 44 px tap targets.
- [x] `"!/assets/*"` added to `run_worker_first` so the QR file does not spend Worker requests. 2 tests. `node --test`: 126 pass.
- [x] `PAYEE_NAME` set to "AL***D B." (the masked name GCash shows after a scan, from Fred).
- [x] `public/assets/qr-ph.png` added (Fred's GCash QR Ph crop, resized to 720 px wide, 30 KB; no mobile number or user ID in it). **Fred:** scan it once from the live page with another phone before sharing; no QR decoder was available here to test it.

## 16. Cloudflare Web Analytics disclosed (2 Oct 2026)

Decided by Fred, 2 Oct 2026: keep the Cloudflare beacon and disclose it (audit M-10), instead of turning it off.

- [x] `src/headers.js`: `script-src` allows `https://static.cloudflareinsights.com`, `connect-src` allows `https://cloudflareinsights.com`. Test updated.
- [x] "Privacy and limits" has a bullet: cookieless page-view counts by Cloudflare, nothing typed is sent to it, Cloudflare's policy applies. CLAUDE.md allows an optional cookieless counter.
- [x] Fred confirmed in the dashboard: workers.dev and Preview URLs off, custom domain production only (task 13).
- [x] **Fred (done, 2 Oct 2026):** after the deploy, the console shows no CSP error for `cloudflareinsights`; Always Use HTTPS and HSTS are on (audit L-1); the privacy notice is on the Google Form (audit compliance item 1); the link is scraped in Facebook's Sharing Debugger and LinkedIn's Post Inspector; the QR Ph image was scanned from the live page with a second phone.

## 17. Last small fixes before the share (2 Oct 2026)

Requested by Fred: audit M-6, M-7 and M-11. Nothing else changed.

- [x] **M-6, 404 page.** `public/404.html` (logo, "That page is not here", a link home, `noindex`) and `"not_found_handling": "404-page"` in `wrangler.jsonc`. The 404 page runs through the Worker like the main page, so it carries the same security headers. Checked under `wrangler dev`: `/nope` returns 404 with the page and the CSP; no overflow at 390 px.
- [x] **M-11, blank page on a failed script.** A "Loading SCND. If this stays blank, reload the page." line sits outside `<main>`. It fades in after 3 s (no flash on a normal load) and `app.js` removes it when Alpine starts. Without JavaScript a `<noscript>` line says what to do. Checked at 390 px with `js/app.js` blocked: the line shows and the page chrome still renders; with JavaScript off the noscript line shows and the loading line does not.
- [x] **M-7, who runs SCND.** Footer line: "SCND is a personal project by Alfred Balaga. For a data question, or to have a feedback answer deleted, use "Give feedback" above and include the name or email you gave." It points at the Google Form because no public email address was chosen; it hides if the form link is empty. **Fred:** if you want a direct address instead, give me one and I will swap it in.
- 3 tests added; `node --test`: 129 pass.
- **Still open from the audit, all need your decision:** M-3 (export credit carried over), M-4 (Manila PR reads about 4% low), M-5 ("everything you type" wording), M-8 (typo floor for PR), M-9 (hybrid export check), M-2 (CSP `unsafe-eval`, large), L-5 (employer names in two docs, repo private).

## 18. Body and figure fonts (6 Oct 2026)

- [x] **Chivo for text, Chivo Mono for figures (Fred's pick from an eight-font shortlist).** The system font looked different on every phone, so line breaks and spacing moved around. Chivo (Omnibus-Type, SIL OFL 1.1) now sets body and UI text, and Chivo Mono sets stats, values in the result cards, chart tooltips and the chart table. Pixelify Sans headings and the DSEG7 LCD stay. Body line height 1.5 to 1.55 because Chivo sets slightly dark. Variable Latin files, 33 KB and 26 KB, self-hosted, licences alongside.
- [x] **Peso sign on screen and on the findings sheet.** None of the Latin font files has ₱, and Google's latin-ext files are 23 to 60 KB each for that one glyph. `scripts/fetch-fonts.py` (dev-only, needs `fonttools` and `brotli`) cuts a ₱-only file per family (1.1 to 1.4 KB), served on a `unicode-range: U+20B1` face. The sheet writes ₱ again instead of PHP. The Source faces need one rule per weight: Chrome only combines faces whose weight descriptors match, and with a 200 to 900 range it fell back to Liberation Serif for ₱.
- Verified in headless Chromium at 390 px, light and dark: every font comes from our own host, no third-party request, no console errors, no horizontal scroll, ₱ drawn by Chivo Mono in the result cards and by Source Serif 4 on the sheet (checked with DevTools platform fonts). 133 unit tests pass.
- **Not verified:** Safari (iPhone) and how Chivo reads on your phone.

## 19. Trust fixes from the audit (31 Oct 2026)

Requested by Fred after a product review: close the open calculation and claims items before promoting further. Thresholds and wording decided by Fred, 31 Oct 2026.

- [x] **M-9, hybrid export above PV yield.** `energySplit` only rejects export above generation for on-grid systems; hybrids are checked on S = G − X − C + D alone, so a battery that discharges to the grid gets its savings. 2 tests.
- [x] **M-8, PR floor 0.30.** `PR_PLAUSIBLE_MIN` and `prTooLow` in `calc.js`. A bill below it gets band `check` with `checkLow`: grey dial, chip "check numbers", headline "Lower than a working system makes. Check the dates and kWh, or whether the system was off.", sheet row "Check figures" and a basis line. Never red, so it cannot count toward the two-low-months flag, and it is left out of the year-over-year pairs. 1 test.
- [x] **M-4, Manila bias disclosed, not corrected.** `MANILA_BIAS` and `nearManila` in `calc.js` (0.5° around 14.6, 121.0, the only point checked against Global Solar Atlas). The dial's basis line and the sheet's sun-data line say PR may read about 4% low there. Bands and sun data unchanged. 1 test.
- [x] **M-3, credit carry-over caveat.** `findings()` takes `creditLeftOut` (sum of `uncountedCredit` over bills with savings). The payback question and the early awareness note name the amount and say the real pace may be closer if the utility carries it over; the Payback card says the same. 2 tests.
- [x] **M-5, privacy claim made exact.** Hero and `og:description` now say "your bills and kWh stay in this browser"; the footer names the weather check as the one exception.
- Checked in headless Chromium at 390 px with a Manila on-grid save (typo bill at 1.25 kWh, credit above variable charges) and a Cebu hybrid save (G 300, X 320, C 50, D 100): grey check-low dial, Manila note on screen and sheet, credit line on the Payback card, hybrid savings shown with no misalignment message, no page errors. `node --test`: 140 pass.
- **Noted, not changed:** a check-low bill still adds its savings to the payback total (₱15 in the typo case). Small, and the bill is already flagged.

## 20. Landing that shows what SCND does (31 Oct 2026)

Requested by Fred after the product review: a visitor from a post saw a headline, two buttons and the step rail, with every feature behind "What is SCND?".

- [x] **"What you get" open on the landing page.** The About card shows by default before the form opens (`landing` getter in `app.js`), headed "What you get", with no Close button. After "Check my system" or setup it goes back to opening on demand as "About SCND". The hero's "What is SCND?" link shows only once the form is open, since the card is already on screen before that.
- [x] **"You need" line** in the hero: the latest bill and the solar kWh for the same dates from the inverter app. No time claim, because the 5-minute check is still unverified.
- [x] **"Also" line** under the four tiles naming the weather check, payback against the promise, battery health and the findings sheet.
- [x] **Sample answer.** The dial is drawn by the same code as a real bill (`dial` now calls `dialSvg`, `sampleDial` passes made-up PR 0.79 in August), labelled "made-up numbers", with "See a full example". Figures are consistent: 600 kWh against 570 kWh expected at PR 0.75 is 5% over.
- No new request, dependency or claim about regulation, rates or programs. Checked in headless Chromium at 390 px (light and dark) and 1280 px: no horizontal overflow, no page errors, card hides after "Check my system" and reopens from "About" without the sample. `node --test`: 140 pass.
