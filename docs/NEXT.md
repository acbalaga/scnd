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
    - [ ] (blocked: needs the spike 2 annual means in `SPIKE2_ANNUAL_MEAN`, test/grid.test.mjs) Laoag, Iloilo, Cebu and Davao annual GHI within ±8% of the spike 2 NASA monthly means (sanity check that the grid and interpolation are wired correctly).
    - [ ] (FAILS, decision needed) Diffuse fraction is between 0.3 and 0.7 for every cell and month (sanity bound for PH climate). Result: 42 cell-months in Mar and Apr (Mindoro, Palawan, Panay) sit at 0.279 to 0.300; max is 0.634.

## 2. Calc core

`public/js/calc.js`: pure functions, no DOM, no fetch. Tests in `test/calc.test.mjs`, run with `node --test`.

- **Plane-of-array irradiation for a month** from monthly mean GHI and diffuse, tilt, azimuth (0 = south, 90 = west, −90 = east, matching PVGIS convention), latitude. Method: integrate hour by hour over the month's mean day (Liu-Jordan / Collares-Pereira-Rabl hourly apportioning of daily global and diffuse), isotropic sky, ground albedo 0.2. Return kWh/m²/month.
- **Golden cases for POA:** generate reference values once with `pvlib` (Python, dev-only, in `scripts/`) for at least: Manila tilt 10° south, Manila tilt 15° east, Davao tilt 5° north, Laoag tilt 20° south, for January and July. Commit the reference numbers as fixtures. Pass rule: within ±3% of pvlib.
- **PR, weather split, energy split, savings, load-shift value, degradation, hybrid balance** exactly as in `docs/SPEC.md` "Calculation method" (F1, F4 to F9).
- **Edge cases with tests:** S < 0 (period misalignment) returns an error object, not a number; zero export after net-metering activation raises a flag; DC/AC above 1.3 raises a clipping flag; hybrid with C > PV surplus raises grid-charging flag; F8 returns null under 13 months.
- **Checks**
    - [ ] `node --test` passes, every exported function has at least one golden case and one edge case.

**Decision (ask Fred):** PR band thresholds for dry season given NASA's up to −8% dry bias. Proposal: green ≥ 0.75, amber 0.62 to 0.75, red < 0.62 in Nov to May; unchanged in Jun to Oct.

## 3. Input flow and F1, F5, F6, F7

System setup once (location, kWp, tilt, facing, inverter AC kW, commissioning month, hybrid yes/no), then one card per bill. Results for F1, F5, F6, F7. Mobile first. English UI; Taglish for help text.

- **Checks**
    - [ ] A first-time owner can finish setup plus one bill in under 5 minutes on a phone.
    - [ ] Network tab shows no request other than static files and the rounded-coordinate irradiance calls.

## 4. F2 bill decoder

Annotated walk-through of the user's own bill numbers. Explain export credit at the generation charge, and why fixed charges keep the bill above zero.

## 5. F4 weather check

Himawari monthly ratio to its own climatology, cross-checked against NASA POWER; "uncertain" label when they disagree by more than 5 points.

**Decision (ask Fred):** Himawari climatology baseline period (the API's history depth decides this; check how far back `satellite_radiation_seamless` goes for PH points).

## 6. F3 findings sheet, save/load JSON

## 7. F8 degradation, F9 hybrid

## 8. Clean-up before beta

- Remove spike pages and the `/api/pvgis` and `/api/gsa` proxy routes (keep them in git history).
- Private beta: Fred is recruiting five owners across three DUs, at least two hybrids.
