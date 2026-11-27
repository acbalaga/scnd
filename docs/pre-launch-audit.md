# SCND pre-launch audit

2 Oct 2026. Scope: the 12 areas in Fred's brief, for a public share of https://myscnd.app on LinkedIn and Facebook. Branch `pre-launch-fixes`, six commits on top of `main` at `4bf21f6`. Nothing deployed, no DNS or dashboard changes.

**Access during this audit.** At first this sandbox's egress policy blocked `myscnd.app`. Fred allowed it the same day and the live checks were then run (section "Live check" below). DNS-over-HTTPS, RDAP (WHOIS), certificate transparency, workers.dev and the Cloudflare API stay blocked, so those are in "Could not verify". The live site still runs `main`: the fixes on this branch are not deployed. Everything else was checked against the repo, the full git history, `wrangler dev` 4.146.0 running the real Worker locally, and headless Chromium at 390 px.

**Skills.** Loaded and followed: `vibe-security`, `no-ai-slop`, `senior-code-review`, `impeccable` (its launcher was not executable, so I read context directly and ran its detector through `sh`). Not available in this session: `/dependency-vetting`, `/legal:compliance-check`, `/qa`, and Claude in Chrome. Closest equivalents used: dependency vetting by hand (hash check against the npm release), a privacy-notice review against RA 10173's transparency principle from my own knowledge (not legal advice, not a compliance opinion), and QA by driving the local build in headless Chromium.

## Verdict

**Before fixes: GO WITH FIXES.** No secret, no employer data and no blocker turned up, and the calculation core is sound. Five High findings stood between this and a credible public share: a viral post could take the site down on the Free plan, the findings sheet could send an owner to the installer over a cloudy month, the link would preview badly on both launch channels, and the page had no limits or full privacy notice.

**After fixes: GO, once deployed, the Cloudflare beacon (M-10) is turned off or disclosed, and the post-deploy checklist passes.** All five Highs are fixed on the branch with tests, and the Worker, headers and page were re-checked under `wrangler dev`. What remains is on the live site and the Cloudflare dashboard, which only Fred can check or change.

## Findings

Ranked by severity. No Blockers were found. Effort: S under an hour, M a few hours, L a day or more.

