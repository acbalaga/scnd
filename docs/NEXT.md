# SCND — next tasks

Work top to bottom. Each task ends with its checks passing and a commit. Ask Fred at any **Decision** line before proceeding.

## Done

- [x] **Spike 1: browser CORS.** Open-Meteo and NASA POWER both callable from the browser (desktop Chrome, iOS Brave). `public/index.html`.
- [x] **Spike 2: source validation.** Against Global Solar Atlas, 2020 to 2023, five cities. NASA POWER for typical year, Himawari (Open-Meteo satellite) for weather index. `public/spike2.html`, results in README.

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

System setup once (location, kWp, tilt, facing, inverter AC kW, commissioning month, hybrid yes/no), then one card per bill. Results for F1, F5, F6, F7. Mobile first. English UI; Taglish for help text.

- **Checks**
    - [ ] A first-time owner can finish setup plus one bill in under 5 minutes on a phone. Not verified: needs a real first-time owner. Setup is 6 required fields, a bill is 8.
    - [x] Network tab shows no request other than static files and the rounded-coordinate irradiance calls. Result (headless Chromium, 390 px wide, 3 bills): 7 requests, all static files from this origin, zero irradiance calls (typical-year sun comes from `public/data/ph-grid.json`), no console errors.

## 4. F2 bill decoder

- [x] Done. `billDecode` in `public/js/calc.js` (3 tests), and a Taglish "Decode this bill" walk-through in each bill card. Copy claims cite the SPEC sources (29 Sep 2026) in a comment next to the copy. A credit larger than the variable charges is flagged, not modelled, because how it carries over is not verified.

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

## 8. Clean-up before beta

- Remove spike pages and the `/api/pvgis` and `/api/gsa` proxy routes (keep them in git history).
- Private beta: Fred is recruiting five owners across three DUs, at least two hybrids.
