# Weather proxy on a Worker: investigation

Ticket #53, 14 Nov 2026. Investigation only: no code was written. Fred decides.

## The idea

Today "Check the weather" makes the visitor's browser call Open-Meteo (satellite) and NASA POWER directly, so each service sees the visitor's IP address with the rounded location. A Worker route such as `/api/weather?lat=14.6&lon=121.0` could call both, cache the answer at the edge per point per day, and return it. The services would see only Cloudflare, and the CSP's `connect-src` could shrink to `'self'` plus the analytics endpoint.

## Findings

1. **It needs a rule change.** CLAUDE.md rule 2 (rewritten 14 Nov 2026, ticket #37) allows a Worker "only to proxy a public data source that blocks browser calls". Both sources answer browser calls today (checked live on 13 and 14 Nov 2026), so this proxy is outside the rule as written.
2. **Open-Meteo's terms could not be read from here.** This session's network policy refuses `open-meteo.com` (only the API host `satellite-api.open-meteo.com` is allowed), so the terms, licence and pricing pages were not fetched. From memory, not verified: the free API is for non-commercial use, with a daily call limit around 10,000, and the data is CC BY 4.0, which asks for attribution. Whether proxying and caching are allowed, and whether a site with a tip link counts as non-commercial, must be read from the pages themselves before anything is built.
3. **NASA POWER does not address it.** Its referencing and API pages (read 14 Nov 2026) name no licence, no rate limit (only a `429 Too Many Requests` error code) and nothing on caching or proxying. They ask for attribution in publications ("The data was obtained from National Aeronautics and Space Administration (NASA) Langley Research Center's Prediction Of Worldwide Energy Resources (POWER) project funded through the NASA Earth Science Division.") and request notification "if POWER data is transmitted to other researchers".
4. **It fits the Free plan.** CPU time excludes waiting on `fetch()` (Cloudflare limits page, read 14 Nov 2026), so a Worker that streams the two upstream bodies through without parsing them stays far under 10 ms. Each check is one or two Worker requests against the 100,000 a day; pages stay static assets (rule 2), so only weather checks count.
5. **Abuse is containable.** Accept only `lat` and `lon` with one decimal inside the grid box (4.5 to 21.0, 116.5 to 127.0), fix the date range in the Worker, forward nothing else, and answer `400` otherwise. That caps the cache at about 17,000 keys and stops use as an open proxy. No logging.
6. **The privacy gain is real but small.** The services would stop seeing visitors' IP addresses. They already receive only a rounded location and a date range, and "Privacy and limits" discloses the call. A proxy also concentrates every visitor's checks on Cloudflare's addresses, which makes hitting Open-Meteo's free limit more likely, not less, once the site is busy.
7. **It adds a failure point.** If the Worker or its quota fails, the check fails for everyone. Falling back to direct calls would keep the IP exposure and the wider CSP, so the gain only holds with no fallback.
8. **Attribution, today.** Separate from the proxy: the app names both sources in "What is sent?" and on the findings sheet, but not in the form either source asks for (CC BY 4.0 credit for Open-Meteo, from memory; the NASA sentence above for publications). Worth a line in "Privacy and limits" or the method guide once the Open-Meteo wording is read.

## Recommendation

**Do not build it now.** The rule as written does not allow it, the Open-Meteo terms are unread, and the gain (IP addresses kept from two public science services that already get only a rounded point) is smaller than the new failure point and the shared rate limit. Revisit if either source starts blocking browser calls (the case rule 2 already covers) or if Open-Meteo asks for server-side use.

**Fred, to decide:** whether to read Open-Meteo's terms yourself (or let a session reach `open-meteo.com`), and whether to add attribution lines for both sources (finding 8).