| ID | Area | Finding | Evidence | Consequence | Status | Recommended fix | Effort |
| --- | --- | --- | --- | --- | --- | --- | --- |
| H-1 | Deployment | The Worker entry module exported two constants (`CSP`, `THEME_SCRIPT_HASH`). workerd treats every named export as an entrypoint and refused to start. | `src/worker.js:13,17` on `main`. `npx wrangler dev` (4.146.0): `Uncaught TypeError: Incorrect type for map entry 'CSP'`. | Local dev, the documented test path, is broken. A future runtime that applies the same check at upload would fail the Git deploy. Production accepted it as of Fred's 2 Oct curl run. | Fixed in `1eb430b` | Constants moved to `src/headers.js`; test asserts the entry module exports only `default`. | S |
| H-2 | Abuse and cost | `run_worker_first: true` made every static file a Worker request. One first visit is 14 Worker requests (measured), and revalidations count too. Free plan: 100,000 a day. | `wrangler.jsonc:10` on `main`; headless Chromium request log (page, CSS, 7 scripts, 3 fonts, 2 icons). Cloudflare docs: over the free limit, Worker-first paths get `429` instead of falling back to assets. | About 7,000 visits in a day (a modest viral share) and the whole site answers `429` until 08:00 PH time. | Fixed in `b88b9c0` | Worker now runs first on the page only; `!/js/*`, `!/vendor/*`, `!/fonts/*`, `!/icons/*`, `!/data/*`, `!/app.css`, `!/manifest.webmanifest` go straight to the free asset server. `public/_headers` gives them `nosniff` and `no-referrer`. Test fails if a file under `public/` is left on the Worker path. Headroom: about 100,000 page loads a day. | S |
| H-3 | Calculation integrity | Two red months raised the sheet question "Has a shading check or panel cleaning been done? What does the inverter fault log show?" even when both months were judged against a typical year because the weather check was never run. | `public/js/findings.js:29-31` and `app.js:330` on `main`. Weather is opt-in (`checkWeather`, a click). NEXT.md task 11: Manila, Aug 2026, NASA POWER index 0.66. | Launch lands in the wet season. A healthy system at PR 0.78 reads 0.52 in a month like that: red, twice, and the printed sheet points at the installer. That is the "blames the installer wrongly" case. | Fixed in `765de94` | When either month is on a typical-year basis, the question says so and that a cloudy stretch may explain part of the gap; the on-screen headline says "Check the weather before asking your installer." Flag rule and thresholds unchanged. Test fails before, passes after. | S |
| H-4 | Share readiness | No `og:*` tags, no preview image, no `twitter:card`, no canonical link. | `public/index.html:1-17` on `main` (title and description only). | LinkedIn and Facebook show a bare link or scrape their own text. The share is the launch. | Fixed in `5ed7e8f` | Open Graph and Twitter tags, `public/icons/og.png` (1200 x 630, from `scripts/gen-og.mjs`), `<link rel="canonical" href="https://myscnd.app/">`. Test checks tags and the image file. | S |
| H-5 | Claims and privacy | No statement that results are estimates and not an engineering, financial or legal opinion. Privacy copy covered inputs only: not the host seeing IPs, the theme in local storage, or that the feedback form stores name and email if given. | `public/index.html:549` footer on `main`; hero and explainer at `:50`, `:92`. | Credibility and RA 10173 transparency: the person running the site collects optional name and email through the form with no notice of it. | Fixed in `b1fc545` | Visible footer line on estimates, plus a "Privacy and limits" section that matches what the code does. 44 px summary, no overflow at 390 px light or dark. | S |
| M-1 | Abuse and cost | The production rate limiter does not block at the configured 100 per 10 s. | `docs/RATE-LIMITING.md` "Observed in production": 3 runs of 150 requests, all `200`, `x-limiter: ok`. | A flood is not throttled by our code. After H-2 a flood still counts against the page's Worker requests. | Open (Fred decided 2 Oct to keep it as a loose backstop) | Re-check **Security > WAF > Rate limiting rules**: Cloudflare has offered one rate limiting rule on Free plans; if it is there, add one on `/` per IP. Otherwise Workers Paid if traffic warrants. | S |
| M-2 | Client security | CSP carries `'unsafe-eval'` for Alpine's standard build. | `src/headers.js` `script-src`. | No injection path was found (below), so impact is limited today. It weakens the CSP as a second line if one appears. | Open | Move to the `@alpinejs/csp` build and register components with `Alpine.data`; inline expressions must become method names. | L |
| M-3 | Calculation integrity | Savings leave out export credit above the bill's variable charges, so credit carried to later bills is never counted. | `calc.js:284-288` (`savings`, `creditCap`), decided by Fred 1 Oct. | Owners who export a lot (export value above their variable charges) read behind the promised payback, and after a year the sheet raises the payback question. Direction of error: against the installer. | Open (decision) | Verify carry-over under the ERC net-metering rules and Meralco practice. Until then, add a caveat to the payback question whenever any bill had `uncountedCredit > 0`. | S |
| M-4 | Calculation integrity | Typical-year sun reads high in Manila (+3.9% on the annual mean against Global Solar Atlas), so PR reads about 4% low in the Meralco area. | `docs/NEXT.md:22` (task 1 check). `PR_BANDS.green = 0.75`, `calc.js:121`. | A healthy system at 0.78 shows about 0.75, on the green line, and more months slip to amber. No threshold changed (Fred's call). | Open (decision) | Either a regional correction to the grid against GSA, or a basis line on the sheet naming the known bias for Metro Manila. | M |
| M-5 | Claims | "everything you type stays in this browser" is not exact: the weather check sends the location (rounded) the owner picked. | `index.html:50`, `:92`. | A careful reader finds the exception in "What is sent?" and the footer, which undercuts the headline claim. | Open (changes meaning, so left for Fred) | "Your bills and kWh stay in this browser." | S |
| M-6 | Share readiness | No 404 page: unknown paths return an empty `404`. | `wrangler dev`: `/nope` 404, 0 bytes. | A mistyped or truncated link from a post shows a blank white page. | Fixed 2 Oct 2026 (NEXT.md task 17) | `public/404.html` with a link home, and `"not_found_handling": "404-page"` under `assets`. | S |
| M-7 | Privacy (RA 10173) | No identity of who runs SCND and no direct contact for data questions; the Google Form is the only path. | `index.html` footer; `app.js:55`. | Transparency gap for the optional name and email collected through the form. | Fixed 2 Oct 2026: footer line, pointing at the feedback form (NEXT.md task 17) | One line, for example "SCND is a personal project by Alfred Balaga. Data questions: <email>." | S |
| M-8 | Input handling | No guard for an implausibly low PR from a typo. European decimal style "1.250,5" reads as 1.2505 kWh, giving PR 0.00 "Low this month". | Headless Chromium, `de-DE` and `en-PH` locales. `"1,250"` is read correctly as 1250. | One red month from a typo; a second would raise the flag. | Open (threshold decision) | A "check numbers" state below a floor such as PR 0.30, like the existing 0.90 ceiling. | S |
| M-9 | Calculation integrity | Hybrids: export above PV yield is rejected as period misalignment before battery discharge is added. | `calc.js:267` runs before the battery terms at `:268`. Edge run: `energySplit({g:300,x:320,i:100,c:50,d:100})` returns an error, though S = 30. | A hybrid that discharges to the grid gets no savings and a misleading "dates do not line up" message. Rare in PH. | Open | For hybrids, test S = G − X − C + D only. Needs a test. | S |
| M-10 | Third parties | Cloudflare injects its Web Analytics beacon into the live page: `<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js/..." data-cf-beacon='{..."token":"3f24..."}'>`. It is not in the repo. Our CSP blocks it. | Live HTML with a browser user agent; headless Chromium console: "Refused to load the script 'https://static.cloudflareinsights.com/...' because it violates ... script-src". Lighthouse live: Best Practices 92 (`errors-in-console`, `inspector-issues`). | No data is sent today because the CSP blocks it, but every visit logs a CSP error, and the page served is not the page in the repo. If someone "fixes" the CSP to allow it, a third-party script runs that the privacy notice does not mention. | Fixed 2 Oct 2026: kept and disclosed (NEXT.md task 16) | Pick one. **Off (recommended, matches the privacy notice):** Analytics & Logs > Web Analytics > myscnd.app > Manage site > turn off automatic setup (or remove the site). **On:** keep it, add `https://static.cloudflareinsights.com` to `script-src` and `https://cloudflareinsights.com` to `connect-src`, and add one line to "Privacy and limits" (cookieless page-view counts by Cloudflare). CLAUDE.md allows an optional cookieless counter. | S |
| M-11 | Resilience | If one script fails to load, the page stays blank: `<main x-cloak>` is hidden until Alpine starts, and Alpine starts without the app if `js/app.js` failed. No `<noscript>` or fallback text. | Live run in headless Chromium: `js/app.js` failed (`ERR_TOO_MANY_RETRIES`, the sandbox proxy, not the site), Alpine logged "scnd is not defined", and the screen was empty. | On a weak mobile connection a visitor from Facebook sees a blank white page with no hint to reload. | Fixed 2 Oct 2026 (NEXT.md task 17) | A `<noscript>` line and a small static message outside `<main>` ("Loading. If this stays blank, reload the page.") hidden by app.js once it starts. | S |
| L-1 | Transport | Plain `http://myscnd.app/` is served as `200` with the full page, with no redirect to HTTPS, and there is no `Strict-Transport-Security` header. | Live: `curl -sI http://myscnd.app/` gives `HTTP/1.1 200 OK`, same ETag as HTTPS. | Low: `.app` is on the browser HSTS preload list, so browsers never send plain HTTP to it. Non-browser clients and link checkers can. | Fixed by Fred 2 Oct 2026: Always Use HTTPS and HSTS on | SSL/TLS > Edge Certificates: turn on **Always Use HTTPS** and **HSTS** (steps below). | S |
| L-2 | Headers | `x-limiter` diagnostic header on every Worker response. | `src/worker.js:42`. | Tells a visitor how the limiter behaves. No visitor data. | Open | Remove once the limiter question is closed. | S |
| L-3 | SEO | No `sitemap.xml`. `robots.txt` exists live but is Cloudflare's managed file (content-signal comments only, no `Disallow`, no sitemap line); it is not in the repo. | Live `/robots.txt` 200, 622 bytes; `/sitemap.xml` 404. | Minor. Search engines may crawl; Lighthouse SEO 100 live. | Open | Optional: a one-URL sitemap, and a `Sitemap:` line via Cloudflare's robots settings. | S |
| L-10 | Domain hygiene | DNSSEC is off: no DS record at the `.app` registry. No SPF, DMARC or MX record, so anyone can send mail claiming to be from myscnd.app. No CAA record. `www.myscnd.app` does not exist (NXDOMAIN). | `dns.google` lookups, 2 Oct 2026: NS `emely`/`ignat.ns.cloudflare.com`; DS empty; MX, TXT, CAA, `_dmarc` TXT empty; `www` status 3. | Spoofed "SCND" mail could reach people who saw the post. Someone typing `www.myscnd.app` gets a browser error. DNS answers are not signed. | Open (dashboard) | Steps in "Blockers before public share" item 5, plus a `www` record with a redirect to the apex (below). | S |
| L-9 | Third parties | Cloudflare adds `report-to` / `nel` headers (Network Error Logging, `success_fraction 0.0`): browsers report failed loads to `a.nel.cloudflare.com`. | Live response headers. | Failure reports only, sent to the host already named in the privacy notice. | Open (note only) | Nothing needed; it is part of "served by Cloudflare". | S |
| L-4 | Headers | No `X-Frame-Options`. | Headers above. | Covered by `frame-ancestors 'none'` in every current browser. | Open | Optional `X-Frame-Options: DENY`. | S |
| L-5 | Leakage | Employer names appear in two docs and in history since the first commit: CLAUDE.md:12 (rule 4) and docs/SPEC.md:148 (risk table). No employer data (plant, pyranometer, SCADA, documents) in any revision. | `git grep` over all 88 commits. | Not served (`docs/` and `CLAUDE.md` are outside `public/`), and the repo is private. Becomes visible if the repo is ever made public; "this time" reads badly out of context. | **Current files reworded 27 Nov 2026** (no employer name left in the tree). Older commits still carry the names; history not rewritten, Fred to decide (see NEXT.md, "Going public"). | If the repo stays private, nothing to do. Before making it public: reword the two lines (for example "Nothing from Fred's employer") in a normal commit, and decide whether history needs rewriting. | S |
| L-6 | Leakage | Personal Gmail address in 6 commit author fields. | `git log --format='%ae'`. | Visible only to repo collaborators while private. | Open | Use the GitHub noreply address in `git config user.email` going forward. | S |
| L-7 | Dependencies | Dev tooling is unpinned: `npx wrangler`, and `playwright-core` imported by `scripts/gen-icons.mjs` and `scripts/gen-og.mjs` with no `package.json`. | `scripts/*.mjs` imports. | Dev only, never shipped. A future major could break the scripts. | Open | Note tested versions in the script headers (wrangler 4.146.0 used here). | S |
| L-8 | Docs | `docs/NEXT.md:149` says `_headers` files do not apply under `run_worker_first`. True for the old config, not after H-2. | `docs/NEXT.md:149`. | Misleads the next change. | Fixed in this report commit (section 14 note) | | S |

## Update, 2 Oct 2026 (after the share prep)

Everything on the branch is merged and live. Fred confirmed: no CSP error for the beacon on the live page, Always Use HTTPS and HSTS on, the privacy notice on the Google Form, the link scraped in Facebook's Sharing Debugger and LinkedIn's Post Inspector, and the QR Ph image scanned from the live page. M-6, M-7 and M-11 are fixed (NEXT.md task 17). Still open and waiting on Fred's decision: M-3, M-4, M-5, M-8, M-9, M-2, L-5.

**Update, 31 Oct 2026:** M-3, M-4 (disclosed, not corrected), M-5, M-8 (floor 0.30) and M-9 are fixed (NEXT.md task 19). Still open: M-2, L-5.

## Blockers before public share

**Fixed on the branch:** H-1 to H-5 (above). No Blocker-level finding existed.

**Only you can do these (dashboard, DNS, deploy):**

1. **Merge and deploy** `pre-launch-fixes`, then run the post-deploy checklist below. H-2 and H-4 only take effect once deployed.
2. **Confirm workers.dev and preview URLs are off in the dashboard.** Workers & Pages > `scnd` > Settings > Domains & Routes. `workers.dev` should read Disabled and Preview URLs Disabled, matching `wrangler.jsonc`. If workers.dev still answers, toggle it off there. Disabling (rather than redirecting) is right here: there is nothing on that address worth keeping, and the canonical tag now points search engines at myscnd.app either way.
3. **Decide on the Cloudflare Web Analytics beacon (M-10).** Analytics & Logs > Web Analytics > myscnd.app. Turning it off matches the privacy notice as written; keeping it needs a CSP change and one line in the notice (ask me and I will make both).
4. **Re-scrape the link before posting.** Facebook Sharing Debugger (https://developers.facebook.com/tools/debug/): enter https://myscnd.app/, press "Scrape Again". LinkedIn Post Inspector (https://www.linkedin.com/post-inspector/): inspect the same URL. Both cache previews, and any test share before this deploy would show the old, bare preview.
5. **Domain hygiene (could not check from here):**
    - DNSSEC: Domain Registration > Manage Domains > myscnd.app > Configuration > DNSSEC: Enable (Cloudflare Registrar sets the DS record itself).
    - WHOIS: Cloudflare Registrar redacts contact details by default. Confirm under the domain's Contacts page.
    - HSTS (L-1): SSL/TLS > Edge Certificates > HTTP Strict Transport Security: Enable, max-age 12 months, include subdomains on, preload optional. Also confirm "Always Use HTTPS" is on.
    - `www` (L-10): DNS > Records > Add: `CNAME www myscnd.app`, proxied. Then Rules > Redirect Rules > Create: when hostname equals `www.myscnd.app`, redirect 301 to `concat("https://myscnd.app", http.request.uri.path)`.
    - Email: if myscnd.app will not send or receive mail, publish "no mail" records so nobody can spoof it. In DNS > Records add: `TXT @ "v=spf1 -all"`, `TXT _dmarc "v=DMARC1; p=reject; sp=reject; adkim=s; aspf=s"`, and a null MX `MX @ "." priority 0`. If you set up Email Routing later, replace these with what Cloudflare generates.
6. **Watch the request count** for the first 48 hours after posting: Workers & Pages > `scnd` > Metrics. After H-2 you should see roughly one Worker request per visit.

No credential was found anywhere, so there is nothing to rotate.

## Verified OK

What was checked, with the method.

- **Secrets, full history.** `git grep` over every revision (88 commits, all branches) for key, token, password, bearer, AWS/GitHub/Slack/OpenAI key shapes, `CLOUDFLARE_`, `account_id`, PEM headers: nothing. No `.env`, `.dev.vars`, `.pem`, `.key` or `.map` file in any revision. The only email in tracked content is the `you@alfredbalaga.com` placeholder in `docs/CUSTOM-DOMAIN.md`. GitHub secret scanning is not enabled on the repo (no Advanced Security), so this was by pattern only.
- **Employer data.** No plant data, pyranometer data, SCADA export or company document in any revision. Employer names only as in L-5. None in `public/`.
- **Repo visibility.** Private (GitHub API).
- **Dependencies.** No `package.json` or lockfile: zero runtime packages. `public/vendor/alpine.min.js` minus its one-line header is byte-identical to `alpinejs@3.17.4/dist/cdn.min.js` from npm (sha256 `2325193...df31c`), which is the current `latest` tag. All 9 fonts are valid WOFF2 with SIL OFL licence files beside them. No CDN, no external script, so SRI does not apply.
- **Third-party requests.** Headless Chromium, 390 px: landing makes 14 requests, all to our own origin; "Try an example" adds one (`/data/ph-grid.json`). Zero external requests until "Check the weather". CSP `connect-src` allows only self, Open-Meteo satellite and NASA POWER.
- **Storage.** After landing and the example: `localStorage` empty, `sessionStorage` empty, `document.cookie` empty. The theme key is written only when a theme is picked (`app.js:687`).
- **XSS.** Two `x-html` sinks (`index.html:280` dial, `:453` chart). Both build SVG from numbers and from dates that `data.js` validates against `^\d{4}-\d{2}-\d{2}$`; the free-text `place` field (max 60 chars) is only rendered with `x-text`. Save-file parsing copies only known fields and rejects non-numbers, bad dates, wrong versions and files over 1 MB.
- **Coordinates.** Rounded to 0.1° at setup (`app.js:127`) and on geolocation (`:106`); a loaded save file goes through the same rounding before any weather call.
- **Worker and headers (`wrangler dev`, after fixes).** Page: CSP, `nosniff`, `no-referrer`, `Permissions-Policy` present. Static files: `nosniff` and `no-referrer` from `_headers`, no `x-limiter` (so they skip the Worker). `/_headers`, `/.git/config`, `/wrangler.jsonc`, `/src/worker.js` all 404. No `Access-Control-Allow-Origin` on any response. No debug flags or `observability` block in `wrangler.jsonc`; `workers_dev: false`, `preview_urls: false`.
- **Calculation core.** `poaMonth` incidence angle matches Duffie and Beckman eq. 1.6.2 (south = 0, west positive, morning hour angle negative); existing pvlib fixtures agree within 0.07%. PR is final yield over reference yield (E / (kWp x H_POA), G_ref 1 kW/m²), the IEC 61724-1 definition, not temperature-corrected, and against a typical year unless the weather check is used, which the screen and sheet both say. Hybrids use PV yield. Edge cases run: 0 kWh gives PR 0 (red), negative and blank give no result plus a field error, 1e9 kWh gives the "check numbers" state, kWp 0 is rejected, reversed or equal dates are rejected, export above import works, export above generation gives a plain misalignment message, I = 0 gives no savings rather than a division by zero. `node --test`: 124 of 124 pass after the fixes (120 before; 4 added).
- **Rates.** No tariff is hard-coded in app logic. The one Meralco figure (PHP 9.70/kWh, Sep 2026) is in the example only, dated in a code comment, and the example banner says the numbers are made up. GMA reported the July 2026 generation charge at PHP 9.2504/kWh, so 9.70 for September is plausible.
- **UX and accessibility (local).** Lighthouse mobile, local build: Performance 99, Accessibility 100, Best Practices 100, SEO 100; LCP 1.8 s, TBT 50 ms, 104 KiB transferred. No horizontal overflow at 390 px. Tab order on landing follows the visual order. New footer summary is 44 px tall. Impeccable detector: 40 hits, the same classes earlier critique runs triaged as cross-theme print tokens and the deliberate graph-paper backdrop; not re-triaged one by one. Taglish strings render (system font); the pixel face is kept off them.
- **Example and live-region flows.** No console errors or page errors in any scripted run (landing, example, two-low-months, footer open in light and dark).

## Copy review (no-ai-slop)

The UI copy is already plain: no em dashes in `public/` or the README, none of the banned words, no slop openers or kickers. Flagged lines:

| Where | Before | After | Status |
| --- | --- | --- | --- |
| README.md:5 | "SCND says whether the system is producing what it should, was it the weather or the system, what the export credit is worth..." | "...whether a shortfall was the weather or the system, what the export credit is worth..." | Applied (`1145678`) |
| README.md, F5 to F7 row | "Energy split, true savings against the promised payback" | "Energy split, savings against the promised payback" ("true" claims more than the sum does) | Applied (`1145678`) |
| index.html:50, :92 | "everything you type stays in this browser" | "Your bills and kWh stay in this browser." | Proposed only: it changes the claim (M-5) |
| app.js:329 | "A bit low. Worth watching, not worrying." | Kept. It is a contrast pattern, but it is short, in voice, and does a job (de-escalating amber). | No change |
| app.js:330 (H-3) | "Low two months in a row. Worth asking your installer." | Unchanged when weather-adjusted; "Low two months in a row. Check the weather before asking your installer." when not | Applied as part of H-3 |

New copy written for H-5 was checked against the same rules: no em dashes, no filler, units on numbers, claims match the code.

## Live check (2 Oct 2026, after myscnd.app was allowed)

Run against https://myscnd.app, which still serves `main` (the live `index.html` sha256 equals `origin/main:public/index.html`). Headless Chromium at 390 px through the sandbox proxy (TLS is re-signed by that proxy, so the real certificate could not be inspected).

- **Headers on `/`:** CSP, `nosniff`, `no-referrer`, `Permissions-Policy`, `x-limiter: ok`, `cache-control: public, max-age=0, must-revalidate`. No HSTS. No `Access-Control-Allow-Origin`.
- **Transport:** HTTPS over HTTP/2 with `alt-svc: h3`. Plain HTTP serves 200 (L-1).
- **Static files:** all 200 with the right types (`text/javascript`, `application/json`, `font/woff2`, `image/svg+xml`, `application/manifest+json`), Brotli-compressed except woff2, and all currently carry `x-limiter: ok`, which confirms H-2 on the live config (every file runs the Worker today).
- **Private paths:** `/.git/config`, `/wrangler.jsonc`, `/src/worker.js`, `/sitemap.xml`, `/nope` all 404 with an empty body (M-6). `/icons/og.png` 404 as expected until H-4 is deployed.
- **Third parties on load:** one, the injected Cloudflare beacon, blocked by CSP (M-10). Nothing else leaves the origin until "Check the weather".
- **Real flow, by hand (Manila, 5.5 kWp, 5 kW, Aug 2026, 420 kWh):** "PR 0.57, low. Low this month. One month is not enough to call a fault. 420 kWh made, against about 556 kWh for a healthy system in that sun (24% under)." Matches calc: no errors.
- **Weather check (live, example system):** two calls, to `satellite-api.open-meteo.com` and `power.larc.nasa.gov`, both with `latitude=14.6` (rounded); finished in about 9 s with status done.
- **Findings sheet:** example system, after the weather check: Q1 one low month, Q2 weather split. Printed to PDF: **1 page on A4 and 1 page on Letter**, text clean, PHP amounts, footer disclaimer present.
- **Storage:** `localStorage` and cookies empty after the full flow. No horizontal overflow at 390 px.
- **Lighthouse, live, mobile** (through a US proxy, so timings are not what a PH phone sees): Performance 95, Accessibility 100, Best Practices 92 (M-10), SEO 100. FCP 2.1 s, LCP 2.4 s, TBT 40 ms, CLS 0, 116 KiB.

### DNS (2 Oct 2026, via dns.google)

| Record | Value | Note |
| --- | --- | --- |
| NS | `emely.ns.cloudflare.com`, `ignat.ns.cloudflare.com` | Cloudflare, as expected |
| A / AAAA | `104.21.17.225`, `172.67.178.159` / `2606:4700:3036::ac43:b29f`, `2606:4700:3031::6815:11e1` | Cloudflare proxy addresses; origin not exposed (Workers have none) |
| DS / DNSKEY | none | DNSSEC off (L-10) |
| MX, TXT (SPF), `_dmarc` TXT | none | No mail policy (L-10) |
| CAA | none | Any CA may issue (L-10, minor) |
| `www` | NXDOMAIN | (L-10) |

## Compliance check (legal:compliance-check)

The installed plugins do not load into a session that is already running, so this follows the `compliance-check` skill as published in `anthropics/knowledge-work-plugins` (`legal/skills/compliance-check/SKILL.md`), applied to Philippine law. It is not legal advice, and a Philippine lawyer should review it before anything here is relied on.

### Compliance Check: public launch of SCND (free web tool, Philippine owners)

**Summary: Proceed with conditions.** The design keeps compliance exposure small: owner inputs never reach a server, and the only personal data SCND as operator receives is optional name and email through the feedback form. The conditions are a contact point for data questions, the M-10 beacon decision, and keeping the not-advice wording.

**Applicable regulations and policies**

| Regulation / policy | Relevance | Key requirements |
| --- | --- | --- |
| RA 10173 Data Privacy Act 2012 and its 2016 IRR | Fred is the personal information controller for feedback-form answers (optional name, email, free text). IP addresses seen by Cloudflare as host. Bill and kWh inputs stay on the device and are not processed by SCND. | Transparency, legitimate purpose and proportionality (Sec. 11); data subject rights including the right to be informed (Sec. 16); reasonable security (Sec. 20). |
| NPC Circular 2022-04 (registration of DPOs and data processing systems, effective 11 Jan 2023) | Registration is required only at 250 or more employees, sensitive personal information of 1,000 or more people, or processing likely to pose risk to data subjects. | None of the three applies to optional name and email in a feedback form, so registration is not required on current facts. |
| NPC Circular 16-03 (personal data breach management) | Applies if the feedback responses leak. | Keep the form's sharing settings private; know that notification duties exist if a breach could lead to harm. |
| RA 10175 Cybercrime Prevention Act (cyber libel) | The findings sheet could be read as accusing an installer. | Already mitigated: questions, not verdicts; no installer names stored or shown; H-3 adds the weather caveat. Keep it that way. |
| Employment terms with Fred's employer | Side project in the same field. | Not a statute. CLAUDE.md rule 4 and the SPEC risk table already address it; check the employment contract's outside-work and IP clauses yourself. |

**Requirements**

| # | Requirement | Status | Action needed |
| --- | --- | --- | --- |
| 1 | Privacy notice at or before collection (feedback form) | Met on the site (H-5); **Unknown** in the form itself | Paste a two-line notice at the top of the Google Form (purpose: improve SCND; who reads it; how to ask for deletion). |
| 2 | Identity of the controller and a contact for data requests | **Not met** | M-7: one line naming who runs SCND and an email for data questions. |
| 3 | Notice matches practice | **Not met while the beacon is injected** | M-10: turn off Web Analytics, or disclose it and allow it in the CSP. |
| 4 | Proportionality (collect only what is needed) | Met | Name and email are optional; the footer asks people to leave out bill and account numbers. |
| 5 | Security of collected data | Met in the app; **Unknown** for the form | Limit form response access to Fred's Google account; turn on 2-step verification. |
| 6 | Retention | **Unknown** | Decide a period (for example, delete feedback responses after 12 months) and say so in the form notice. |
| 7 | Not-advice disclaimer | Met (H-5, sheet footer) | Keep the wording; do not soften it in later copy edits. |
| 8 | NPC registration | Not required on current facts | Re-check if SCND ever stores user data or grows past the thresholds. |

**Risk areas**

| Risk | Severity | Mitigation |
| --- | --- | --- |
| An owner relies on a red result to dispute with an installer, and the result was weather or a typo | Medium | H-3 (weather caveat), M-8 (typo floor), sheet framed as questions with limits. |
| Privacy notice says less than what happens (injected beacon) | Medium | M-10. |
| A data request arrives with no address to send it to | Low | M-7. |
| Cyber libel complaint from an installer | Low | No names, question framing, keep "not a verdict" wording. |

**Recommended actions:** 1) M-10 decision. 2) M-7 contact line. 3) Two-line notice and retention period on the Google Form.

