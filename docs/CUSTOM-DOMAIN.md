# Putting SCND on your own address

Today SCND lives at `scnd.<your-account>.workers.dev`. That address is fine for a beta with people you know. This guide is for when you want something like `solar.alfredbalaga.com`.

Written 29 Sep 2026 from memory of how Cloudflare works. I could not open Cloudflare's docs from the build environment, so menu names may differ slightly. If a step does not match your screen, trust your screen and check Cloudflare's "Workers, Custom Domains" page.

## Three ideas first

- **DNS** is the phone book: it says which server answers for a name like `solar.alfredbalaga.com`.
- **Nameservers** say which company keeps that phone book for your whole domain. Yours are at Hostinger today.
- A Cloudflare Worker can only answer for a name if **Cloudflare keeps the DNS for that domain**. A `CNAME` from Hostinger to a Worker will not work.

So there are three ways to get a custom address.

## Which path

| Path | What you do | Cost | Risk | Good for |
| --- | --- | --- | --- | --- |
| A. Stay on `workers.dev` | Nothing | Free | None | The beta. Recommended for now |
| B. Buy a new domain in Cloudflare | Register a name such as `scnd.app` or `myscnd.com` in the Cloudflare dashboard, attach it to the Worker | About USD 10 to 15 a year (price depends on the ending) | Very low. Nothing existing is touched | A clean brand for the app, and no risk to your author website or email |
| C. Move `alfredbalaga.com` DNS to Cloudflare | Add the domain to Cloudflare, change nameservers at Hostinger, attach `solar.alfredbalaga.com` | Free (Cloudflare Free plan) | **Medium.** Your Website Builder site, and any email on that domain, depend on the DNS records | You want the app under your own name |

My recommendation: A for the beta, then B or C when you are ready to share widely. B is the safest way to get a real address. Do C only after you have checked the two things in "Before you start with path C".

## Path B: a new domain bought in Cloudflare

1. Log in to the Cloudflare dashboard. Go to **Domain Registration** (or **Registrar**), then **Register Domains**.
2. Search for a name, buy it. Cloudflare sells at cost. The domain is added to your account automatically, with Cloudflare DNS already set up.
3. Go to **Workers & Pages**, open the **scnd** Worker, then **Settings**, then **Domains & Routes**, then **Add**, then **Custom Domain**.
4. Type the name, for example `scnd.app` or `www.scnd.app`, and confirm. Cloudflare creates the DNS record and the HTTPS certificate for you.
5. Wait a few minutes, then open the address on your phone. Go to "Check it worked" below.

## Path C: `solar.alfredbalaga.com`

### Before you start with path C

Check both of these first. If either is a "no", stop and use path A or B.

1. **Can you change the nameservers for `alfredbalaga.com` at Hostinger while the Website Builder is connected?** In hPanel, open the domain and look for **DNS / Nameservers**. If the option is locked or greyed out, Hostinger is not allowing it. Ask Hostinger support.
2. **Do you use email on this domain** (for example `you@alfredbalaga.com`)? If so, write down every `MX` and `TXT` record before you move anything. If those records are not copied to Cloudflare, your email stops.

### Steps

1. **Write down your current DNS records.** In hPanel, open **DNS Zone Editor** and take a screenshot or copy every record (types A, AAAA, CNAME, MX, TXT). This is your undo list.
2. In Cloudflare, choose **Add a domain**, enter `alfredbalaga.com`, and pick the **Free** plan.
3. Cloudflare scans the existing DNS and shows a list. **Compare it line by line with your screenshot** and add anything missing, especially `MX` and `TXT` (email), and whatever points your Website Builder site at Hostinger. Leave those records set to **DNS only** (grey cloud) so Hostinger's site keeps working as before.
4. Cloudflare shows you two nameservers. In hPanel, replace the domain's nameservers with those two.
5. Wait. This can take from a few minutes to a day. Cloudflare emails you when the domain is **Active**. Check that `alfredbalaga.com` and your email still work.
6. Now attach the app: **Workers & Pages**, open the **scnd** Worker, **Settings**, **Domains & Routes**, **Add**, **Custom Domain**, type `solar.alfredbalaga.com`. The name must not already have a DNS record. Cloudflare creates the record and the certificate.
7. Optional, to keep this in the repo: add a route to `wrangler.jsonc`, then push. Do this only after the domain is Active in Cloudflare, or the deploy will fail.

```
"routes": [{ "pattern": "solar.alfredbalaga.com", "custom_domain": true }]
```

### Undo

Put the old nameservers back in hPanel. Within a few hours everything returns to how it was. Your screenshot from step 1 is the reference.

## The doorway on alfredbalaga.com

Add a normal button or link on your author site that goes to the app address. Do not embed the app in an iframe: printing the findings sheet from inside an iframe is awkward.

## Check it worked

- The address opens over `https` with a padlock, on your phone and laptop.
- The old `workers.dev` address still works. It is fine to leave it on.
- Run the rate-limit check from `docs/RATE-LIMITING.md` against the new address.
- In Cloudflare, **Workers & Pages**, **scnd**, **Metrics**: requests are being counted. The Worker runs first on every request, so watch the daily count against the Free plan limit of 100,000.

## Things that do not change

The rate limiter, the Worker code and the app are the same on any address. Saved files from the app do not depend on the address. A person who saved a file on the `workers.dev` address can load it on the new one.
