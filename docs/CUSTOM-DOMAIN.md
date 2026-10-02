# Custom domain: myscnd.app

**Decision (Fred, 2 Oct 2026): path B.** SCND goes live at https://myscnd.app, a new domain bought in Cloudflare Registrar and attached to the `scnd` Worker as a Custom Domain, production only. Beta testers keep using `scnd.<account>.workers.dev` for now.

## What we did

1. Bought `myscnd.app` in Cloudflare (Domain Registration). Cloudflare adds the domain to the account with its DNS already set up.
2. Attached it to the `scnd` Worker: **Workers & Pages**, **scnd**, **Settings**, **Domains & Routes**, **Add**, **Custom Domain**. Cloudflare creates the DNS record and the HTTPS certificate.
3. Recorded it in `wrangler.jsonc`: `"routes": [{ "pattern": "myscnd.app", "custom_domain": true }]`. Without it, a deploy from Git could remove a domain that exists only in the dashboard.
4. Set `"preview_urls": false`. Preview URLs bypass the custom domain and are an extra public surface.
5. Left `workers_dev` at its default (on) because beta testers still use the workers.dev link. **When beta ends, set `"workers_dev": false`** and tell testers to use myscnd.app.

Nothing existing is touched: no nameservers changed, no records moved.

## Why not alfredbalaga.com (path C, rejected)

A Worker can only answer for a name if Cloudflare keeps the DNS for that domain. `alfredbalaga.com` is registered at Porkbun, and its DNS is split between a Porkbun zone and a Hostinger zone. Moving it to Cloudflare means untangling both and copying every record (including email) first. That is a risk to the author site and email for no gain to the app. A new domain avoids all of it.

Separate cleanup, not part of this change: `alfredbalaga.com` has a duplicate `_dmarc` record. Fix it in whichever zone is authoritative for that name.

## Still on the author site

Add a normal link or button on alfredbalaga.com that goes to https://myscnd.app. Do not embed the app in an iframe: printing the findings sheet from inside an iframe is awkward.

## Check it worked

- https://myscnd.app opens with a padlock, on a phone over mobile data and on a laptop.
- Enter a sample bill and print the findings sheet.
- The workers.dev address still works while `workers_dev` is on.
- Run the rate-limit check from `docs/RATE-LIMITING.md` against myscnd.app.
- Open a version preview URL: it should no longer exist (Preview URLs off, in both `wrangler.jsonc` and the dashboard).
- In Cloudflare, **Workers & Pages**, **scnd**, **Metrics**: requests are counted. The Worker runs first on every request, so watch the daily count against the Free plan limit of 100,000.

## Things that do not change

The rate limiter, the Worker code and the app are the same on any address. Saved files from the app do not depend on the address, so a file saved on workers.dev loads on myscnd.app.