**Approvals needed:** none required by law on current facts. Your own call on naming yourself (M-7).

**Further review recommended:** a Philippine data-privacy lawyer for a short read of the "Privacy and limits" text and the form notice, if you want certainty before the network share. Check the employer contract yourself.

Sources for the registration thresholds: [NPC Circular 2022-04](https://privacy.gov.ph/wp-content/uploads/2023/05/Circular-2022-04.pdf), [Baker McKenzie summary](https://insightplus.bakermckenzie.com/bm/data-technology/philippines-new-npc-circular-on-registration-of-data-protection-officers-and-data-processing-systems-takes-effect_1).

## Dependency vetting

The `dependency-evaluator` plugin did not load into this session either. Same checks done by hand: SCND ships one third-party file, Alpine.js. Provenance: byte-identical to `alpinejs@3.17.4/dist/cdn.min.js` from npm (the current `latest`, published Sep 2026). Licence: MIT, named in the vendored header. Maintenance: active (release in the last month). Typosquat risk: none, it is vendored, not installed. Pinning: fixed by being a committed file. Fonts: four OFL families, licence files committed. Dev tooling (wrangler, playwright-core) is unpinned (L-7) and never shipped.

## Could not verify

- **workers.dev address** (`scnd.<account>.workers.dev`): the sandbox proxy refuses it. **Fred checked it by hand on 2 Oct 2026: it no longer shows the app**, so `workers_dev: false` is live.
- **WHOIS privacy:** `rdap.org` redirects `.app` lookups to `pubapi.registry.google`, which is not on the allow-list. Fred's registry search shows the domain as registered (taken), which confirms registration but not whether contact details are redacted. Check in Cloudflare: Domain Registration > myscnd.app > Contacts (Cloudflare Registrar redacts by default).
- **Real TLS certificate:** the sandbox proxy re-signs TLS. Check in a browser (padlock > certificate: issued for myscnd.app by Google Trust Services or Let's Encrypt via Cloudflare).
- **Link previews** on Facebook and LinkedIn: need H-4 deployed and their debuggers, which need your login.
- **Certificate transparency** (`crt.sh`): not on the allow-list. Low value; the certificate is Cloudflare-managed.
- **Cloudflare dashboard state** (toggles, metrics, rate limiting rule availability): no API access.
- **iPhone Safari** rendering, number keyboards and printing of the findings sheet: no WebKit here. NEXT.md says Fred tested Safari on a real iPhone; the new footer section and preview tags have not been.
- **Meralco's September 2026 generation charge** of PHP 9.70/kWh: only the July 2026 figure (PHP 9.2504) was found.
- **ERC and Meralco rules on carried-over export credit** (M-3): not researched to a primary source.
- **Whether production would reject H-1's old exports on the next upload**: production accepted them as of 2 Oct, so this is a risk, not an observed failure.

## Post-deploy checklist

Run in order after merging and deploying `pre-launch-fixes`.

1. Deploy finished: Workers & Pages > `scnd` > Deployments shows the new version as active on myscnd.app.
2. Cloudflare beacon (M-10): `curl -s -A 'Mozilla/5.0 Chrome/129' -H 'accept: text/html' https://myscnd.app/ | grep -c cloudflareinsights` returns `0` after you turn Web Analytics off (or `1` if you chose to keep and disclose it, with the CSP updated).
3. Page headers:
   `curl -sI https://myscnd.app/ | grep -iE 'content-security|x-content-type|referrer-policy|permissions-policy|x-limiter|strict-transport'`
   Expect CSP, `nosniff`, `no-referrer`, `Permissions-Policy`, `x-limiter: ok` (and HSTS if you enabled it).
4. Static files skip the Worker (H-2):
   `for p in /app.css /js/app.js /vendor/alpine.min.js /icons/og.png /data/ph-grid.json; do curl -sI https://myscnd.app$p | grep -iE '^HTTP|x-limiter|x-content-type'; done`
   Expect `200`, `nosniff`, and **no** `x-limiter` line.
5. HTTPS (after turning on Always Use HTTPS, L-1): `curl -sI http://myscnd.app/` returns a 301 or 308 to `https://`. Today it returns 200.
6. workers.dev is off: `curl -sI https://scnd.<your-subdomain>.workers.dev/` should not return the app (expect an error or 404).
7. Not-found and private paths: `curl -s -o /dev/null -w '%{http_code}\n' https://myscnd.app/_headers` and `.../wrangler.jsonc` both `404`.
8. Preview image: open https://myscnd.app/icons/og.png. Then Facebook Sharing Debugger and LinkedIn Post Inspector for https://myscnd.app/ (Scrape Again). Expect the dark card, title "SCND: is your rooftop solar doing its job?".
9. On your phone over mobile data: load the page, "Try an example", open "Privacy and limits" in the footer, set both bills' solar kWh to 250 and check the second reads "Check the weather before asking your installer", open the findings sheet and confirm Q1 mentions the typical year, then print or save as PDF.
10. Browser dev tools (laptop), Network tab with cache disabled: only myscnd.app requests on load, no 404s, no console errors.
11. After the share: Workers & Pages > `scnd` > Metrics, daily requests should track visits one to one, well under 100,000.
