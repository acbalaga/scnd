# SCND: Phase 1 Spec

Sep 29, 2026 · Alfred Balaga

> Snapshot of the living spec at 29 Sep 2026. Where it conflicts with `CLAUDE.md` or `docs/NEXT.md`, those win: they record decisions made after the spikes. Known stale items: build-plan steps 1 and 2 and the first acceptance criterion reference PVGIS (it does not cover the Philippines); "Filipino/Taglish copy" is no longer deferred; the architecture table's F4 row is superseded by the spike 2 result below it.

## Problem and evidence

A Filipino household that spent ₱300k to ₱1M on rooftop solar has no independent way to answer three questions: is the system producing what it should, where did my savings go, and is the installer's payback promise holding. The inverter app shows kWh produced. The Meralco bill shows kWh imported and exported. Neither shows the other half, and neither corrects for weather.

- **Volume is real and growing.** Meralco reports about 20,000 net-metered rooftops (\~170 MW), and satellite analysis suggests roughly a third of rooftops in its franchise are unpermitted. ([CleanTechnica](https://cleantechnica.com/2026/05/04/guerilla-solar-installations-discovered-need-to-be-controlled-says-philippine-power-distributor/))
- **The export credit is widely misunderstood.** Published PH guides disagree on the rate: some say exports earn the retail rate (₱12 to 14/kWh), others the generation charge (₱9.70/kWh on Meralco's September 2026 schedule). The second is correct. Owners reading the first set expect savings they will never see. ([Lakasolar](https://lakasolar.ph/news/meralco-solar-rebate-vs-net-metering-philippines-2026), [Blueshift](https://blueshift.ph/articles/net-metering-philippines))
- **The app-to-bill gap trips people up.** The inverter app reports total generation while only the surplus shows on the bill as export, and installers publish explainers for exactly this confusion. ([SolarPro Install](https://solarproinstall.com/meralco-net-metering-bill-philippines/))
- **Approval delays muddy the first months.** Credits only start after the meter swap, and the Senate heard complaints of long waits as recently as September 2026. ([Inquirer](https://newsinfo.inquirer.net/2303165/erc-meralco-vow-faster-net-metering-approvals-for-solar-power-users))

Existing PH tools are pre-purchase ROI calculators and installer content. Post-install verification, owner-side, is the gap.

## Users and jobs-to-be-done

Primary user is the non-technical owner of a 3 to 15 kWp residential or small commercial on-grid or hybrid system, on Meralco or a Visayas/Mindanao DU. Secondary user is the honest installer who wants a neutral third-party check to show a skeptical client.

| User | Job | Trigger |
| --- | --- | --- |
| Owner, month 1 to 6 | "Is my system even working?" | First bill arrives and isn't zero |
| Owner, year 1+ | "Is it still performing, or degrading?" | Output drop in rainy season, or a neighbor's bill is lower |
| Owner, any time | "Where did my savings actually come from?" | Payback promise vs reality |
| Owner, dispute | "What do I show my installer?" | Suspected fault, installer says it's the weather |
| Installer | "Prove the system is fine" | Client complaint |

Not the user in v1: utility-scale, C&I above 100 kW (outside net metering), off-grid systems (no bill export).

## v1 scope

v1 ships eight features. Three are the core you picked; five exist because the inverter app and the bill each hold half the picture, and nobody joins them.

| # | Feature | Answers | Inverter app? | Bill? |
| --- | --- | --- | --- | --- |
| F1 | Performance check | Is PR within band for this month? | No | No |
| F2 | Bill decoder | Why isn't my bill zero? What is the credit worth? | No | Partly (raw lines) |
| F3 | Findings sheet | One printable page to hand the installer | No | No |
| F4 | Weather or system? | Was a low month cloudy, or is something broken? | No | No |
| F5 | Energy split | How much solar did the house actually use vs export? | Only with a CT meter | No |
| F6 | True savings and payback tracker | Pesos saved this month, and is the installer's payback on track? | No | No |
| F7 | Load-shift value | What is moving 1 kWh from night to noon worth? | No | No |
| F8 | Degradation vs module warranty | Is year-over-year loss beyond the warranted rate? | No | No |

**Hybrid systems are first-class in v1.** A large share of home installs ship with a battery, and many run zero-export, so the bill alone says little. Hybrid owners add four monthly numbers their app already shows: PV yield, battery charge, battery discharge and, where the app has a CT, home load. That unlocks one more feature:

| # | Feature | Answers | Inverter app? | Bill? |
| --- | --- | --- | --- | --- |
| F9 | Battery value and health | Is the battery earning its cost? Is its round-trip efficiency drifting? Is PV being curtailed or the battery charging from the grid at night? | Raw kWh only | No |

**Inputs, all typed by the user:** location (pin or barangay, rounded), kWp, tilt and facing, inverter AC rating, commissioning month; monthly inverter kWh; per bill: import kWh, export kWh, generation charge, total amount; optional: installer's promised monthly savings and payback years, module warranty degradation %/yr, outage hours.

**Deferred to v2:** quote auditor tab, brand CSV import, screenshot OCR, link-out to the obsolescence tracker, Filipino/Taglish copy.

Design note: rates are always read off the user's own bill, never hard-coded. That sidesteps the retail-vs-generation-rate confusion and survives monthly rate changes and non-Meralco DUs.

## Calculation method

Every number is computed in the browser from the user's inputs plus a monthly irradiance value. Nothing needs more than arithmetic.

**F1 Performance ratio.** Plane-of-array irradiation H\_POA (kWh/m² for the period) comes from horizontal irradiation via Erbs decomposition and an isotropic transposition for the user's tilt and facing.

```latex
PR = \frac{E_{inverter}}{P_{kWp} \times H_{POA}}
```

Bands (tunable): green ≥ 0.75, amber 0.65 to 0.75, red < 0.65. Red is only raised after two consecutive months, because satellite monthly irradiance carries roughly ±5 to 10% error at a single point. A commercial rooftop benchmark of 78 to 82% PR is published by PH installers ([Solaren](https://solaren-power.com/comparing-solar-quotes-in-the-philippines/)); residential sits lower with shading and heat.

**F4 Weather or system.** Weather index WI = actual-month H\_POA ÷ typical-month H\_POA. The shortfall against a typical month splits into two parts:

```latex
\Delta E = \underbrace{E_{typ}(1 - WI)}_{weather} + \underbrace{(E_{typ} \cdot WI - E_{inverter})}_{system}
```

**F5 Energy split.** With G = inverter kWh, X = exported kWh and I = imported kWh for the same billing period: self-consumed S = G − X, household load L = I + S, self-consumption ratio = S ÷ G. Bill periods are not calendar months, so the form asks for the bill's reading dates and the inverter kWh between them (every major app shows daily totals).

**F6 True savings.** Savings = S × r\_import + X × r\_export, where r\_import = the bill's variable charges ÷ I, and r\_export = the generation charge printed on the bill. Cumulative savings are plotted against system cost and the installer's promised payback line.

**F7 Load-shift value.** Each kWh moved from night to midday is worth r\_import − r\_export. At the September 2026 Meralco figures cited above that is roughly ₱6/kWh.

**F8 Degradation.** Year-over-year ratio of weather-normalised PR for the same calendar month, compared against the module warranty's annual degradation. Needs 13+ months of data; hidden until then.

**F9 Hybrid energy balance.** PR uses the app's PV yield, not inverter AC output, so battery losses don't read as a PV fault. With C = battery charge and D = battery discharge:

```latex
L = I + G_{PV} - X - C + D
```

Monthly D ÷ C is an apparent round-trip efficiency; a sustained drop against the owner's own first months flags battery or BMS issues. Battery value = D × (r\_import − r\_export), i.e. what each stored kWh earns over exporting it, tracked against the battery's share of system cost. Three extra flags: PV curtailment (zero-export, battery at 100%, PR dips on sunny days), grid charging at night (C greater than PV surplus), and backup hours during brownouts, noted but not priced.

**Sanity flags:** DC/AC ratio above 1.3 (clipping lowers PR in sunny months), S < 0 (inverter and bill periods misaligned), zero-export months after net-metering activation (meter not reversed), outage hours entered (on-grid inverters stop during brownouts by design).

## Architecture and privacy

The tool is a set of static files with no server of ours, no accounts and no database. The user's system details and bills never leave their browser; the only outbound request is an optional weather lookup with coordinates rounded to about 11 km.

| Decision | Choice | Why |
| --- | --- | --- |
| App shell | Static HTML + Alpine.js, ES modules, no build step | Same mental model as SCNTL's Alpine layer; any static host serves it |
| Typical-year irradiance (F1, F7) | Pre-computed JSON grid for PH land cells (0.25°): monthly GHI, diffuse fraction, ambient temp; est. under 200 KB | Source under validation (spike 2, 29 Sep): PVGIS SARAH-3 does not cover the Philippines and only offers ERA5 reanalysis there, so the grid will be built from whichever source best matches Global Solar Atlas long-term monthly GHI, or from GSA itself if its CC BY 4.0 terms allow bulk use ([PVGIS API](https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/getting-started-pvgis/api-non-interactive-service_en)) |
| Actual-month irradiance (F4) | Browser fetch to Open-Meteo, coordinates rounded to 0.1° | Free for non-commercial use, no key ([Open-Meteo](https://open-meteo.com/en/features)). CORS not yet verified: spike task 1. Fallback NASA POWER; last resort, F4 compares against typical only |
| Persistence | None by default. "Save my data" downloads a JSON file; "Load" reads it back | Monthly return visits work without us storing anything |
| Findings sheet (F3) | Print stylesheet + `window.print()` → Save as PDF | No PDF library, works on phones |
| Charts | Inline SVG, hand-rolled | No dependency, prints cleanly |
| Analytics | None, or a cookieless page counter | Privacy claim stays literally true |

**Spike 2 result (29 Sep 2026), supersedes the irradiance rows above.** PVGIS SARAH-3 does not cover the Philippines, so sources were scored against Global Solar Atlas long-term monthly GHI, 2020 to 2023, five cities (Laoag, Manila, Iloilo, Cebu, Davao).

| Source | Wet-season bias vs GSA | Dry-season bias vs GSA | Month-to-month agreement with NASA (r) | Role |
| --- | --- | --- | --- | --- |
| NASA POWER | −4.8% to +4.0% | −7.9% to +0.1% | n/a | F1 typical year (widen dry-season amber band) |
| Open-Meteo satellite (Himawari, 5 km) | +7.3% to +13.1% | +4.0% to +9.2% | 0.90 to 0.96 | F4 weather index, as a ratio to its own climatology so the bias cancels |
| Open-Meteo archive (reanalysis) | −1.9% to +11.8% | −3.5% to +12.7% | 0.81 to 0.89 | Dropped |

F4 cross-checks each month's Himawari weather index against NASA; a gap above 5% labels the weather call "uncertain". Open question: use GSA directly for F1 if its terms permit automated use.

Compute load is a few hundred arithmetic operations per month of data. A 2018 budget Android phone handles it.

## Hosting on alfredbalaga.com

Serve the app from a subdomain (e.g. `solar.alfredbalaga.com`) and surface it from the author site. The Website Builder itself is the wrong place for app code: its Embed code element is meant for snippets and chokes on large inline payloads ([Hostinger](https://www.hostinger.com/support/6463152-hostinger-website-builder-how-to-embed-custom-code/)).

| Option | How | Trade-off |
| --- | --- | --- |
| A. Hostinger subdomain | Create the subdomain in hPanel, upload the static files | Zero new accounts; manual uploads; tied to a hosting term you have set not to renew (ends 2028) |
| B. GitHub Pages or Cloudflare Pages + CNAME | Repo deploys on push; CNAME `solar` to the host in Hostinger DNS | Free, git-based, survives leaving Hostinger; one DNS record to add |
| C. Iframe inside a Builder page | Embed code element holding an `<iframe>` to A or B | Keeps visitors inside your site chrome; printing the findings sheet from an iframe is clumsy, so pair it with an "open full page" link |

Recommendation: B for the app, C as the doorway on alfredbalaga.com. Verify in hPanel that subdomain DNS records are editable while the domain sits on the Builder.

**Decision: Cloudflare Workers Free with static assets.** Requests to static assets are free and unlimited ([Cloudflare docs](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)), so a static app costs nothing at any realistic traffic. The catch: a Workers custom domain needs the domain's nameservers on Cloudflare, unlike Pages, which accepts a CNAME for a subdomain ([cogley.jp](https://cogley.jp/articles/cloudflare-pages-to-workers-migration)). Two paths: move alfredbalaga.com's DNS to Cloudflare and re-point the Builder site from there (confirm Hostinger supports that for the Builder first), or launch on the free `*.workers.dev` address and add the custom domain later. The same Worker can later host a small proxy if Open-Meteo refuses browser calls, inside the free script quota.

## Risks and mitigations

The biggest risk is a false red flag that sends an owner to fight an installer over satellite error. Every other risk is smaller.

| Risk | Consequence | Mitigation |
| --- | --- | --- |
| Satellite irradiance error at a single point | False amber/red, installer dispute over nothing | Wide bands, red only after two consecutive months, findings sheet states the uncertainty in plain words |
| Unmodelled shading (neighbor's roof, water tank) | PR reads low year-round | Ask "any shading after 9am or before 3pm?"; if yes, compare month to month rather than against absolute band |
| Bill period vs inverter period misalignment | Negative self-consumption, nonsense savings | Force reading dates; S < 0 blocks the result and explains why |
| Users treat output as a verdict on their installer | Reputational heat for you | Findings sheet framed as "questions to ask", no installer names stored or shown, disclaimer that it is a screening check, not an inspection |
| Open-Meteo CORS or terms change | F4 breaks | Fallback chain (NASA POWER, then typical-only); non-commercial use only |
| Employer IP overlap | Ownership dispute | Low: residential net-metering is outside NAC's business. Build on personal hardware and time anyway, and keep it off company devices this time |

**Out of scope:** diagnosing specific faults, string-level data, cell-level or SoC-curve battery analysis (v1 works from monthly charge and discharge totals), anything above 100 kW.

## Build plan and acceptance criteria

Nine steps, the calc core before any UI, so the numbers are trusted before anything looks finished.

1. **Spike (half a day).** From a local static page, confirm browser fetches to Open-Meteo and NASA POWER return data with CORS headers; pull PVGIS MRcalc for three PH points.
2. **Irradiance grid.** Python script builds the PH land-cell JSON from PVGIS MRcalc (horizontal irradiation, diffuse ratio, average temperature).
3. **Calc core.** One pure JS module (transposition, PR, split, savings, degradation) with golden-case tests, the same discipline as SCNTL's regression suite.
4. **Input flow + F1, F5, F6, F7.** System setup once, then one card per bill.
5. **F2 bill decoder.** Annotated walk-through of the user's own numbers: import, export, credit, fixed charges.
6. **F4 weather check** wired to the verified source.
7. **F3 findings sheet + save/load JSON.**
8. **Private beta** with 5 owners across Luzon, Visayas and Mindanao DUs; compare the tool's PR against each owner's installer claims.
9. **Deploy** to the subdomain; doorway page on alfredbalaga.com.

**Done when:**

- [ ] Grid-derived annual yield is within ±3% of PVGIS PVcalc for Manila, Cebu, Davao, Iloilo and Laoag at the same tilt and loss
- [ ] Golden-case tests pass for every formula in Calculation method, including S < 0 and zero-export cases
- [ ] A first-time owner finishes setup plus one bill in under 5 minutes on a phone
- [ ] Network tab shows no request carrying user inputs, only the rounded-coordinate weather call
- [ ] Findings sheet prints to one A4/Letter page from Chrome and Safari mobile
- [ ] Every beta owner can explain their own export credit after using F2

## Open decisions

- [ ] **Name.** SCND, read "second": Solar, Consumption, Net-metering, Degradation, one letter per app tab. Tagline: "Your second meter." Deliberately in the SCNTL family. Check domain and FB page availability
- [x] **Hosting.** Cloudflare Workers Free, static assets. Beta testers use per-version preview URLs on workers.dev; custom-domain path still open (see Hosting)
- [x] **Hybrid systems.** In v1 scope as F9
- [x] **Language.** English UI; Taglish for bill-decoder explanations, tooltips and nudges; findings sheet stays English because it goes to the installer
- [x] **Obsolescence tracker.** Separate product and brand
- [ ] **Beta recruits.** Fred sourcing five owners across three DUs, with at least two hybrids

## Sources

- [CleanTechnica, guerrilla solar in Meralco's franchise](https://cleantechnica.com/2026/05/04/guerilla-solar-installations-discovered-need-to-be-controlled-says-philippine-power-distributor/)
- [Inquirer, ERC and Meralco on net-metering delays](https://newsinfo.inquirer.net/2303165/erc-meralco-vow-faster-net-metering-approvals-for-solar-power-users)
- [Blueshift, net metering guide with Sept 2026 rates](https://blueshift.ph/articles/net-metering-philippines)
- [Lakasolar, rebate vs net metering](https://lakasolar.ph/news/meralco-solar-rebate-vs-net-metering-philippines-2026)
- [SolarPro Install, reading the net-metered Meralco bill](https://solarproinstall.com/meralco-net-metering-bill-philippines/)
- [Solaren Power, comparing solar quotes in PH](https://solaren-power.com/comparing-solar-quotes-in-the-philippines/)
- [PVGIS non-interactive API](https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/getting-started-pvgis/api-non-interactive-service_en)
- [Open-Meteo features](https://open-meteo.com/en/features)
- [Hostinger, embedding custom code](https://www.hostinger.com/support/6463152-hostinger-website-builder-how-to-embed-custom-code/)
